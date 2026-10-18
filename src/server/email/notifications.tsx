import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { bookings, services, therapists } from '@/db/schema'
import { appUrl, env } from '@/lib/env'
import { formatDateTime, formatDuration, formatINR, formatTime, formatLongDate } from '@/lib/format'
import { buildIcs } from '@/lib/ics'
import { formatIndianMobile } from '@/lib/phone'
import { signBookingToken } from '@/lib/tokens'
import { getSettings } from '../queries'
import { sendEmail } from './send'
import { BookingEmail, type BookingEmailProps } from './templates'

export type BookingEvent = 'created' | 'cancelled' | 'rescheduled' | 'reminder'

async function loadBooking(bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, service: services, therapist: therapists })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(therapists, eq(therapists.id, bookings.therapistId))
    .where(eq(bookings.id, bookingId))
  return row ?? null
}

export function manageLinks(b: { id: string; tokenVersion: number; startsAt: Date }) {
  const secret = env().BOOKING_TOKEN_SECRET
  const sign = (purpose: 'cancel' | 'reschedule') =>
    appUrl(`/manage/${signBookingToken({ bookingId: b.id, purpose, version: b.tokenVersion, expiresAt: b.startsAt }, secret)}`)
  return { cancel: sign('cancel'), reschedule: sign('reschedule') }
}

/**
 * Send the patient + therapist emails for a booking lifecycle event.
 * Safe to call from `after()`: it never throws.
 */
export async function notifyBooking(bookingId: string, event: BookingEvent, previous?: { startsAt: Date; therapistName: string }) {
  try {
    const [row, settings] = await Promise.all([loadBooking(bookingId), getSettings()])
    if (!row) return
    const { booking: b, service, therapist } = row
    const tz = settings.timeZone
    const when = formatDateTime(b.startsAt, tz)
    const clinic: BookingEmailProps['clinic'] = {
      name: settings.name,
      address: settings.addressLine,
      phone: formatIndianMobile(settings.phone),
      email: settings.email,
      url: appUrl('/'),
    }
    const links = manageLinks(b)
    const details = [
      { label: 'When', value: `${when} (IST)` },
      { label: 'Treatment', value: `${service.name} · ${formatDuration(b.durationMin)}` },
      { label: 'Therapist', value: therapist.name },
      { label: 'Where', value: settings.addressLine },
      { label: 'Reference', value: b.reference },
    ]
    const cutoffNote = `You can reschedule or cancel online up to ${settings.cancellationCutoffHours} hours before your appointment. After that, please call us on ${clinic.phone}.`
    const ics = (method: 'REQUEST' | 'CANCEL') => ({
      method,
      content: buildIcs({
        uid: `${b.id}@northside-physio`,
        sequence: b.icsSequence,
        method,
        start: b.startsAt,
        end: b.endsAt,
        summary: `${service.name} with ${therapist.name}`,
        description: `${settings.name} · Ref ${b.reference}\nReschedule: ${links.reschedule}\nCancel: ${links.cancel}`,
        location: `${settings.name}, ${settings.addressLine}`,
        url: appUrl('/'),
        organizer: { name: settings.name, email: settings.email },
        attendee: { name: b.patientName, email: b.patientEmail },
      }),
    })
    const firstName = b.patientName.split(' ')[0] ?? b.patientName
    const key = `${event}/${b.id}/${b.icsSequence}`

    const patient: Record<BookingEvent, Omit<BookingEmailProps, 'clinic'> & { subject: string; ics?: ReturnType<typeof ics> }> = {
      created: {
        subject: `Booking confirmed: ${service.name}, ${formatLongDate(b.startsAt, tz)}`,
        preview: `See you ${when}.`,
        eyebrow: 'Booking confirmed',
        heading: `You're booked in, ${firstName}.`,
        intro: `Your ${service.name.toLowerCase()} with ${therapist.name} is confirmed. We've attached a calendar invite. Please arrive 5 minutes early and wear comfortable clothing.`,
        details: [...details, { label: 'Fee', value: `${formatINR(b.pricePaise)} · pay at the clinic (UPI, card or cash)` }],
        actions: [
          { label: 'Reschedule', href: links.reschedule },
          { label: 'Cancel booking', href: links.cancel, variant: 'secondary' },
        ],
        note: cutoffNote,
        ics: ics('REQUEST'),
      },
      reminder: {
        subject: `Reminder: ${service.name} tomorrow at ${formatTime(b.startsAt, tz)}`,
        preview: `${service.name} with ${therapist.name}, ${when}.`,
        eyebrow: 'Appointment reminder',
        heading: `See you soon, ${firstName}.`,
        intro: `A quick reminder of your upcoming appointment at ${settings.name}.`,
        details,
        actions: [
          { label: 'Reschedule', href: links.reschedule },
          { label: 'Cancel booking', href: links.cancel, variant: 'secondary' },
        ],
        note: cutoffNote,
      },
      rescheduled: {
        subject: `Booking moved: ${service.name}, ${formatLongDate(b.startsAt, tz)}`,
        preview: `Your appointment is now ${when}.`,
        eyebrow: 'Booking rescheduled',
        heading: 'Your new time is confirmed.',
        intro: previous
          ? `We've moved your appointment from ${formatDateTime(previous.startsAt, tz)}${previous.therapistName !== therapist.name ? ` with ${previous.therapistName}` : ''}. Your calendar invite has been updated.`
          : `Your appointment has been moved. Your calendar invite has been updated.`,
        details,
        actions: [
          { label: 'Reschedule again', href: links.reschedule },
          { label: 'Cancel booking', href: links.cancel, variant: 'secondary' },
        ],
        note: 'Links from earlier emails no longer work — please use the buttons above.',
        ics: ics('REQUEST'),
      },
      cancelled: {
        subject: `Booking cancelled: ${service.name}, ${formatLongDate(b.startsAt, tz)}`,
        preview: `Your appointment on ${when} has been cancelled.`,
        eyebrow: 'Booking cancelled',
        heading: 'Your appointment is cancelled.',
        intro: `We've cancelled your ${service.name.toLowerCase()} with ${therapist.name}. The slot has been released. We hope to see you another time.`,
        details,
        actions: [{ label: 'Book a new appointment', href: appUrl('/book') }],
        ics: ics('CANCEL'),
      },
    }

    const p = patient[event]
    const sends: Promise<void>[] = [
      sendEmail({
        kind: event === 'created' ? 'confirmation' : event === 'reminder' ? 'reminder' : event === 'cancelled' ? 'cancellation' : 'reschedule',
        bookingId: b.id,
        to: b.patientEmail,
        subject: p.subject,
        body: <BookingEmail {...p} clinic={clinic} />,
        ics: p.ics,
        idempotencyKey: `patient/${key}`,
      }),
    ]

    if (event !== 'reminder') {
      const therapistCopy = {
        created: { kind: 'therapist_new' as const, eyebrow: 'New booking', heading: `${b.patientName} booked ${service.name}` },
        rescheduled: { kind: 'therapist_rescheduled' as const, eyebrow: 'Booking moved', heading: `${b.patientName} moved their appointment` },
        cancelled: { kind: 'therapist_cancelled' as const, eyebrow: 'Booking cancelled', heading: `${b.patientName} cancelled` },
      }[event]
      sends.push(
        sendEmail({
          kind: therapistCopy.kind,
          bookingId: b.id,
          to: therapist.email,
          subject: `${therapistCopy.eyebrow}: ${b.patientName}, ${formatDateTime(b.startsAt, tz)}`,
          body: (
            <BookingEmail
              preview={`${therapistCopy.heading} — ${when}`}
              eyebrow={therapistCopy.eyebrow}
              heading={therapistCopy.heading}
              intro={
                event === 'rescheduled' && previous
                  ? `Previously ${formatDateTime(previous.startsAt, tz)} with ${previous.therapistName}.`
                  : `Source: ${b.source.replace('_', '-')}.`
              }
              details={[
                { label: 'When', value: when },
                { label: 'Treatment', value: `${service.name} · ${formatDuration(b.durationMin)}` },
                { label: 'Patient', value: `${b.patientName} · ${formatIndianMobile(b.patientPhone)}` },
                ...(b.notes ? [{ label: 'Patient notes', value: b.notes }] : []),
                { label: 'Reference', value: b.reference },
              ]}
              actions={[{ label: 'Open my schedule', href: appUrl('/staff') }]}
              clinic={clinic}
            />
          ),
          ics: event === 'cancelled' ? undefined : ics('REQUEST'),
          idempotencyKey: `therapist/${key}`,
        }),
      )
    }
    await Promise.all(sends)
  } catch (e) {
    console.error(`[notify:${event}] booking ${bookingId}`, e)
  }
}
