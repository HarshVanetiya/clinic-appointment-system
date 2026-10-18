import 'server-only'
import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { availabilityOverrides, bookings, services, therapists, type Booking } from '@/db/schema'
import { normalize, openIntervalsForDate } from '@/lib/availability/engine'
import { addDays, eachDate, localDayRange, type LocalDate } from '@/lib/time'
import { loadSchedules } from './queries'

export type BookingStatus = Booking['status']
export type BookingSource = Booking['source']

export interface BookingFilters {
  from: LocalDate
  to: LocalDate
  therapistId?: string
  serviceId?: string
  status?: BookingStatus
  source?: BookingSource
  q?: string
}

const bookingColumns = {
  id: bookings.id,
  reference: bookings.reference,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  status: bookings.status,
  source: bookings.source,
  patientName: bookings.patientName,
  patientEmail: bookings.patientEmail,
  patientPhone: bookings.patientPhone,
  notes: bookings.notes,
  pricePaise: bookings.pricePaise,
  durationMin: bookings.durationMin,
  createdAt: bookings.createdAt,
  therapistId: bookings.therapistId,
  therapistName: therapists.name,
  therapistAccent: therapists.accent,
  serviceId: bookings.serviceId,
  serviceName: services.name,
}

export type BookingRow = Awaited<ReturnType<typeof listBookings>>['rows'][number]

function filterWhere(f: BookingFilters, timeZone: string): SQL | undefined {
  const start = new Date(localDayRange(f.from, timeZone).start)
  const end = new Date(localDayRange(f.to, timeZone).end)
  const q = f.q?.trim()
  return and(
    gte(bookings.startsAt, start),
    lt(bookings.startsAt, end),
    f.therapistId ? eq(bookings.therapistId, f.therapistId) : undefined,
    f.serviceId ? eq(bookings.serviceId, f.serviceId) : undefined,
    f.status ? eq(bookings.status, f.status) : undefined,
    f.source ? eq(bookings.source, f.source) : undefined,
    q
      ? or(
          ilike(bookings.patientName, `%${q}%`),
          ilike(bookings.patientEmail, `%${q}%`),
          ilike(bookings.reference, `%${q}%`),
          ilike(bookings.patientPhone, `%${q.replace(/\D/g, '') || q}%`),
        )
      : undefined,
  )
}

export async function listBookings(f: BookingFilters, timeZone: string, opts: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}) {
  const where = filterWhere(f, timeZone)
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select(bookingColumns)
      .from(bookings)
      .innerJoin(therapists, eq(therapists.id, bookings.therapistId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .where(where)
      .orderBy(opts.order === 'desc' ? desc(bookings.startsAt) : asc(bookings.startsAt))
      .limit(opts.limit ?? 1000)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(bookings).where(where),
  ])
  return { rows, total }
}

export async function getBookingRow(id: string) {
  const [row] = await db
    .select(bookingColumns)
    .from(bookings)
    .innerJoin(therapists, eq(therapists.id, bookings.therapistId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(eq(bookings.id, id))
  return row ?? null
}

/**
 * Utilisation = booked appointment minutes ÷ open (bookable) minutes, per therapist,
 * over [from, to]. Open minutes come from the same engine the booking flow uses.
 */
export async function utilisation(from: LocalDate, to: LocalDate, timeZone: string) {
  const ts = await db.select({ id: therapists.id, name: therapists.name, accent: therapists.accent }).from(therapists).where(eq(therapists.active, true)).orderBy(asc(therapists.name))
  const schedules = await loadSchedules(
    ts.map((t) => t.id),
    from,
    to,
    timeZone,
  )
  const start = new Date(localDayRange(from, timeZone).start)
  const end = new Date(localDayRange(to, timeZone).end)
  const booked = await db
    .select({ therapistId: bookings.therapistId, minutes: sql<number>`coalesce(sum(${bookings.durationMin}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(ne(bookings.status, 'cancelled'), gte(bookings.startsAt, start), lt(bookings.startsAt, end)))
    .groupBy(bookings.therapistId)

  return ts.map((t) => {
    const schedule = schedules.find((s) => s.therapistId === t.id)!
    const openMin = eachDate(from, to).reduce(
      (sum, d) => sum + normalize(openIntervalsForDate(schedule, d, timeZone)).reduce((m, i) => m + (i.end - i.start) / 60_000, 0),
      0,
    )
    const b = booked.find((x) => x.therapistId === t.id)
    const bookedMin = b?.minutes ?? 0
    return { ...t, openMin, bookedMin, appointments: b?.n ?? 0, rate: openMin ? Math.min(1, bookedMin / openMin) : 0 }
  })
}

export async function dashboardStats(today: LocalDate, timeZone: string) {
  const day = localDayRange(today, timeZone)
  const weekEnd = localDayRange(addDays(today, 6), timeZone).end
  const [todayRows, [upcoming], [last30]] = await Promise.all([
    listBookings({ from: today, to: today }, timeZone).then((r) => r.rows),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.status, 'confirmed'), gte(bookings.startsAt, new Date(day.end)), lt(bookings.startsAt, new Date(weekEnd)))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        noShows: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')::int`,
        cancelled: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
        online: sql<number>`count(*) filter (where ${bookings.source} = 'online')::int`,
      })
      .from(bookings)
      .where(and(gte(bookings.startsAt, new Date(day.start - 30 * 86_400_000)), lt(bookings.startsAt, new Date(day.start)))),
  ])
  const active = todayRows.filter((r) => r.status !== 'cancelled')
  return {
    today: todayRows,
    todayCount: active.length,
    todayRevenuePaise: active.filter((r) => r.status !== 'no_show').reduce((s, r) => s + r.pricePaise, 0),
    upcomingWeek: upcoming?.n ?? 0,
    noShowRate: last30?.total ? (last30.noShows ?? 0) / last30.total : 0,
    onlineShare: last30?.total ? (last30.online ?? 0) / last30.total : 0,
  }
}

export async function listOverrides(opts: { from: LocalDate; therapistIds?: string[]; clinicOnly?: boolean }) {
  return db
    .select({
      id: availabilityOverrides.id,
      therapistId: availabilityOverrides.therapistId,
      therapistName: therapists.name,
      date: availabilityOverrides.date,
      kind: availabilityOverrides.kind,
      startTime: availabilityOverrides.startTime,
      endTime: availabilityOverrides.endTime,
      reason: availabilityOverrides.reason,
    })
    .from(availabilityOverrides)
    .leftJoin(therapists, eq(therapists.id, availabilityOverrides.therapistId))
    .where(
      and(
        gte(availabilityOverrides.date, opts.from),
        opts.clinicOnly ? sql`${availabilityOverrides.therapistId} is null` : undefined,
        opts.therapistIds ? inArray(availabilityOverrides.therapistId, opts.therapistIds) : undefined,
      ),
    )
    .orderBy(asc(availabilityOverrides.date), asc(availabilityOverrides.startTime))
}
