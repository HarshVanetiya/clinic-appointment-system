'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { db } from '@/db'
import { therapists } from '@/db/schema'
import { env } from '@/lib/env'
import { formatShortDate, formatTime } from '@/lib/format'
import { rateLimitByIp, RATE_LIMITS } from '@/lib/rate-limit'
import { signBookingToken, verifyBookingToken } from '@/lib/tokens'
import { therapistChoice } from '@/lib/validation'
import { cancelByToken, rescheduleBooking } from '@/server/bookings'
import { notifyBooking } from '@/server/email/notifications'
import { getSettings } from '@/server/queries'
import { z } from 'zod'

const REASONS: Record<string, string> = {
  invalid: 'This link is not valid.',
  expired: 'This link has expired.',
  superseded: 'This link has been replaced by a newer one — please use the latest email from us.',
  cancelled: 'This booking is already cancelled.',
  too_late: 'Online changes are closed this close to the appointment. Please call the clinic.',
  finished: 'This appointment has already taken place.',
}

export type CancelState = { status: 'idle' } | { status: 'done' } | { status: 'error'; message: string }

export async function cancelAction(token: string, _prev: CancelState): Promise<CancelState> {
  const limit = await rateLimitByIp(RATE_LIMITS.manage)
  if (!limit.allowed) return { status: 'error', message: 'Too many attempts. Please wait a few minutes.' }
  const result = await cancelByToken(token)
  if (!result.ok) return { status: 'error', message: REASONS[result.reason] ?? 'Something went wrong.' }
  after(() => notifyBooking(result.booking.id, 'cancelled'))
  return { status: 'done' }
}

export type RescheduleState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'taken'; alternatives: { start: string; label: string }[] }

const rescheduleInput = z.object({ therapist: therapistChoice, start: z.iso.datetime({ offset: true }).transform((s) => new Date(s)) })

export async function rescheduleAction(token: string, input: { therapist: string; start: string }): Promise<RescheduleState> {
  const limit = await rateLimitByIp(RATE_LIMITS.manage)
  if (!limit.allowed) return { status: 'error', message: 'Too many attempts. Please wait a few minutes.' }

  const v = verifyBookingToken(token, env().BOOKING_TOKEN_SECRET, 'reschedule')
  if (!v.ok) return { status: 'error', message: REASONS[v.reason === 'expired' ? 'expired' : 'invalid']! }
  const parsed = rescheduleInput.safeParse(input)
  if (!parsed.success) return { status: 'error', message: 'Please choose a new time.' }

  const result = await rescheduleBooking({ bookingId: v.payload.bookingId, expectedVersion: v.payload.version, therapist: parsed.data.therapist, start: parsed.data.start })
  if (!result.ok) {
    if (result.code === 'slot_taken') {
      const { timeZone } = await getSettings()
      return {
        status: 'taken',
        alternatives: result.alternatives.map((a) => ({ start: new Date(a.start).toISOString(), label: `${formatShortDate(a.start, timeZone)} · ${formatTime(a.start, timeZone)}` })),
      }
    }
    return { status: 'error', message: result.code === 'invalid' ? result.message : result.reason }
  }

  const [prevTherapist] = await db.select({ name: therapists.name }).from(therapists).where(eq(therapists.id, result.previous.therapistId))
  const booking = result.booking
  after(() => notifyBooking(booking.id, 'rescheduled', { startsAt: result.previous.startsAt, therapistName: prevTherapist?.name ?? '' }))
  const view = signBookingToken({ bookingId: booking.id, purpose: 'view', version: 1, expiresAt: booking.startsAt }, env().BOOKING_TOKEN_SECRET)
  redirect(`/booking/${view}`)
}
