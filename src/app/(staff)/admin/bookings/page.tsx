import { CalendarPlus, Download, Filter, SearchX } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { SOURCE_LABEL, StatusBadge } from '@/components/staff/status-badge'
import { Button, ButtonLink, buttonClass } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Avatar, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { formatINR, formatShortDate, formatTime } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import { filtersToQuery, parseBookingFilters } from '@/server/booking-filters'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings, listActiveTherapists } from '@/server/queries'
import { listBookings } from '@/server/staff-queries'
import { db } from '@/db'
import { services } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Bookings' }
const PAGE_SIZE = 25

export default function BookingsPage({ searchParams }: PageProps<'/admin/bookings'>) {
  return (
    <>
      <PageHeader
        eyebrow="All bookings"
        title="Bookings"
        actions={
          <ButtonLink href="/admin/bookings/new">
            <CalendarPlus aria-hidden className="size-4" /> New booking
          </ButtonLink>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Bookings({ searchParams }: { searchParams: PageProps<'/admin/bookings'>['searchParams'] }) {
  const sp = await searchParams
  const now = await requestNow()
  await requireStaff('admin')
  const settings = await getSettings()
  const tz = settings.timeZone
  const { filters, page } = parseBookingFilters(sp, now, tz)
  const [{ rows, total }, therapists, serviceList] = await Promise.all([
    listBookings(filters, tz, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listActiveTherapists(),
    db.select({ id: services.id, name: services.name }).from(services).orderBy(asc(services.sortOrder)),
  ])
  const query = filtersToQuery(filters)
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageHref = (p: number) => {
    const q = new URLSearchParams(query)
    q.set('page', String(p))
    return `/admin/bookings?${q}` as Route
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" role="search" aria-label="Filter bookings">
          <Field label="Search" htmlFor="q" className="col-span-2 md:col-span-4 xl:col-span-2">
            <Input id="q" name="q" placeholder="Name, email, phone or reference" defaultValue={filters.q} />
          </Field>
          <Field label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={filters.to} />
          </Field>
          <Field label="Therapist" htmlFor="therapist">
            <Select id="therapist" name="therapist" defaultValue={filters.therapistId ?? ''}>
              <option value="">All</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service" htmlFor="service">
            <Select id="service" name="service" defaultValue={filters.serviceId ?? ''}>
              <option value="">All</option>
              {serviceList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={filters.status ?? ''}>
              <option value="">Any</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Source" htmlFor="source">
            <Select id="source" name="source" defaultValue={filters.source ?? ''}>
              <option value="">Any</option>
              <option value="online">Online</option>
              <option value="phone">Phone</option>
              <option value="walk_in">Walk-in</option>
            </Select>
          </Field>
          <div className="col-span-2 flex flex-wrap items-end gap-2 md:col-span-4 xl:col-span-7">
            <Button type="submit" size="sm">
              <Filter aria-hidden className="size-4" /> Apply filters
            </Button>
            <Link href="/admin/bookings" className={buttonClass('ghost', 'sm')}>
              Reset
            </Link>
            <a href={`/admin/bookings/export?${query}`} className={buttonClass('secondary', 'sm', 'ml-auto')} download>
              <Download aria-hidden className="size-4" /> Export CSV
            </a>
          </div>
        </form>
      </Card>

      <p className="text-sm text-muted" aria-live="polite">
        {total} booking{total === 1 ? '' : 's'}
        {total > PAGE_SIZE && ` · page ${page} of ${pages}`}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={<SearchX className="size-5" />} title="No bookings match" body="Try widening the date range or clearing filters." />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings/${b.id}`} className="block rounded-2xl bg-card p-4 ring-1 ring-line">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{b.patientName}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {formatShortDate(b.startsAt, tz)} · {formatTime(b.startsAt, tz)} · {b.serviceName}
                  </p>
                  <p className="text-xs text-muted">
                    {b.therapistName} · <span className="font-mono">{b.reference}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-2xl bg-card ring-1 ring-line md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Bookings</caption>
              <thead className="border-b border-line bg-sage-50 font-mono text-[0.68rem] tracking-wider text-muted uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">When</th>
                  <th scope="col" className="px-4 py-3 font-medium">Patient</th>
                  <th scope="col" className="px-4 py-3 font-medium">Service</th>
                  <th scope="col" className="px-4 py-3 font-medium">Therapist</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => (
                  <tr key={b.id} className="group hover:bg-sage-50/60">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/admin/bookings/${b.id}`} className="font-semibold group-hover:text-green">
                        {formatShortDate(b.startsAt, tz)}
                      </Link>
                      <span className="block text-xs text-muted">{formatTime(b.startsAt, tz)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{b.patientName}</span>
                      <span className="block text-xs text-muted">{formatIndianMobile(b.patientPhone)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {b.serviceName}
                      <span className="block font-mono text-[0.66rem] text-muted uppercase">
                        {b.reference} · {SOURCE_LABEL[b.source]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <Avatar name={b.therapistName} accent={b.therapistAccent} size={22} /> {b.therapistName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.pricePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between">
              {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass('secondary', 'sm')}>Previous</Link> : <span />}
              {page < pages ? <Link href={pageHref(page + 1)} className={buttonClass('secondary', 'sm')}>Next</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
