/**
 * Availability engine — a pure function of its inputs (no I/O, no clock reads),
 * so it can be exhaustively unit-tested.
 *
 * Rules
 *  - Open time for a day = (weekly hours ∪ extra-hours overrides) − closures − time off.
 *    Closures and time off always win over extra hours.
 *  - Slot starts sit on the clinic's local wall-clock grid (every `slotIntervalMin`
 *    minutes from local midnight), so slots read :00/:15/:30/:45 in any zone,
 *    including half-hour offsets like IST (UTC+05:30).
 *  - The appointment itself [start, start + duration) must fit inside open time.
 *  - The buffer after it may run past closing, but [start, start + duration + buffer)
 *    must not overlap any existing booking's [start, blockedUntil) — which already
 *    includes that booking's own buffer. This mirrors the database's exclusion
 *    constraint exactly.
 *  - start ≥ now + minimum notice, and start's local date ≤ today + booking window.
 *  - Wall times that do not exist (DST spring-forward gap) are never offered; on a
 *    fall-back day the repeated hour is offered once (its first occurrence).
 */
import {
  addDays,
  diffDays,
  eachDate,
  localDayRange,
  localToday,
  parseWallTime,
  utcToLocal,
  wallToUtc,
  weekdayOf,
  type LocalDate,
} from '@/lib/time'

const MINUTE = 60_000

export interface Interval {
  start: number // epoch ms (UTC)
  end: number // exclusive
}

export interface WeeklyHours {
  weekday: number // 0 = Sunday
  start: string // 'HH:MM[:SS]' local
  end: string
}

export type OverrideKind = 'closed' | 'time_off' | 'extra_hours'

export interface DateOverride {
  date: LocalDate
  kind: OverrideKind
  /** null/undefined start+end means the whole day. */
  start?: string | null
  end?: string | null
}

export interface EngineSettings {
  timeZone: string
  slotIntervalMin: number
  minNoticeMin: number
  bookingWindowDays: number
}

export interface ServiceSpec {
  durationMin: number
  bufferAfterMin: number
}

export interface TherapistSchedule {
  therapistId: string
  weeklyHours: WeeklyHours[]
  /** Therapist-specific and clinic-wide overrides, already merged by the caller. */
  overrides: DateOverride[]
  /** Existing non-cancelled bookings as [startsAt, blockedUntil). */
  busy: Interval[]
}

export interface Slot {
  start: number
  end: number
  therapistId: string
}

export interface AggregatedSlot {
  start: number
  end: number
  therapistIds: string[]
}

export interface GenerateInput {
  settings: EngineSettings
  service: ServiceSpec
  schedule: TherapistSchedule
  from: LocalDate
  to: LocalDate
  now: number
}

/* ----------------------------- interval algebra ---------------------------- */

export function normalize(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ ...i })
  }
  return out
}

export function subtract(base: Interval[], remove: Interval[]): Interval[] {
  let result = normalize(base)
  for (const r of normalize(remove)) {
    const next: Interval[] = []
    for (const b of result) {
      if (r.end <= b.start || r.start >= b.end) {
        next.push(b)
        continue
      }
      if (r.start > b.start) next.push({ start: b.start, end: r.start })
      if (r.end < b.end) next.push({ start: r.end, end: b.end })
    }
    result = next
  }
  return result
}

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/* ------------------------------- open time --------------------------------- */

function toInterval(date: LocalDate, start: string, end: string, timeZone: string): Interval {
  return {
    start: wallToUtc(date, parseWallTime(start), timeZone).ms,
    end: wallToUtc(date, parseWallTime(end), timeZone).ms,
  }
}

/** Open (bookable) time for one local date, before bookings are removed. */
export function openIntervalsForDate(schedule: TherapistSchedule, date: LocalDate, timeZone: string): Interval[] {
  const weekday = weekdayOf(date)
  const dayOverrides = schedule.overrides.filter((o) => o.date === date)

  const add: Interval[] = schedule.weeklyHours
    .filter((h) => h.weekday === weekday)
    .map((h) => toInterval(date, h.start, h.end, timeZone))

  const remove: Interval[] = []
  for (const o of dayOverrides) {
    if (o.kind === 'extra_hours') {
      if (o.start && o.end) add.push(toInterval(date, o.start, o.end, timeZone))
      continue
    }
    remove.push(o.start && o.end ? toInterval(date, o.start, o.end, timeZone) : toInterval(date, '00:00', '24:00', timeZone))
  }
  return subtract(add, remove)
}

/* --------------------------------- slots ----------------------------------- */

export function generateSlots({ settings, service, schedule, from, to, now }: GenerateInput): Slot[] {
  const { timeZone, slotIntervalMin, minNoticeMin, bookingWindowDays } = settings
  if (slotIntervalMin <= 0) throw new Error('slotIntervalMin must be positive')

  const today = localToday(now, timeZone)
  const lastDate = addDays(today, bookingWindowDays)
  const firstDate = from < today ? today : from
  const endDate = to > lastDate ? lastDate : to
  if (firstDate > endDate) return []

  const earliest = now + minNoticeMin * MINUTE
  const durationMs = service.durationMin * MINUTE
  const blockMs = (service.durationMin + service.bufferAfterMin) * MINUTE
  const busy = normalize(schedule.busy)
  const slots: Slot[] = []

  for (const date of eachDate(firstDate, endDate)) {
    const open = openIntervalsForDate(schedule, date, timeZone)
    if (open.length === 0) continue

    const day = localDayRange(date, timeZone)
    // Fast path: no DST transition today, so local minutes map linearly onto UTC.
    const linear = day.end - day.start === 24 * 60 * MINUTE

    for (let minutes = 0; minutes < 24 * 60; minutes += slotIntervalMin) {
      let start: number
      if (linear) {
        start = day.start + minutes * MINUTE
      } else {
        const converted = wallToUtc(date, minutes, timeZone)
        if (!converted.exists) continue
        start = converted.ms
        // Fall-back day: a repeated wall hour maps to its first instant; make sure
        // the round trip lands on exactly this local date + minute.
        const back = utcToLocal(start, timeZone)
        if (back.date !== date || back.minutes !== minutes) continue
      }
      if (start < earliest) continue

      const appt: Interval = { start, end: start + durationMs }
      if (!open.some((o) => appt.start >= o.start && appt.end <= o.end)) continue

      const block: Interval = { start, end: start + blockMs }
      if (busy.some((b) => overlaps(b, block))) continue

      slots.push({ start, end: appt.end, therapistId: schedule.therapistId })
    }
  }
  return slots
}

/** "Any available": the union of every therapist's slots, keyed by start time. */
export function aggregateSlots(perTherapist: Slot[][]): AggregatedSlot[] {
  const byStart = new Map<number, AggregatedSlot>()
  for (const list of perTherapist) {
    for (const s of list) {
      const existing = byStart.get(s.start)
      if (existing) existing.therapistIds.push(s.therapistId)
      else byStart.set(s.start, { start: s.start, end: s.end, therapistIds: [s.therapistId] })
    }
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start)
}

/** Nearest alternatives to a requested start (closest first; ties prefer the earlier one), returned in time order. */
export function nearestSlots<T extends { start: number }>(slots: T[], target: number, count: number): T[] {
  return [...slots]
    .filter((s) => s.start !== target)
    .sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target) || a.start - b.start)
    .slice(0, count)
    .sort((a, b) => a.start - b.start)
}

/** Is this exact start time bookable for this therapist? */
export function isSlotAvailable(input: Omit<GenerateInput, 'from' | 'to'> & { start: number }): boolean {
  const { date } = utcToLocal(input.start, input.settings.timeZone)
  return generateSlots({ ...input, from: date, to: date }).some((s) => s.start === input.start)
}

/** Booking-window helper for UIs: the last bookable local date. */
export function lastBookableDate(now: number, settings: EngineSettings): LocalDate {
  return addDays(localToday(now, settings.timeZone), settings.bookingWindowDays)
}

export function daysUntil(now: number, date: LocalDate, timeZone: string): number {
  return diffDays(localToday(now, timeZone), date)
}
