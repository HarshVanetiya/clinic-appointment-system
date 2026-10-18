import { CalendarClock, PhoneCall } from 'lucide-react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CancelForm } from '@/components/booking/cancel-form'
import { PickerSkeleton } from '@/components/booking/picker-skeleton'
import { RescheduleForm } from '@/components/booking/reschedule-form'
import { ButtonLink } from '@/components/ui/button'
import { Alert, Avatar, Card, EmptyState, Eyebrow, Skeleton } from '@/components/ui/primitives'
import { formatDateTime, formatDuration } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import { startOfWeek, utcToLocal } from '@/lib/time'
import { peekPurpose } from '@/lib/tokens'
import { weekAvailability } from '@/server/availability-view'
import { resolveManageToken } from '@/server/bookings'
import { loadBookingView, type BookingView } from '@/server/booking-view'
import { getServiceById, getSettings, therapistsForService } from '@/server/queries'
import { requestNow } from '@/server/clock'

export const metadata: Metadata = { title: 'Manage your booking', robots: { index: false } }

export default function ManagePage({ params }: PageProps<'/manage/[token]'>) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 sm:pt-14">
      <Suspense fallback={<ManageSkeleton />}>
        <Manage params={params} />
      </Suspense>
    </div>
  )
}

const MESSAGES = {
  invalid: ['This link isn’t valid', 'Please use the buttons in your most recent email from us.'],
  expired: ['This link has expired', 'Links stop working once the appointment time has passed.'],
  superseded: ['This link has been replaced', 'Your booking was changed since this email was sent. Please use the newest email from us.'],
} as const

async function Manage({ params }: { params: PageProps<'/manage/[token]'>['params'] }) {
  const { token } = await params
  const now = await requestNow()
  const purpose = peekPurpose(token)
  const settings = await getSettings()
  const phone = formatIndianMobile(settings.phone)

  if (purpose !== 'cancel' && purpose !== 'reschedule') return <Problem kind="invalid" />
  const state = await resolveManageToken(token, purpose)
  if (!state.ok) return <Problem kind={state.reason} />
  const view = await loadBookingView(state.booking.id)
  if (!view) return <Problem kind="invalid" />

  const header = (
    <BookingCard view={view} timeZone={settings.timeZone} />
  )

  if (!state.changeable) {
    const copy = {
      cancelled: ['This booking is cancelled', 'Nothing more to do — the time has been released.'],
      too_late: ['It’s too close to change online', `Online changes close ${settings.cancellationCutoffHours} hours before your appointment. Please call us and we’ll help.`],
      finished: ['This appointment has already happened', 'We hope it went well!'],
    }[state.reason]
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold">{copy[0]}</h1>
        {header}
        <Alert tone={state.reason === 'too_late' ? 'warn' : 'info'} title={copy[1]}>
          {state.reason === 'too_late' && (
            <a href={`tel:${settings.phone}`} className="mt-2 inline-flex items-center gap-2 font-semibold underline">
              <PhoneCall aria-hidden className="size-4" /> {phone}
            </a>
          )}
        </Alert>
        <ButtonLink href="/book" variant="secondary">
          Book a new appointment
        </ButtonLink>
      </div>
    )
  }

  if (purpose === 'cancel') {
    return (
      <div className="space-y-6">
        <div>
          <Eyebrow className="mb-2">Cancel booking</Eyebrow>
          <h1 className="text-3xl font-extrabold">Cancel this appointment?</h1>
          <p className="mt-2 text-muted">The time will be released straight away so someone else can use it.</p>
        </div>
        {header}
        <CancelForm token={token} />
        <p className="text-center text-sm text-muted">
          Prefer a different time instead? Use the <span className="font-medium text-ink">Reschedule</span> button in your email.
        </p>
      </div>
    )
  }

  const service = await getServiceById(view.booking.serviceId)
  const therapists = service ? await therapistsForService(service.id) : []
  if (!service || therapists.length === 0) return <Problem kind="invalid" />
  const initialTherapist = therapists.some((t) => t.id === view.booking.therapistId) ? view.booking.therapistId : 'any'
  const week = startOfWeek(utcToLocal(Math.max(now, view.booking.startsAt.getTime()), settings.timeZone).date)
  const initial = await weekAvailability({ settings, service, therapist: initialTherapist, weekStart: week, now, excludeBookingId: view.booking.id })

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow className="mb-2">Reschedule</Eyebrow>
        <h1 className="text-3xl font-extrabold">Choose a new time</h1>
      </div>
      {header}
      <RescheduleForm
        token={token}
        serviceSlug={service.slug}
        therapists={therapists.map((t) => ({ id: t.id, name: t.name, title: t.title, accent: t.accent }))}
        initialTherapist={initialTherapist}
        initial={initial}
      />
    </div>
  )
}

function BookingCard({ view, timeZone }: { view: BookingView; timeZone: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <Avatar name={view.therapistName} accent={view.therapistAccent} size={48} />
      <div className="min-w-0">
        <p className="font-bold">
          {view.serviceName} <span className="font-normal text-muted">· {formatDuration(view.booking.durationMin)}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
          <CalendarClock aria-hidden className="size-4 text-green" /> {formatDateTime(view.booking.startsAt, timeZone)}
        </p>
        <p className="text-sm text-muted">
          with {view.therapistName} · Ref <span className="font-mono">{view.booking.reference}</span>
        </p>
      </div>
    </Card>
  )
}

function Problem({ kind }: { kind: keyof typeof MESSAGES }) {
  const [title, body] = MESSAGES[kind]
  return <EmptyState title={title} body={body} action={<ButtonLink href="/book">Book an appointment</ButtonLink>} />
}

function ManageSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading your booking">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-24 rounded-[var(--radius-card)]" />
      <PickerSkeleton />
    </div>
  )
}
