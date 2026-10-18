import type { Metadata } from 'next'
import { Suspense } from 'react'
import { OverrideList } from '@/components/staff/override-list'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { TimeOffForm } from '@/components/staff/time-off-form'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { localToday } from '@/lib/time'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings, listActiveTherapists } from '@/server/queries'
import { listOverrides } from '@/server/staff-queries'

export const metadata: Metadata = { title: 'Time off' }

export default function TimeOffPage() {
  return (
    <>
      <PageHeader eyebrow="Availability" title="Time off" description="Block out leave, training or appointments of your own." />
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <TimeOff />
      </Suspense>
    </>
  )
}

async function TimeOff() {
  const now = await requestNow()
  const staff = await requireStaff()
  const settings = await getSettings()
  const today = localToday(now, settings.timeZone)
  const isAdmin = staff.role === 'admin'
  if (!isAdmin && !staff.therapistId) return <EmptyState title="No therapist profile linked" body="Ask the clinic admin to link your login to a therapist profile." />
  const therapists = isAdmin ? await listActiveTherapists() : undefined
  const items = await listOverrides({ from: today, therapistIds: isAdmin ? undefined : [staff.therapistId!] })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
      <TimeOffForm therapists={therapists} defaultTherapistId={staff.therapistId ?? therapists?.[0]?.id} today={today} />
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-bold">
          Upcoming
        </h2>
        <OverrideList items={items.filter((o) => isAdmin || o.therapistId !== null)} showTherapist={isAdmin} emptyText="No time off booked." />
      </section>
    </div>
  )
}
