import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PickerSkeleton } from '@/components/booking/picker-skeleton'
import { StaffBookingForm } from '@/components/staff/staff-booking-form'
import { PageHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import { initialWeek, weekAvailability } from '@/server/availability-view'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings, listActiveServices, therapistsForService } from '@/server/queries'

export const metadata: Metadata = { title: 'New booking' }

export default function NewBookingPage({ searchParams }: PageProps<'/admin/bookings/new'>) {
  return (
    <>
      <PageHeader eyebrow="Front desk" title="New booking" description="For phone calls and walk-ins. Minimum notice doesn't apply." />
      <Suspense fallback={<PickerSkeleton />}>
        <NewBooking searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function NewBooking({ searchParams }: { searchParams: PageProps<'/admin/bookings/new'>['searchParams'] }) {
  const sp = await searchParams
  const now = await requestNow()
  await requireStaff('admin')
  const [settings, serviceList] = await Promise.all([getSettings(), listActiveServices()])
  const service = serviceList.find((s) => s.slug === sp.service) ?? serviceList[0]
  if (!service) return <p className="text-muted">Add a service first.</p>
  const therapists = await therapistsForService(service.id)
  const week = await initialWeek({ settings, service, therapist: 'any', now, staff: true })
  const initial = await weekAvailability({ settings, service, therapist: 'any', weekStart: week, now, staff: true })

  return (
    <div className="space-y-5">
      <nav aria-label="Service" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {serviceList.map((s) => (
          <Link
            key={s.id}
            href={`/admin/bookings/new?service=${s.slug}` as Route}
            aria-current={s.id === service.id ? 'true' : undefined}
            className={cn('shrink-0 rounded-2xl px-4 py-2 text-sm ring-1', s.id === service.id ? 'bg-ink text-white ring-ink' : 'bg-card ring-line hover:ring-green/50')}
          >
            <span className="block font-semibold">{s.name}</span>
            <span className="block text-xs opacity-75">{formatDuration(s.durationMin)}</span>
          </Link>
        ))}
      </nav>
      <StaffBookingForm
        key={service.id}
        serviceId={service.id}
        serviceSlug={service.slug}
        therapists={therapists.map((t) => ({ id: t.id, name: t.name, title: t.title, accent: t.accent }))}
        initial={initial}
      />
    </div>
  )
}
