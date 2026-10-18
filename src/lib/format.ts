/**
 * Display formatting — always in the clinic's time zone and locale (en-IN),
 * never the viewer's or the server's.
 */
import { utcToLocal, type LocalDate } from './time'

export const CLINIC_LOCALE = 'en-IN'

const inr = new Intl.NumberFormat(CLINIC_LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrPrecise = new Intl.NumberFormat(CLINIC_LOCALE, { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

/** ₹1,500 (whole rupees) or ₹1,499.50 when there are paise. */
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? inr.format(paise / 100) : inrPrecise.format(paise / 100)
}

type DateLike = Date | number

const toDate = (d: DateLike) => (typeof d === 'number' ? new Date(d) : d)

function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(CLINIC_LOCALE, { timeZone, ...opts })
}

/** "9:30 am" */
export const formatTime = (d: DateLike, timeZone: string) =>
  fmt(timeZone, { hour: 'numeric', minute: '2-digit', hour12: true }).format(toDate(d)).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`)

/** "Mon, 19 Oct" */
export const formatShortDate = (d: DateLike, timeZone: string) => fmt(timeZone, { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(d))

/** "Monday, 19 October 2026" */
export const formatLongDate = (d: DateLike, timeZone: string) =>
  fmt(timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d))

/** "Monday, 19 October 2026 at 9:30 am" */
export const formatDateTime = (d: DateLike, timeZone: string) => `${formatLongDate(d, timeZone)} at ${formatTime(d, timeZone)}`

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Format a LocalDate (a calendar day, no instant) — used by client components.
 * Deliberately not Intl: Node and browsers ship different ICU data, and en-IN
 * output differs between them ("Monday, 19 October" vs "Monday 19 October"),
 * which would break hydration. Output: "Mon, 19 Oct 2026" style, parts optional.
 */
export function formatLocalDate(
  date: LocalDate,
  opts: { weekday?: 'short' | 'long'; day?: 'numeric'; month?: 'short' | 'long'; year?: 'numeric' },
): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const weekday = opts.weekday ? (opts.weekday === 'long' ? WEEKDAYS[wd]! : WEEKDAYS[wd]!.slice(0, 3)) : ''
  const month = opts.month ? (opts.month === 'long' ? MONTHS[m - 1]! : MONTHS[m - 1]!.slice(0, 3)) : ''
  const dayMonth = [opts.day ? String(d) : '', month].filter(Boolean).join(' ')
  const tail = [dayMonth, opts.year ? String(y) : ''].filter(Boolean).join(' ')
  return weekday && tail ? `${weekday}, ${tail}` : weekday || tail
}

export const localDateOf = (d: DateLike, timeZone: string) => utcToLocal(toDate(d).getTime(), timeZone).date

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
