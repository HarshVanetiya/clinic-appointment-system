import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { bookings, services, therapists } from '@/db/schema'
import { appUrl, env } from '@/lib/env'
import { buildIcs } from '@/lib/ics'
import { verifyBookingToken, type TokenPurpose } from '@/lib/tokens'
import { manageLinks } from './email/notifications'
import { getSettings } from './queries'

/** A booking plus display fields — only ever loaded through a verified token or staff auth. */
export async function loadBookingView(bookingId: string) {
  const [row] = await db
    .select({
      booking: bookings,
      serviceName: services.name,
      serviceSlug: services.slug,
      therapistName: therapists.name,
      therapistAccent: therapists.accent,
      therapistTitle: therapists.title,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(therapists, eq(therapists.id, bookings.therapistId))
    .where(eq(bookings.id, bookingId))
  return row ?? null
}

export type BookingView = NonNullable<Awaited<ReturnType<typeof loadBookingView>>>

/** Resolve a token of the given purpose to a booking view, ignoring version (view-only use). */
export async function viewFromToken(token: string, purpose: TokenPurpose) {
  const v = verifyBookingToken(token, env().BOOKING_TOKEN_SECRET, purpose)
  if (!v.ok) return null
  return loadBookingView(v.payload.bookingId)
}

export async function icsForBooking(view: BookingView) {
  const settings = await getSettings()
  const b = view.booking
  const links = manageLinks(b)
  return buildIcs({
    uid: `${b.id}@northside-physio`,
    sequence: b.icsSequence,
    method: b.status === 'cancelled' ? 'CANCEL' : 'REQUEST',
    start: b.startsAt,
    end: b.endsAt,
    summary: `${view.serviceName} with ${view.therapistName}`,
    description: `${settings.name} · Ref ${b.reference}\nReschedule: ${links.reschedule}\nCancel: ${links.cancel}`,
    location: `${settings.name}, ${settings.addressLine}`,
    url: appUrl('/'),
    organizer: { name: settings.name, email: settings.email },
    attendee: { name: b.patientName, email: b.patientEmail },
  })
}

/** Google Calendar "add event" template link. */
export function googleCalendarUrl(view: BookingView, location: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${view.serviceName} with ${view.therapistName}`,
    dates: `${fmt(view.booking.startsAt)}/${fmt(view.booking.endsAt)}`,
    details: `Northside Physio · Ref ${view.booking.reference}`,
    location,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
