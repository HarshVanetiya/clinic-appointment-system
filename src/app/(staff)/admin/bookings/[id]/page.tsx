import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { emailLog } from '@/db/schema'
import { BookingActions } from '@/components/staff/booking-actions'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { SOURCE_LABEL, StatusBadge } from '@/components/staff/status-badge'
import { Alert, Avatar, Card, Eyebrow } from '@/components/ui/primitives'
import { formatDateTime, formatDuration, formatINR } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings } from '@/server/queries'
import { getBookingRow } from '@/server/staff-queries'

export const metadata: Metadata = { title: 'Booking' }

export default function BookingDetailPage({ params, searchParams }: PageProps<'/admin/bookings/[id]'>) {
  return (
    <>
      <Link href="/admin/bookings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-green">
        <ArrowLeft aria-hidden className="size-4" /> All bookings
      </Link>
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Detail({ params, searchParams }: Pick<PageProps<'/admin/bookings/[id]'>, 'params' | 'searchParams'>) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const now = await requestNow()
  await requireStaff('admin')
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [b, settings] = await Promise.all([getBookingRow(id), getSettings()])
  if (!b) notFound()
  const emails = await db.select().from(emailLog).where(eq(emailLog.bookingId, id)).orderBy(desc(emailLog.createdAt))
  const tz = settings.timeZone

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {sp.created && <Alert tone="success" title="Booking created">The patient and therapist have been emailed.</Alert>}
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>{b.reference}</Eyebrow>
            <StatusBadge status={b.status} />
            <span className="font-mono text-[0.68rem] text-muted uppercase">{SOURCE_LABEL[b.source]}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">{b.patientName}</h1>
          <p className="mt-1 text-ink-soft">
            {b.serviceName} · {formatDuration(b.durationMin)} · {formatINR(b.pricePaise)}
          </p>
          <p className="mt-3 font-semibold">{formatDateTime(b.startsAt, tz)}</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Avatar name={b.therapistName} accent={b.therapistAccent} size={24} /> {b.therapistName}
          </p>
          {b.notes && <p className="mt-4 rounded-xl bg-sage-50 px-3 py-2 text-sm">“{b.notes}”</p>}
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <a href={`tel:${b.patientPhone}`} className="inline-flex items-center gap-1.5 text-green hover:underline">
              <Phone aria-hidden className="size-4" /> {formatIndianMobile(b.patientPhone)}
            </a>
            <a href={`mailto:${b.patientEmail}`} className="inline-flex items-center gap-1.5 text-green hover:underline">
              <Mail aria-hidden className="size-4" /> {b.patientEmail}
            </a>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <BookingActions id={b.id} status={b.status} isPast={b.startsAt.getTime() < now} />
          </div>
        </Card>
      </div>
      <Card className="h-fit p-5">
        <h2 className="font-bold">Emails</h2>
        {emails.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {emails.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  <span className="block font-medium capitalize">{e.kind.replace(/_/g, ' ')}</span>
                  <span className="block text-xs text-muted">{e.to}</span>
                </span>
                <span className={`font-mono text-[0.66rem] uppercase ${e.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{e.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No emails sent for this booking.</p>
        )}
        <p className="mt-4 text-xs text-muted">Booked {formatDateTime(b.createdAt, tz)}</p>
      </Card>
    </div>
  )
}
