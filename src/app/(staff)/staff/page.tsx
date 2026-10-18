import { CalendarDays, ChevronLeft, ChevronRight, Coffee } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppointmentCard } from '@/components/staff/appointment-card'
import { ListSkeleton } from '@/components/staff/schedule-skeleton'
import { buttonClass } from '@/components/ui/button'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { formatLocalDate, formatTime } from '@/lib/format'
import { addDays, eachDate, isLocalDate, localToday, startOfWeek, utcToLocal } from '@/lib/time'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings, listActiveTherapists } from '@/server/queries'
import { listBookings } from '@/server/staff-queries'

export const metadata: Metadata = { title: 'Schedule' }

export default function SchedulePage({ searchParams }: PageProps<'/staff'>) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Schedule searchParams={searchParams} />
    </Suspense>
  )
}

async function Schedule({ searchParams }: { searchParams: PageProps<'/staff'>['searchParams'] }) {
  const sp = await searchParams
  const now = await requestNow()
  const staff = await requireStaff()
  const settings = await getSettings()
  const tz = settings.timeZone
  const today = localToday(now, tz)
  const view = sp.view === 'week' ? 'week' : 'day'
  const date = typeof sp.date === 'string' && isLocalDate(sp.date) ? sp.date : today

  const therapists = staff.role === 'admin' ? await listActiveTherapists() : []
  // Therapists always see their own diary; admins can pick one or see everyone.
  const therapistId =
    staff.role === 'admin' ? (typeof sp.therapist === 'string' && therapists.some((t) => t.id === sp.therapist) ? sp.therapist : undefined) : (staff.therapistId ?? '__none__')

  const from = view === 'week' ? startOfWeek(date) : date
  const to = view === 'week' ? addDays(from, 6) : date
  const { rows } = therapistId === '__none__' ? { rows: [] } : await listBookings({ from, to, therapistId }, tz)
  const active = rows.filter((r) => r.status !== 'cancelled')

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ view, date, ...(therapistId && therapistId !== '__none__' && staff.role === 'admin' ? { therapist: therapistId } : {}) })
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) p.delete(k)
      else p.set(k, v)
    }
    return `/staff?${p}` as Route
  }
  const step = view === 'week' ? 7 : 1
  const title =
    view === 'week'
      ? `${formatLocalDate(from, { day: 'numeric', month: 'short' })} – ${formatLocalDate(to, { day: 'numeric', month: 'short' })}`
      : date === today
        ? 'Today'
        : formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader
        eyebrow={staff.role === 'admin' ? 'Schedules' : `Hi, ${staff.name.replace(/^Dr\.?\s+/, '').split(' ')[0]}`}
        title={title}
        description={`${active.length} appointment${active.length === 1 ? '' : 's'}`}
        actions={
          <>
            <div className="inline-flex rounded-full bg-sage-100 p-1" role="group" aria-label="View">
              {(['day', 'week'] as const).map((v) => (
                <Link key={v} href={href({ view: v })} aria-current={view === v ? 'true' : undefined} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold capitalize', view === v ? 'bg-card shadow-soft' : 'text-muted')}>
                  {v}
                </Link>
              ))}
            </div>
            <div className="inline-flex items-center gap-1">
              <Link href={href({ date: addDays(date, -step) })} aria-label={`Previous ${view}`} className={buttonClass('ghost', 'sm', 'w-9 px-0')}>
                <ChevronLeft aria-hidden className="size-4" />
              </Link>
              <Link href={href({ date: today })} className={buttonClass('secondary', 'sm')}>
                Today
              </Link>
              <Link href={href({ date: addDays(date, step) })} aria-label={`Next ${view}`} className={buttonClass('ghost', 'sm', 'w-9 px-0')}>
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </>
        }
      />

      {staff.role === 'admin' && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Therapist">
          {[{ id: undefined, name: 'All therapists' }, ...therapists].map((t) => (
            <Link
              key={t.id ?? 'all'}
              href={href({ therapist: t.id })}
              aria-current={therapistId === t.id ? 'true' : undefined}
              className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1', therapistId === t.id ? 'bg-ink text-white ring-ink' : 'bg-card text-ink-soft ring-line hover:ring-green/50')}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {therapistId === '__none__' ? (
        <EmptyState icon={<CalendarDays className="size-5" />} title="No therapist profile linked" body="Ask the clinic admin to link your login to a therapist profile." />
      ) : view === 'day' ? (
        rows.length ? (
          <div className="space-y-3">
            {rows.map((b) => (
              <AppointmentCard key={b.id} b={b} timeZone={tz} now={now} showTherapist={staff.role === 'admin' && !therapistId} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Coffee className="size-5" />} title="Nothing booked" body={date < today ? 'No appointments on this day.' : 'No appointments yet — new bookings will appear here automatically.'} />
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-7">
          {eachDate(from, to).map((d) => {
            const dayRows = rows.filter((r) => utcToLocal(r.startsAt.getTime(), tz).date === d)
            return (
              <section key={d} aria-label={formatLocalDate(d, { weekday: 'long', day: 'numeric', month: 'long' })} className="min-w-0">
                <Link href={href({ view: 'day', date: d })} className={cn('mb-2 flex items-baseline gap-2 rounded-lg', d === today && 'text-green')}>
                  <span className="font-mono text-xs uppercase">{formatLocalDate(d, { weekday: 'short' })}</span>
                  <span className="font-display text-lg font-bold">{formatLocalDate(d, { day: 'numeric' })}</span>
                  <span className="text-xs text-muted">{dayRows.filter((r) => r.status !== 'cancelled').length || ''}</span>
                </Link>
                <div className="space-y-2">
                  {dayRows.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">Free</p>}
                  {dayRows.map((b) => (
                    <Link
                      key={b.id}
                      href={href({ view: 'day', date: d })}
                      className={cn('block rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-line hover:shadow-soft', b.status === 'cancelled' && 'line-through opacity-50')}
                      style={{ borderLeft: `3px solid ${b.therapistAccent}` }}
                    >
                      <span className="font-semibold tabular-nums">{formatTime(b.startsAt, tz)}</span>
                      <span className="block truncate">{b.patientName}</span>
                      <span className="block truncate text-xs text-muted">{b.serviceName}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
