'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import type { AlternativeDTO, BookState } from '@/lib/booking-state'
import { env } from '@/lib/env'
import { formatShortDate, formatTime } from '@/lib/format'
import { rateLimitByIp, RATE_LIMITS } from '@/lib/rate-limit'
import { signBookingToken } from '@/lib/tokens'
import { bookingRequestSchema, fieldErrors } from '@/lib/validation'
import { createBooking } from '@/server/bookings'
import { notifyBooking } from '@/server/email/notifications'
import { getSettings } from '@/server/queries'

export async function bookAppointment(_prev: BookState, formData: FormData): Promise<BookState> {
  const raw = Object.fromEntries(['serviceId', 'therapist', 'start', 'name', 'email', 'phone', 'notes'].map((k) => [k, String(formData.get(k) ?? '')]))
  const values = { name: raw.name!, email: raw.email!, phone: raw.phone!, notes: raw.notes! }

  // Honeypot: real people never fill the hidden "company" field.
  if (formData.get('company')) return { status: 'error', errors: { form: 'Something went wrong. Please try again.' }, values }

  const limit = await rateLimitByIp(RATE_LIMITS.book)
  if (!limit.allowed) return { status: 'rate_limited' }

  const parsed = bookingRequestSchema.safeParse(raw)
  if (!parsed.success) return { status: 'error', errors: fieldErrors(parsed.error), values }
  const input = parsed.data

  const result = await createBooking({
    serviceId: input.serviceId,
    therapist: input.therapist,
    start: input.start,
    patient: { name: input.name, email: input.email, phone: input.phone, notes: input.notes },
    source: 'online',
  })

  if (!result.ok) {
    if (result.code === 'invalid') return { status: 'error', errors: { form: result.message }, values }
    const { timeZone } = await getSettings()
    const alternatives: AlternativeDTO[] = result.alternatives.map((a) => ({
      start: new Date(a.start).toISOString(),
      label: `${formatShortDate(a.start, timeZone)} · ${formatTime(a.start, timeZone)}`,
    }))
    return { status: 'taken', alternatives, values }
  }

  const booking = result.booking
  // Emails go out after the response is sent, so confirming feels instant.
  after(() => notifyBooking(booking.id, 'created'))

  const view = signBookingToken({ bookingId: booking.id, purpose: 'view', version: 1, expiresAt: booking.startsAt }, env().BOOKING_TOKEN_SECRET)
  redirect(`/booking/${view}`)
}
