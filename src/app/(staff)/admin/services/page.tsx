import { ChevronDown, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import { asc } from 'drizzle-orm'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { db } from '@/db'
import { services, therapistServices } from '@/db/schema'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { ServiceForm } from '@/components/staff/service-form'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
import { formatDuration, formatINR } from '@/lib/format'
import { requireStaff } from '@/server/dal'
import { listActiveTherapists } from '@/server/queries'

export const metadata: Metadata = { title: 'Services' }

export default function ServicesPage() {
  return (
    <>
      <PageHeader eyebrow="Catalogue" title="Services" description="Durations, buffers and prices. Changes apply to new bookings immediately." />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Services />
      </Suspense>
    </>
  )
}

async function Services() {
  await connection()
  await requireStaff('admin')
  const [rows, links, therapists] = await Promise.all([
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(therapistServices),
    listActiveTherapists(),
  ])
  const t = therapists.map((x) => ({ id: x.id, name: x.name }))
  return (
    <div className="space-y-3">
      {rows.map((s) => {
        const ids = links.filter((l) => l.serviceId === s.id).map((l) => l.therapistId)
        return (
          <details key={s.id} className="group card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center gap-4 p-5 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold">{s.name}</h2>
                  {!s.active && <Badge tone="warn">Hidden</Badge>}
                </div>
                <p className="text-sm text-muted">
                  {formatDuration(s.durationMin)} + {s.bufferAfterMin} min buffer · {ids.length} therapist{ids.length === 1 ? '' : 's'}
                </p>
              </div>
              <span className="font-display font-bold text-green">{formatINR(s.pricePaise)}</span>
              <ChevronDown aria-hidden className="size-5 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line p-5">
              <ServiceForm service={{ ...s, therapistIds: ids }} therapists={t} />
            </div>
          </details>
        )
      })}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <Plus aria-hidden className="size-4 text-green" /> Add a service
        </h2>
        <ServiceForm therapists={t} />
      </Card>
    </div>
  )
}
