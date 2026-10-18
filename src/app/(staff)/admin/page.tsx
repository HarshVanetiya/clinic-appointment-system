import { ArrowRight, CalendarCheck2, CalendarPlus, IndianRupee, TrendingUp, UserX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppointmentCard } from '@/components/staff/appointment-card'
import { StatTile, UtilisationTable } from '@/components/staff/stat-tile'
import { StatusBadge } from '@/components/staff/status-badge'
import { ButtonLink } from '@/components/ui/button'
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { formatINR, formatLocalDate, formatShortDate, formatTime } from '@/lib/format'
import { addDays, localToday, startOfWeek } from '@/lib/time'
import { requestNow } from '@/server/clock'
import { requireStaff } from '@/server/dal'
import { getSettings } from '@/server/queries'
import { dashboardStats, listBookings, utilisation } from '@/server/staff-queries'

export const metadata: Metadata = { title: 'Dashboard' }

export default function AdminDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Clinic overview"
        title="Today at a glance"
        actions={
          <ButtonLink href="/admin/bookings/new">
            <CalendarPlus aria-hidden className="size-4" /> New booking
          </ButtonLink>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  )
}

async function Dashboard() {
  const now = await requestNow()
  await requireStaff('admin')
  const settings = await getSettings()
  const tz = settings.timeZone
  const today = localToday(now, tz)
  const weekStart = startOfWeek(today)
  const [stats, util, upcoming] = await Promise.all([
    dashboardStats(today, tz),
    utilisation(weekStart, addDays(weekStart, 6), tz),
    listBookings({ from: addDays(today, 1), to: addDays(today, 7), status: 'confirmed' }, tz, { limit: 8 }),
  ])
  const clinicRate = util.reduce((s, u) => s + u.bookedMin, 0) / Math.max(1, util.reduce((s, u) => s + u.openMin, 0))
  const next = stats.today.find((b) => b.status === 'confirmed' && b.startsAt.getTime() > now)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Today" value={String(stats.todayCount)} sub={next ? `Next: ${formatTime(next.startsAt, tz)} · ${next.patientName.split(' ')[0]}` : 'No more today'} icon={<CalendarCheck2 aria-hidden className="size-4" />} />
        <StatTile label="Expected today" value={formatINR(stats.todayRevenuePaise)} sub="Excludes no-shows" icon={<IndianRupee aria-hidden className="size-4" />} />
        <StatTile label="This week" value={`${Math.round(clinicRate * 100)}%`} sub={`utilised · ${stats.upcomingWeek} upcoming`} icon={<TrendingUp aria-hidden className="size-4" />} />
        <StatTile label="No-show rate" value={`${Math.round(stats.noShowRate * 100)}%`} sub={`last 30 days · ${Math.round(stats.onlineShare * 100)}% booked online`} icon={<UserX aria-hidden className="size-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section aria-labelledby="today-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="today-h" className="text-lg font-bold">
              {formatLocalDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <Link href="/staff" className="text-sm font-semibold text-green hover:underline">
              Full schedule
            </Link>
          </div>
          {stats.today.length ? (
            <div className="space-y-3">
              {stats.today.map((b) => (
                <AppointmentCard key={b.id} b={b} timeZone={tz} now={now} showTherapist />
              ))}
            </div>
          ) : (
            <EmptyState title="A quiet day" body="No appointments today. Sundays are closed by default." />
          )}
        </section>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-lg font-bold">Utilisation this week</h2>
            <p className="mb-4 text-sm text-muted">Booked appointment time ÷ open hours</p>
            <UtilisationTable rows={util} caption="Therapist utilisation this week" />
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Coming up</h2>
              <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm font-semibold text-green hover:underline">
                All <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
            {upcoming.rows.length ? (
              <ul className="divide-y divide-line">
                {upcoming.rows.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="flex items-center gap-3 py-2.5 hover:bg-sage-50">
                      <span className="w-20 shrink-0 text-xs">
                        <span className="block font-semibold">{formatShortDate(b.startsAt, tz)}</span>
                        <span className="text-muted">{formatTime(b.startsAt, tz)}</span>
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-medium">{b.patientName}</span>
                        <span className="block truncate text-xs text-muted">
                          {b.serviceName} · {b.therapistName}
                        </span>
                      </span>
                      <StatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No upcoming bookings in the next 7 days.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      </div>
    </div>
  )
}
