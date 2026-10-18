import 'server-only'
import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { db, type Tx } from '@/db'
import {
  availabilityOverrides,
  bookings,
  clinicSettings,
  services,
  therapistServices,
  therapists,
  workingHours,
  type ClinicSettings,
} from '@/db/schema'
import type { EngineSettings, TherapistSchedule } from '@/lib/availability/engine'
import { addDays, localDayRange, type LocalDate } from '@/lib/time'

type Conn = typeof db | Tx

export async function getSettings(conn: Conn = db): Promise<ClinicSettings> {
  const [row] = await conn.select().from(clinicSettings).where(eq(clinicSettings.id, 1))
  if (!row) throw new Error('Clinic settings missing — run `npm run db:seed`')
  return row
}

export const engineSettings = (s: ClinicSettings): EngineSettings => ({
  timeZone: s.timeZone,
  slotIntervalMin: s.slotIntervalMin,
  minNoticeMin: s.minNoticeMin,
  bookingWindowDays: s.bookingWindowDays,
})

export async function listActiveServices() {
  return db
    .select({
      id: services.id,
      slug: services.slug,
      name: services.name,
      description: services.description,
      durationMin: services.durationMin,
      bufferAfterMin: services.bufferAfterMin,
      pricePaise: services.pricePaise,
      therapistCount: sql<number>`count(${therapists.id})::int`,
    })
    .from(services)
    .leftJoin(therapistServices, eq(therapistServices.serviceId, services.id))
    .leftJoin(therapists, and(eq(therapists.id, therapistServices.therapistId), eq(therapists.active, true)))
    .where(eq(services.active, true))
    .groupBy(services.id)
    .orderBy(asc(services.sortOrder), asc(services.name))
}

export async function getServiceBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.slug, slug), eq(services.active, true)))
  return row ?? null
}

export async function getServiceById(id: string, conn: Conn = db) {
  const [row] = await conn.select().from(services).where(eq(services.id, id))
  return row ?? null
}

/** Active therapists offering a service, with public profile fields only. */
export async function therapistsForService(serviceId: string, conn: Conn = db) {
  return conn
    .select({ id: therapists.id, slug: therapists.slug, name: therapists.name, title: therapists.title, bio: therapists.bio, accent: therapists.accent })
    .from(therapists)
    .innerJoin(therapistServices, eq(therapistServices.therapistId, therapists.id))
    .where(and(eq(therapistServices.serviceId, serviceId), eq(therapists.active, true)))
    .orderBy(asc(therapists.name))
}

export async function listActiveTherapists() {
  return db
    .select({ id: therapists.id, slug: therapists.slug, name: therapists.name, title: therapists.title, bio: therapists.bio, accent: therapists.accent })
    .from(therapists)
    .where(eq(therapists.active, true))
    .orderBy(asc(therapists.name))
}

/**
 * Load everything the engine needs for these therapists over [from, to] local dates.
 * `excludeBookingId` lets a reschedule ignore the booking being moved.
 */
export async function loadSchedules(
  therapistIds: string[],
  from: LocalDate,
  to: LocalDate,
  timeZone: string,
  opts: { excludeBookingId?: string; conn?: Conn } = {},
): Promise<TherapistSchedule[]> {
  if (therapistIds.length === 0) return []
  const conn = opts.conn ?? db
  const rangeStart = new Date(localDayRange(from, timeZone).start)
  // Bookings that start up to a day later can't affect `to`, but ones that start
  // before `from` and run into it can — widen by a day on each side.
  const rangeEnd = new Date(localDayRange(addDays(to, 1), timeZone).end)
  const widenedStart = new Date(rangeStart.getTime() - 86_400_000)

  const [hours, overrides, busy] = await Promise.all([
    conn.select().from(workingHours).where(inArray(workingHours.therapistId, therapistIds)),
    conn
      .select()
      .from(availabilityOverrides)
      .where(
        and(
          gte(availabilityOverrides.date, from),
          lt(availabilityOverrides.date, addDays(to, 1)),
          or(inArray(availabilityOverrides.therapistId, therapistIds), isNull(availabilityOverrides.therapistId)),
        ),
      ),
    conn
      .select({ therapistId: bookings.therapistId, startsAt: bookings.startsAt, blockedUntil: bookings.blockedUntil })
      .from(bookings)
      .where(
        and(
          inArray(bookings.therapistId, therapistIds),
          ne(bookings.status, 'cancelled'),
          lt(bookings.startsAt, rangeEnd),
          gte(bookings.blockedUntil, widenedStart),
          opts.excludeBookingId ? ne(bookings.id, opts.excludeBookingId) : undefined,
        ),
      ),
  ])

  return therapistIds.map((therapistId) => ({
    therapistId,
    weeklyHours: hours
      .filter((h) => h.therapistId === therapistId)
      .map((h) => ({ weekday: h.weekday, start: h.startTime, end: h.endTime })),
    overrides: overrides
      .filter((o) => o.therapistId === null || o.therapistId === therapistId)
      .map((o) => ({ date: o.date, kind: o.kind, start: o.startTime, end: o.endTime })),
    busy: busy
      .filter((b) => b.therapistId === therapistId)
      .map((b) => ({ start: b.startsAt.getTime(), end: b.blockedUntil.getTime() })),
  }))
}
