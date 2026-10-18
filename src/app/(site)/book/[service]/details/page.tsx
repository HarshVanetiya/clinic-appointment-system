import type { Metadata, Route } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { DetailsForm } from '@/components/booking/details-form'
import { Stepper } from '@/components/booking/stepper'
import { ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatDateTime, formatDuration, formatINR } from '@/lib/format'
import { utcToLocal } from '@/lib/time'
import { therapistChoice } from '@/lib/validation'
import { getAvailability } from '@/server/availability'
import { getPublicService, getPublicServices, getServiceTherapists } from '@/server/cached'
import { getSettings } from '@/server/queries'

export const metadata: Metadata = { title: 'Your details' }

export async function generateStaticParams() {
  return (await getPublicServices()).map((s) => ({ service: s.slug }))
}

export default function DetailsPage({ params, searchParams }: PageProps<'/book/[service]/details'>) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Suspense fallback={<Stepper current={3} />}>
        <DetailsStepper params={params} />
      </Suspense>
      <h1 className="mb-6 text-3xl font-extrabold sm:text-4xl">Almost done</h1>
      <Suspense fallback={<DetailsSkeleton />}>
        <Details params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function DetailsStepper({ params }: { params: PageProps<'/book/[service]/details'>['params'] }) {
  const { service } = await params
  return <Stepper current={3} links={{ 1: '/book', 2: `/book/${service}` as Route }} />
}

async function Details({ params, searchParams }: Pick<PageProps<'/book/[service]/details'>, 'params' | 'searchParams'>) {
  const [{ service: slug }, sp] = await Promise.all([params, searchParams])
  await connection()
  const service = await getPublicService(slug)
  if (!service) notFound()
  const back = `/book/${slug}` as Route

  const start = typeof sp.start === 'string' ? sp.start : ''
  const therapistParsed = therapistChoice.safeParse(sp.therapist)
  const startMs = Date.parse(start)
  if (!therapistParsed.success || Number.isNaN(startMs)) {
    return <EmptyState title="Let's pick a time first" body="Your booking link is missing a time." action={<ButtonLink href={back}>Choose a time</ButtonLink>} />
  }
  const therapist = therapistParsed.data
  const [settings, therapists] = await Promise.all([getSettings(), getServiceTherapists(service.id)])
  const tz = settings.timeZone

  // Friendly early check — the real guarantee happens inside the booking transaction.
  const { date } = utcToLocal(startMs, tz)
  const slots = await getAvailability({ settings, service, therapist, from: date, to: date, now: Date.now() })
  const stillFree = slots.some((s) => s.start === startMs)
  const therapistLabel = therapist === 'any' ? 'First available' : (therapists.find((t) => t.id === therapist)?.name ?? 'First available')

  if (!stillFree) {
    return (
      <EmptyState
        title="That time is no longer available"
        body="Someone may have just booked it, or it's now too close to book online. Please choose another time."
        action={<ButtonLink href={`${back}?therapist=${therapist}` as Route}>See available times</ButtonLink>}
      />
    )
  }

  return (
    <DetailsForm
      serviceId={service.id}
      serviceSlug={slug}
      serviceName={service.name}
      priceLabel={formatINR(service.pricePaise)}
      durationLabel={formatDuration(service.durationMin)}
      therapist={therapist}
      therapistLabel={therapistLabel}
      start={new Date(startMs).toISOString()}
      whenLabel={formatDateTime(startMs, tz)}
      changeHref={`${back}?therapist=${therapist}&start=${encodeURIComponent(new Date(startMs).toISOString())}` as Route}
    />
  )
}

function DetailsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]" aria-busy aria-label="Loading">
      <Card className="order-2 space-y-5 p-6 lg:order-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        ))}
      </Card>
      <Skeleton className="order-1 h-56 rounded-[var(--radius-card)] lg:order-2" />
    </div>
  )
}
