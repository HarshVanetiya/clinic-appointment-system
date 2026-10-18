/**
 * Time-zone primitives. Everything persisted is a UTC instant; recurring rules
 * (working hours, overrides) are expressed as a local calendar date + minutes
 * after local midnight in the clinic's IANA time zone.
 *
 * We deliberately avoid Date's local-time methods: the server's own zone must
 * never leak into the result.
 */

export type LocalDate = string // YYYY-MM-DD

const MINUTE = 60_000
const DAY = 86_400_000

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string) {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

/** Wall-clock fields of a UTC instant in `timeZone`. */
export function zonedParts(ms: number, timeZone: string) {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour! === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  }
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds (IST → +19_800_000). */
export function tzOffsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

export function parseLocalDate(date: LocalDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Invalid local date: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Minutes after midnight for 'HH:MM' or 'HH:MM:SS'. '24:00' is allowed as end of day. */
export function parseWallTime(t: string): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t)
  if (!m) throw new Error(`Invalid wall time: ${t}`)
  const minutes = Number(m[1]) * 60 + Number(m[2])
  if (minutes > 24 * 60) throw new Error(`Invalid wall time: ${t}`)
  return minutes
}

export function formatWallTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Convert a local wall-clock time to a UTC instant.
 *
 * `exists` is false when the wall time falls in a DST spring-forward gap; `ms`
 * is then the instant just after the gap (e.g. 02:30 → 03:30 in Europe/London
 * terms). For ambiguous fall-back times the *earlier* instant is returned.
 */
export function wallToUtc(date: LocalDate, minutes: number, timeZone: string): { ms: number; exists: boolean } {
  const { year, month, day } = parseLocalDate(date)
  const naive = Date.UTC(year, month - 1, day) + minutes * MINUTE
  // Try both candidate offsets (the one before and after any transition near this time).
  const offsetA = tzOffsetMs(naive - DAY / 2, timeZone)
  const offsetB = tzOffsetMs(naive + DAY / 2, timeZone)
  const candidates = [naive - offsetA, naive - offsetB].sort((a, b) => a - b)
  for (const c of candidates) {
    if (c + tzOffsetMs(c, timeZone) === naive) return { ms: c, exists: true }
  }
  // In a gap: neither candidate round-trips. Shift forward by the gap size.
  const after = naive - Math.min(offsetA, offsetB)
  return { ms: after, exists: false }
}

/** Local calendar date + minutes-after-midnight of a UTC instant. */
export function utcToLocal(ms: number, timeZone: string): { date: LocalDate; minutes: number; weekday: number } {
  const p = zonedParts(ms, timeZone)
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  return { date, minutes: p.hour * 60 + p.minute, weekday: weekdayOf(date) }
}

export function localToday(now: Date | number, timeZone: string): LocalDate {
  return utcToLocal(typeof now === 'number' ? now : now.getTime(), timeZone).date
}

/** Pure calendar arithmetic — no time zone involved. */
export function addDays(date: LocalDate, n: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  const pa = parseLocalDate(a)
  const pb = parseLocalDate(b)
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY)
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  const wd = weekdayOf(date)
  return addDays(date, wd === 0 ? -6 : 1 - wd)
}

export function eachDate(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** UTC range covering the whole local day [00:00, next 00:00). */
export function localDayRange(date: LocalDate, timeZone: string): { start: number; end: number } {
  return { start: wallToUtc(date, 0, timeZone).ms, end: wallToUtc(addDays(date, 1), 0, timeZone).ms }
}

export const isLocalDate = (s: string): s is LocalDate => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
