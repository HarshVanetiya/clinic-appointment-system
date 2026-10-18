import 'server-only'
import { randomInt } from 'node:crypto'
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { bookings, therapists, type Booking } from '@/db/schema'
import { isSlotAvailable, nearestSlots, type AggregatedSlot } from '@/lib/availability/engine'
import { env } from '@/lib/env'
import { addDays, localDayRange, utcToLocal } from '@/lib/time'
import { verifyBookingToken, withinCancellationCutoff, type TokenPurpose } from '@/lib/tokens'
import { getAvailability, type TherapistChoice } from './availability'
import { engineSettings, getServiceById, getSettings, loadSchedules, therapistsForService } from './queries'

const MINUTE = 60_000
const REMINDER_LEAD_MS = 24 * 3_600_000

/* --------------------------------- helpers --------------------------------- */

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L
export function generateReference(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)]
  return `NP-${s}`
}

function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code ?? err?.cause?.code
}
function pgConstraint(e: unknown): string | undefined {
  const err = e as { constraint_name?: string; cause?: { constraint_name?: string } }
  return err?.constraint_name ?? err?.cause?.constraint_name
}
/** 23P01 = exclusion_violation: the database refused an overlapping booking. */
export const isOverlapError = (e: unknown) => pgCode(e) === '23P01'

/**
 * If the appointment is already within the reminder window, the confirmation
 * doubles as the reminder — mark it as sent so the cron skips it.
 */
const initialReminderState = (startsAt: Date, now: number) => (startsAt.getTime() - now <= REMINDER_LEAD_MS ? new Date(now) : null)

export interface PatientDetails {
  name: string
  email: string
  phone: string
  notes: string
}

export type BookingFailure =
  | { ok: false; code: 'slot_taken'; alternatives: AggregatedSlot[] }
  | { ok: false; code: 'invalid'; message: string }

export type CreateBookingResult = { ok: true; booking: Booking } | BookingFailure

/** Order "any available" candidates by how busy they are that day (lightest first). */
async function orderByLoad(therapistIds: string[], date: string, timeZone: string) {
  if (therapistIds.length < 2) return therapistIds
  const { start, end } = localDayRange(date, timeZone)
  const rows = await db
    .select({ therapistId: bookings.therapistId, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(ne(bookings.status, 'cancelled'), gte(bookings.startsAt, new Date(start)), lt(bookings.startsAt, new Date(end))))
    .groupBy(bookings.therapistId)
  const load = new Map(rows.map((r) => [r.therapistId, r.n]))
  return [...therapistIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))
}

async function alternativesFor(args: {
  settings: Awaited<ReturnType<typeof getSettings>>
  service: { id: string; durationMin: number; bufferAfterMin: number }
  therapist: TherapistChoice
  start: Date
  now: number
  staff: boolean
  excludeBookingId?: string
}): Promise<AggregatedSlot[]> {
  const { date } = utcToLocal(args.start.getTime(), args.settings.timeZone)
  const slots = await getAvailability({
    settings: args.settings,
    service: args.service,
    therapist: args.therapist,
    from: addDays(date, -1),
    to: addDays(date, 3),
    now: args.now,
    staff: args.staff,
    excludeBookingId: args.excludeBookingId,
  })
  return nearestSlots(slots, args.start.getTime(), 3)
}

/* --------------------------------- create ---------------------------------- */

export interface CreateBookingInput {
  serviceId: string
  therapist: TherapistChoice
  start: Date
  patient: PatientDetails
  source: 'online' | 'phone' | 'walk_in'
  /** Staff bookings skip minimum notice (walk-ins). */
  staff?: boolean
  now?: number
}

/**
 * Create a booking without ever double booking.
 *
 * 1. Lock the therapist row (SELECT … FOR UPDATE) so concurrent bookings for the
 *    same therapist serialize.
 * 2. Re-check the slot against fresh data inside the transaction.
 * 3. Insert. The EXCLUDE constraint is the final guarantee — if anything slips
 *    past (e.g. a write that didn't take the lock), Postgres rejects it with 23P01.
 *
 * For "any available" we try each eligible therapist, lightest day first.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const now = input.now ?? Date.now()
  const staff = input.staff ?? false
  const settings = await getSettings()
  const service = await getServiceById(input.serviceId)
  if (!service || !service.active) return { ok: false, code: 'invalid', message: 'That treatment is no longer available.' }

  const offering = (await therapistsForService(service.id)).map((t) => t.id)
  const eligible = input.therapist === 'any' ? offering : offering.filter((id) => id === input.therapist)
  if (eligible.length === 0) return { ok: false, code: 'invalid', message: 'That therapist does not offer this treatment.' }

  const tz = settings.timeZone
  const { date } = utcToLocal(input.start.getTime(), tz)
  const candidates = input.therapist === 'any' ? await orderByLoad(eligible, date, tz) : eligible
  const engine = engineSettings(settings)
  if (staff) engine.minNoticeMin = -60

  const startsAt = input.start
  const endsAt = new Date(startsAt.getTime() + service.durationMin * MINUTE)
  const blockedUntil = new Date(endsAt.getTime() + service.bufferAfterMin * MINUTE)

  for (const therapistId of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await db.transaction(async (tx) => {
          await tx.execute(sql`select id from ${therapists} where id = ${therapistId} for update`)
          const [schedule] = await loadSchedules([therapistId], date, date, tz, { conn: tx })
          if (!schedule || !isSlotAvailable({ settings: engine, service, schedule, now, start: startsAt.getTime() })) return null
          const [row] = await tx
            .insert(bookings)
            .values({
              reference: generateReference(),
              serviceId: service.id,
              therapistId,
              startsAt,
              endsAt,
              blockedUntil,
              source: input.source,
              patientName: input.patient.name,
              patientEmail: input.patient.email,
              patientPhone: input.patient.phone,
              notes: input.patient.notes,
              pricePaise: service.pricePaise,
              durationMin: service.durationMin,
              reminderSentAt: initialReminderState(startsAt, now),
            })
            .returning()
          return row ?? null
        })
        if (created) return { ok: true, booking: created }
        break // slot not available for this therapist — try the next one
      } catch (e) {
        if (isOverlapError(e)) break
        if (pgCode(e) === '23505' && pgConstraint(e) === 'bookings_reference_unique') continue // reference collision, retry
        throw e
      }
    }
  }

  return { ok: false, code: 'slot_taken', alternatives: await alternativesFor({ settings, service, therapist: input.therapist, start: startsAt, now, staff }) }
}

/* ------------------------------ token access ------------------------------- */

export type ManageState =
  | { ok: true; booking: Booking; changeable: true }
  | { ok: true; booking: Booking; changeable: false; reason: 'cancelled' | 'too_late' | 'finished' }
  | { ok: false; reason: 'invalid' | 'expired' | 'superseded' }

/** Resolve a manage link to its booking and whether the patient may still change it. */
export async function resolveManageToken(token: string, purpose: TokenPurpose, now = Date.now()): Promise<ManageState> {
  const v = verifyBookingToken(token, env().BOOKING_TOKEN_SECRET, purpose, now)
  if (!v.ok) return { ok: false, reason: v.reason === 'expired' ? 'expired' : 'invalid' }
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, v.payload.bookingId))
  if (!booking) return { ok: false, reason: 'invalid' }
  if (booking.status === 'cancelled') return { ok: true, booking, changeable: false, reason: 'cancelled' }
  if (booking.tokenVersion !== v.payload.version) return { ok: false, reason: 'superseded' }
  if (booking.status !== 'confirmed') return { ok: true, booking, changeable: false, reason: 'finished' }
  const settings = await getSettings()
  if (withinCancellationCutoff(booking.startsAt, settings.cancellationCutoffHours, now))
    return { ok: true, booking, changeable: false, reason: 'too_late' }
  return { ok: true, booking, changeable: true }
}

/* --------------------------------- cancel ---------------------------------- */

export type CancelResult = { ok: true; booking: Booking } | { ok: false; reason: string }

export async function cancelByToken(token: string, now = Date.now()): Promise<CancelResult> {
  const state = await resolveManageToken(token, 'cancel', now)
  if (!state.ok) return { ok: false, reason: state.reason }
  if (!state.changeable) return { ok: false, reason: state.reason }
  const updated = await markCancelled(state.booking.id, state.booking.tokenVersion)
  return updated ? { ok: true, booking: updated } : { ok: false, reason: 'superseded' }
}

/** Cancel a confirmed booking; the optimistic version check makes the link single-use. */
export async function markCancelled(bookingId: string, expectedVersion?: number): Promise<Booking | null> {
  const [row] = await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
      tokenVersion: sql`${bookings.tokenVersion} + 1`,
      icsSequence: sql`${bookings.icsSequence} + 1`,
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.status, 'confirmed'),
        expectedVersion === undefined ? undefined : eq(bookings.tokenVersion, expectedVersion),
      ),
    )
    .returning()
  return row ?? null
}

/* ------------------------------- reschedule -------------------------------- */

export type RescheduleResult =
  | { ok: true; booking: Booking; previous: { startsAt: Date; therapistId: string } }
  | BookingFailure
  | { ok: false; code: 'not_allowed'; reason: string }

export interface RescheduleInput {
  bookingId: string
  /** When set (patient flow), the booking's tokenVersion must still match. */
  expectedVersion?: number
  therapist: TherapistChoice
  start: Date
  staff?: boolean
  now?: number
}

/**
 * Move a booking in place (same row, same reference and calendar UID; the .ics
 * SEQUENCE is bumped). Locks the booking row and the target therapist row.
 */
export async function rescheduleBooking(input: RescheduleInput): Promise<RescheduleResult> {
  const now = input.now ?? Date.now()
  const staff = input.staff ?? false
  const settings = await getSettings()
  const [current] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId))
  if (!current || current.status !== 'confirmed') return { ok: false, code: 'not_allowed', reason: 'This booking can no longer be changed.' }
  const service = await getServiceById(current.serviceId)
  if (!service) return { ok: false, code: 'invalid', message: 'That treatment is no longer available.' }

  const offering = (await therapistsForService(service.id)).map((t) => t.id)
  const eligible = input.therapist === 'any' ? offering : offering.filter((id) => id === input.therapist)
  if (eligible.length === 0) return { ok: false, code: 'invalid', message: 'That therapist does not offer this treatment.' }

  const tz = settings.timeZone
  const { date } = utcToLocal(input.start.getTime(), tz)
  // Prefer keeping the same therapist when "any" is chosen.
  const ordered = input.therapist === 'any' ? [...new Set([current.therapistId, ...(await orderByLoad(eligible, date, tz))])].filter((id) => eligible.includes(id)) : eligible
  const engine = engineSettings(settings)
  if (staff) engine.minNoticeMin = -60

  const startsAt = input.start
  const endsAt = new Date(startsAt.getTime() + current.durationMin * MINUTE)
  const blockedUntil = new Date(endsAt.getTime() + service.bufferAfterMin * MINUTE)

  for (const therapistId of ordered) {
    try {
      const result = await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(bookings).where(eq(bookings.id, current.id)).for('update')
        if (!locked || locked.status !== 'confirmed') return 'gone' as const
        if (input.expectedVersion !== undefined && locked.tokenVersion !== input.expectedVersion) return 'gone' as const
        if (!staff && withinCancellationCutoff(locked.startsAt, settings.cancellationCutoffHours, now)) return 'too_late' as const

        await tx.execute(sql`select id from ${therapists} where id = ${therapistId} for update`)
        const [schedule] = await loadSchedules([therapistId], date, date, tz, { conn: tx, excludeBookingId: current.id })
        const svc = { durationMin: current.durationMin, bufferAfterMin: service.bufferAfterMin }
        if (!schedule || !isSlotAvailable({ settings: engine, service: svc, schedule, now, start: startsAt.getTime() })) return null

        const [row] = await tx
          .update(bookings)
          .set({
            therapistId,
            startsAt,
            endsAt,
            blockedUntil,
            tokenVersion: sql`${bookings.tokenVersion} + 1`,
            icsSequence: sql`${bookings.icsSequence} + 1`,
            reminderSentAt: initialReminderState(startsAt, now),
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, current.id))
          .returning()
        return row ?? null
      })
      if (result === 'gone') return { ok: false, code: 'not_allowed', reason: 'This link has already been used.' }
      if (result === 'too_late')
        return { ok: false, code: 'not_allowed', reason: `Online changes close ${settings.cancellationCutoffHours} hours before the appointment.` }
      if (result) return { ok: true, booking: result, previous: { startsAt: current.startsAt, therapistId: current.therapistId } }
    } catch (e) {
      if (!isOverlapError(e)) throw e
    }
  }

  return {
    ok: false,
    code: 'slot_taken',
    alternatives: await alternativesFor({ settings, service, therapist: input.therapist, start: startsAt, now, staff, excludeBookingId: current.id }),
  }
}

/* ---------------------------------- staff ---------------------------------- */

export async function setAttendance(bookingId: string, status: 'completed' | 'no_show' | 'confirmed', now = Date.now()) {
  const [row] = await db
    .update(bookings)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), ne(bookings.status, 'cancelled'), status === 'confirmed' ? undefined : lt(bookings.startsAt, new Date(now))))
    .returning()
  return row ?? null
}
