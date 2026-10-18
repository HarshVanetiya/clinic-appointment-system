/**
 * Booking logic against a real Postgres (the exclusion constraint and row locks
 * are the point, so nothing here is mocked).
 */
import { and, eq, ne, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import * as s from '@/db/schema'
import { seed } from '@/db/seed'
import { signBookingToken } from '@/lib/tokens'
import { wallToUtc } from '@/lib/time'
import { getAvailability } from '@/server/availability'
import { cancelByToken, createBooking, rescheduleBooking, resolveManageToken, setAttendance } from '@/server/bookings'
import { getSettings } from '@/server/queries'

// Monday 19 Oct 2026, 06:00 IST.
const NOW = Date.parse('2026-10-19T00:30:00Z')
const TZ = 'Asia/Kolkata'
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(wallToUtc(date, h! * 60 + m!, TZ).ms)
}
const SECRET = process.env.BOOKING_TOKEN_SECRET!

let ids: Awaited<ReturnType<typeof seed>>
const patient = (n: number) => ({ name: `Test Patient ${n}`, email: `patient${n}@example.com`, phone: '+919876543210', notes: '' })
const service = (slug: string) => ids.serviceBySlug.get(slug)!
const therapist = (slug: string) => ids.therapistBySlug.get(slug)!

beforeAll(async () => {
  ids = await seed(db, { now: NOW, withBookings: false })
})

beforeEach(async () => {
  await db.delete(s.bookings)
})

afterAll(async () => {
  await db.$client.end()
})

const countActive = async () =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(s.bookings).where(ne(s.bookings.status, 'cancelled')))[0]!.n

describe('no double booking', () => {
  it('20 simultaneous requests for the same therapist + slot → exactly one booking', async () => {
    const start = at('2026-10-20', '10:00')
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createBooking({ serviceId: service('initial-assessment').id, therapist: therapist('ananya-rao').id, start, patient: patient(i), source: 'online', now: NOW }),
      ),
    )
    const ok = results.filter((r) => r.ok)
    const taken = results.filter((r) => !r.ok && r.code === 'slot_taken')
    expect(ok).toHaveLength(1)
    expect(taken).toHaveLength(19)
    expect(await countActive()).toBe(1)

    // Losers get useful alternatives near the requested time, none of them the taken slot.
    const first = taken[0]!
    if (first.ok || first.code !== 'slot_taken') throw new Error('unreachable')
    expect(first.alternatives.length).toBeGreaterThan(0)
    expect(first.alternatives.every((a) => a.start !== start.getTime())).toBe(true)
  })

  it('"any available" races fill each free therapist exactly once', async () => {
    const start = at('2026-10-20', '10:00') // Ananya, Kabir and Meera all work then
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createBooking({ serviceId: service('initial-assessment').id, therapist: 'any', start, patient: patient(i), source: 'online', now: NOW }),
      ),
    )
    const ok = results.flatMap((r) => (r.ok ? [r.booking] : []))
    expect(ok).toHaveLength(3)
    expect(new Set(ok.map((b) => b.therapistId)).size).toBe(3)
    expect(await countActive()).toBe(3)
  })

  it('the database itself rejects overlapping rows (exclusion constraint)', async () => {
    const base = {
      serviceId: service('follow-up').id,
      therapistId: therapist('kabir-menon').id,
      patientName: 'Raw',
      patientEmail: 'raw@example.com',
      patientPhone: '+919876543210',
      pricePaise: 1,
      durationMin: 45,
    }
    await db.insert(s.bookings).values({ ...base, reference: 'NP-RAW001', startsAt: at('2026-10-20', '11:00'), endsAt: at('2026-10-20', '11:45'), blockedUntil: at('2026-10-20', '12:00') })
    // Starts inside the first booking's buffer (11:45–12:00).
    await expect(
      db.insert(s.bookings).values({ ...base, reference: 'NP-RAW002', startsAt: at('2026-10-20', '11:50'), endsAt: at('2026-10-20', '12:35'), blockedUntil: at('2026-10-20', '12:50') }),
    ).rejects.toMatchObject({ cause: { code: '23P01' } })
    // Back-to-back at exactly blocked_until is fine (half-open range).
    await db.insert(s.bookings).values({ ...base, reference: 'NP-RAW003', startsAt: at('2026-10-20', '12:00'), endsAt: at('2026-10-20', '12:45'), blockedUntil: at('2026-10-20', '13:00') })
    // Cancelled rows don't count.
    await db.update(s.bookings).set({ status: 'cancelled' }).where(eq(s.bookings.reference, 'NP-RAW001'))
    await db.insert(s.bookings).values({ ...base, reference: 'NP-RAW004', startsAt: at('2026-10-20', '11:00'), endsAt: at('2026-10-20', '11:45'), blockedUntil: at('2026-10-20', '12:00') })
    expect(await countActive()).toBe(2)
  })

  it('rejects slots that break the rules even without a race', async () => {
    const offGrid = await createBooking({ serviceId: service('follow-up').id, therapist: therapist('ananya-rao').id, start: at('2026-10-20', '10:07'), patient: patient(1), source: 'online', now: NOW })
    expect(offGrid.ok).toBe(false)
    const tooSoon = await createBooking({ serviceId: service('follow-up').id, therapist: therapist('ananya-rao').id, start: at('2026-10-19', '09:00'), patient: patient(1), source: 'online', now: Date.parse('2026-10-19T03:00:00Z') }) // 08:30 IST, 2h notice
    expect(tooSoon.ok).toBe(false)
    const wrongTherapist = await createBooking({ serviceId: service('clinical-pilates').id, therapist: therapist('kabir-menon').id, start: at('2026-10-20', '10:00'), patient: patient(1), source: 'online', now: NOW })
    expect(wrongTherapist).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('staff can book a walk-in inside the minimum notice window', async () => {
    const now = Date.parse('2026-10-20T04:00:00Z') // 09:30 IST Tuesday
    const r = await createBooking({ serviceId: service('dry-needling').id, therapist: therapist('ananya-rao').id, start: at('2026-10-20', '09:30'), patient: patient(1), source: 'walk_in', staff: true, now })
    expect(r.ok).toBe(true)
  })
})

describe('cancel & reschedule via signed links', () => {
  async function book(start = at('2026-10-22', '10:00')) {
    const r = await createBooking({ serviceId: service('follow-up').id, therapist: therapist('ananya-rao').id, start, patient: patient(1), source: 'online', now: NOW })
    if (!r.ok) throw new Error('setup booking failed')
    return r.booking
  }
  const token = (b: { id: string; tokenVersion: number; startsAt: Date }, purpose: 'cancel' | 'reschedule') =>
    signBookingToken({ bookingId: b.id, purpose, version: b.tokenVersion, expiresAt: b.startsAt }, SECRET)

  it('cancelling frees the slot immediately and the link is single-use', async () => {
    const b = await book()
    const settings = await getSettings()
    const avail = () =>
      getAvailability({ settings, service: service('follow-up'), therapist: therapist('ananya-rao').id, from: '2026-10-22', to: '2026-10-22', now: NOW })

    expect((await avail()).some((x) => x.start === b.startsAt.getTime())).toBe(false)
    const t = token(b, 'cancel')
    const r = await cancelByToken(t, NOW)
    expect(r.ok).toBe(true)
    expect((await avail()).some((x) => x.start === b.startsAt.getTime())).toBe(true)

    // Second click: already cancelled, nothing changes.
    expect(await cancelByToken(t, NOW)).toEqual({ ok: false, reason: 'cancelled' })
    // Someone else can now book the freed slot.
    const again = await createBooking({ serviceId: service('follow-up').id, therapist: therapist('ananya-rao').id, start: b.startsAt, patient: patient(2), source: 'online', now: NOW })
    expect(again.ok).toBe(true)
  })

  it('a reschedule token cannot cancel, and forged tokens fail', async () => {
    const b = await book()
    expect((await cancelByToken(token(b, 'reschedule'), NOW)).ok).toBe(false)
    expect((await cancelByToken(signBookingToken({ bookingId: b.id, purpose: 'cancel', version: 1, expiresAt: b.startsAt }, 'some-other-secret-value'), NOW)).ok).toBe(false)
    expect(await countActive()).toBe(1)
  })

  it('respects the cancellation cutoff', async () => {
    const b = await book(at('2026-10-20', '09:00')) // ~27h after NOW
    const late = Date.parse('2026-10-19T04:00:00Z') // 09:30 IST Mon → 23.5h before
    expect(await cancelByToken(token(b, 'cancel'), late)).toEqual({ ok: false, reason: 'too_late' })
    const state = await resolveManageToken(token(b, 'reschedule'), 'reschedule', late)
    expect(state).toMatchObject({ ok: true, changeable: false, reason: 'too_late' })
  })

  it('reschedules in place, bumps versions and invalidates old links', async () => {
    const b = await book()
    const oldCancel = token(b, 'cancel')
    const r = await rescheduleBooking({ bookingId: b.id, expectedVersion: b.tokenVersion, therapist: therapist('ananya-rao').id, start: at('2026-10-22', '10:15'), now: NOW })
    if (!r.ok) throw new Error(`reschedule failed: ${JSON.stringify(r)}`)
    // Overlapping its own old time is fine (the booking doesn't block itself).
    expect(r.booking.startsAt.toISOString()).toBe(at('2026-10-22', '10:15').toISOString())
    expect(r.booking.reference).toBe(b.reference)
    expect(r.booking.icsSequence).toBe(b.icsSequence + 1)
    expect(r.booking.tokenVersion).toBe(b.tokenVersion + 1)
    expect(await resolveManageToken(oldCancel, 'cancel', NOW)).toEqual({ ok: false, reason: 'superseded' })
    // The old reschedule link can't be replayed either.
    const replay = await rescheduleBooking({ bookingId: b.id, expectedVersion: b.tokenVersion, therapist: 'any', start: at('2026-10-22', '11:00'), now: NOW })
    expect(replay).toMatchObject({ ok: false, code: 'not_allowed' })
  })

  it('reschedule into an occupied slot returns alternatives', async () => {
    const a = await book(at('2026-10-22', '10:00'))
    const b = await book(at('2026-10-22', '11:00'))
    const r = await rescheduleBooking({ bookingId: b.id, therapist: therapist('ananya-rao').id, start: a.startsAt, now: NOW })
    expect(r).toMatchObject({ ok: false, code: 'slot_taken' })
  })

  it('marks attendance only for past, non-cancelled bookings', async () => {
    const b = await book()
    expect(await setAttendance(b.id, 'completed', NOW)).toBeNull() // future
    const done = await setAttendance(b.id, 'completed', at('2026-10-22', '11:00').getTime())
    expect(done?.status).toBe('completed')
    // A completed booking still blocks its slot.
    const clash = await createBooking({ serviceId: service('follow-up').id, therapist: therapist('ananya-rao').id, start: b.startsAt, patient: patient(3), source: 'online', now: NOW })
    expect(clash.ok).toBe(false)
    expect(await db.select().from(s.bookings).where(and(eq(s.bookings.id, b.id)))).toHaveLength(1)
  })
})
