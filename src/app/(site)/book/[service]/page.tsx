import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { BookTimeStep } from '@/components/booking/book-time-step'
import { PickerSkeleton } from '@/components/booking/picker-skeleton'
import { ServiceSummary } from '@/components/booking/service-summary'
import { Stepper } from '@/components/booking/stepper'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { ButtonLink } from '@/components/ui/button'
import { getPublicService, getPublicServices, getServiceTherapists } from '@/server/cached'
import { initialWeek, weekAvailability } from '@/server/availability-view'
import { getSettings } from '@/server/queries'
import { utcToLocal } from '@/lib/time'

export async function generateStaticParams() {
  return (await getPublicServices()).map((s) => ({ service: s.slug }))
}

export async function generateMetadata({ params }: PageProps<'/book/[service]'>): Promise<Metadata> {
  const service = await getPublicService((await params).service)
  return { title: service ? `Book ${service.name}` : 'Book' }
}

export default function ChooseTimePage({ params, searchParams }: PageProps<'/book/[service]'>) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Suspense fallback={<TimeShell />}>
        <TimeStepHeader params={params} />
      </Suspense>
      <div className="mt-8">
        <Suspense fallback={<PickerSkeleton />}>
          <TimeStep params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}

function TimeShell() {
  return (
    <>
      <Stepper current={2} />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="mt-3 h-4 w-48" />
    </>
  )
}

async function TimeStepHeader({ params }: { params: PageProps<'/book/[service]'>['params'] }) {
  const service = await getPublicService((await params).service)
  if (!service) notFound()
  return (
    <>
      <Stepper current={2} links={{ 1: '/book' }} />
      <ServiceSummary service={service} />
    </>
  )
}

async function TimeStep({ params, searchParams }: Pick<PageProps<'/book/[service]'>, 'params' | 'searchParams'>) {
  const [{ service: slug }, sp] = await Promise.all([params, searchParams])
  await connection()
  const service = await getPublicService(slug)
  if (!service) notFound()
  const [settings, therapists] = await Promise.all([getSettings(), getServiceTherapists(service.id)])
  if (therapists.length === 0)
    return <EmptyState title="No therapists available" body="This treatment can't be booked online right now. Please call the clinic." action={<ButtonLink href="/book" variant="secondary">Choose another treatment</ButtonLink>} />

  const requested = typeof sp.therapist === 'string' ? sp.therapist : 'any'
  const therapist = requested === 'any' || therapists.some((t) => t.id === requested) ? requested : 'any'
  const now = Date.now()
  const start = typeof sp.start === 'string' && !Number.isNaN(Date.parse(sp.start)) ? sp.start : null
  const requestedWeek = typeof sp.week === 'string' ? sp.week : start ? utcToLocal(Date.parse(start), settings.timeZone).date : null
  const week = await initialWeek({ settings, service, therapist, now }, requestedWeek)
  const initial = await weekAvailability({ settings, service, therapist, weekStart: week, now })

  return (
    <BookTimeStep
      serviceSlug={slug}
      therapists={therapists.map((t) => ({ id: t.id, name: t.name, title: t.title, accent: t.accent }))}
      initialTherapist={therapist}
      initial={initial}
      initialStart={start}
    />
  )
}
