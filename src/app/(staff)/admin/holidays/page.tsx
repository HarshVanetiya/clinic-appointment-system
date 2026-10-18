import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HolidayForm } from '@/components/staff/holiday-form'
import { OverrideList } from '@/components/staff/override-list'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { TimeOffForm } from '@/components/staff/time-off-form'
import { PageHeader } from '@/components/ui/primitives'
import { localToday } from '@/lib/time'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings, listActiveTherapists } from '@/server/queries'
import { listOverrides } from '@/server/staff-queries'

export const metadata: Metadata = { title: 'Holidays & time off' }

export default function HolidaysPage() {
  return (
    <>
      <PageHeader eyebrow="Availability" title="Holidays & time off" description="Closures and leave remove times from online booking straight away." />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Holidays />
      </Suspense>
    </>
  )
}

async function Holidays() {
  const now = await requestNow()
  await requireStaff('admin')
  const settings = await getSettings()
  const today = localToday(now, settings.timeZone)
  const [items, therapists] = await Promise.all([listOverrides({ from: today }), listActiveTherapists()])
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr] xl:items-start">
      <div className="space-y-6">
        <HolidayForm today={today} />
        <TimeOffForm therapists={therapists} defaultTherapistId={therapists[0]?.id} today={today} />
      </div>
      <div className="space-y-6">
        <section aria-labelledby="closures-h">
          <h2 id="closures-h" className="mb-3 text-lg font-bold">Clinic closures</h2>
          <OverrideList items={items.filter((o) => o.therapistId === null)} emptyText="No closures planned." />
        </section>
        <section aria-labelledby="leave-h">
          <h2 id="leave-h" className="mb-3 text-lg font-bold">Therapist time off & extra hours</h2>
          <OverrideList items={items.filter((o) => o.therapistId !== null)} showTherapist emptyText="No time off booked." />
        </section>
      </div>
    </div>
  )
}
