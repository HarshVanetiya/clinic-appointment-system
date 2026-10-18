import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/db'
import * as s from '@/db/schema'
import { seed } from '@/db/seed'
import { createBooking } from '@/server/bookings'
import { sendDueReminders } from '@/server/reminders'

const NOW = Date.parse('2026-10-19T00:30:00Z') // Mon 06:00 IST
let ids: Awaited<ReturnType<typeof seed>>

beforeAll(async () => {
  ids = await seed(db, { now: NOW, withBookings: false })
})
afterAll(async () => {
  await db.$client.end()
})

const insert = (reference: string, startsAt: Date, extra: Partial<typeof s.bookings.$inferInsert> = {}) =>
  db.insert(s.bookings).values({
    reference,
    serviceId: ids.serviceBySlug.get('follow-up')!.id,
    therapistId: ids.therapistBySlug.get('ananya-rao')!.id,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 45 * 60_000),
    blockedUntil: new Date(startsAt.getTime() + 60 * 60_000),
    patientName: 'Reminder Test',
    patientEmail: `${reference.toLowerCase()}@example.com`,
    patientPhone: '+919876543210',
    pricePaise: 120000,
    durationMin: 45,
    ...extra,
  })

describe('24h reminders', () => {
  it('sends each due reminder exactly once, even with overlapping runs', async () => {
    await insert('NP-REM001', new Date(NOW + 20 * 3_600_000)) // due
    await insert('NP-REM002', new Date(NOW + 30 * 3_600_000)) // not yet due
    await insert('NP-REM003', new Date(NOW + 10 * 3_600_000), { status: 'cancelled' }) // cancelled
    await insert('NP-REM004', new Date(NOW - 3_600_000)) // already started

    const runs = await Promise.all([sendDueReminders(NOW), sendDueReminders(NOW), sendDueReminders(NOW)])
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(1)

    const logged = await db.select({ n: sql<number>`count(*)::int` }).from(s.emailLog).where(eq(s.emailLog.kind, 'reminder'))
    expect(logged[0]!.n).toBe(1)
    expect((await sendDueReminders(NOW)).sent).toBe(0)
  })

  it('bookings made inside the 24h window are treated as already reminded', async () => {
    const r = await createBooking({
      serviceId: ids.serviceBySlug.get('follow-up')!.id,
      therapist: ids.therapistBySlug.get('kabir-menon')!.id,
      start: new Date(Date.parse('2026-10-19T09:30:00Z')), // Mon 15:00 IST, ~9h away
      patient: { name: 'Late Booker', email: 'late@example.com', phone: '+919876543210', notes: '' },
      source: 'online',
      now: NOW,
    })
    expect(r.ok && r.booking.reminderSentAt).toBeTruthy()
  })
})
