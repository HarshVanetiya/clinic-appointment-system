import { CalendarPlus, CheckCircle2, Clock, MapPin, UserRound } from 'lucide-react'
import type { Metadata, Route } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ButtonLink, buttonClass } from '@/components/ui/button'
import { Alert, Avatar, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui/primitives'
import { formatDateTime, formatDuration, formatINR } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import { googleCalendarUrl, viewFromToken } from '@/server/booking-view'
import { manageLinks } from '@/server/email/notifications'
import { getSettings } from '@/server/queries'

export const metadata: Metadata = { title: 'Booking confirmed', robots: { index: false } }

export default function ConfirmationPage({ params }: PageProps<'/booking/[token]'>) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 sm:pt-16">
      <Suspense fallback={<ConfirmationSkeleton />}>
        <Confirmation params={params} />
      </Suspense>
    </div>
  )
}

async function Confirmation({ params }: { params: PageProps<'/booking/[token]'>['params'] }) {
  const { token } = await params
  await connection()
  const view = await viewFromToken(token, 'view')
  if (!view) {
    return <EmptyState title="This link has expired" body="Confirmation links stop working once the appointment has started. Check your email for your booking details." action={<ButtonLink href="/book">Book again</ButtonLink>} />
  }
  const settings = await getSettings()
  const b = view.booking
  const links = manageLinks(b)
  const cancelled = b.status === 'cancelled'

  return (
    <div className="animate-fade-up">
      <div className="text-center">
        <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${cancelled ? 'bg-danger-bg text-danger' : 'bg-sage text-green'}`}>
          <CheckCircle2 aria-hidden className="size-8" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">{cancelled ? 'This booking was cancelled' : `You're booked in, ${b.patientName.split(' ')[0]}!`}</h1>
        {!cancelled && (
          <p className="mt-2 text-muted">
            We&apos;ve emailed a confirmation and calendar invite to <span className="font-medium text-ink">{b.patientEmail}</span>.
          </p>
        )}
      </div>

      <Card className="mt-8 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Reference</Eyebrow>
          <span className="rounded-full bg-sage-50 px-3 py-1 font-mono text-sm font-semibold tracking-wider ring-1 ring-line">{b.reference}</span>
        </div>
        <h2 className="mt-4 text-xl font-bold">{view.serviceName}</h2>
        <dl className="mt-4 space-y-3 text-[0.95rem]">
          <div className="flex gap-3">
            <dt className="sr-only">When</dt>
            <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-green" />
            <dd>
              <span className="font-semibold">{formatDateTime(b.startsAt, settings.timeZone)}</span>
              <span className="block text-sm text-muted">{formatDuration(b.durationMin)} · {formatINR(b.pricePaise)} payable at the clinic</span>
            </dd>
          </div>
          <div className="flex items-center gap-3">
            <dt className="sr-only">Therapist</dt>
            <UserRound aria-hidden className="size-5 shrink-0 text-green" />
            <dd className="flex items-center gap-2">
              <Avatar name={view.therapistName} accent={view.therapistAccent} size={28} />
              <span className="font-medium">{view.therapistName}</span>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="sr-only">Where</dt>
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-green" />
            <dd>{settings.addressLine}</dd>
          </div>
        </dl>

        {!cancelled && (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <a href={`/api/ics/${token}`} className={buttonClass('primary', 'md')}>
              <CalendarPlus aria-hidden className="size-4" /> Add to calendar
            </a>
            <a href={googleCalendarUrl(view, settings.addressLine)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>
              Google Calendar
            </a>
          </div>
        )}
      </Card>

      {!cancelled && (
        <>
          <Alert tone="success" className="mt-4" title="Before your visit">
            Please arrive 5 minutes early and wear comfortable clothing. Bring any scans or reports you have.
          </Alert>
          <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted sm:flex-row sm:justify-center sm:gap-4">
            <span>Plans changed?</span>
            <a href={links.reschedule.replace(/^https?:\/\/[^/]+/, '') as Route} className="font-semibold text-green underline-offset-4 hover:underline">
              Reschedule
            </a>
            <a href={links.cancel.replace(/^https?:\/\/[^/]+/, '') as Route} className="font-semibold text-green underline-offset-4 hover:underline">
              Cancel booking
            </a>
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            Free changes up to {settings.cancellationCutoffHours} hours before. After that, call {formatIndianMobile(settings.phone)}.
          </p>
        </>
      )}
    </div>
  )
}

function ConfirmationSkeleton() {
  return (
    <div aria-busy aria-label="Loading your booking" className="space-y-6">
      <Skeleton className="mx-auto size-16 rounded-full" />
      <Skeleton className="mx-auto h-9 w-3/4" />
      <Skeleton className="h-72 rounded-[var(--radius-card)]" />
    </div>
  )
}
