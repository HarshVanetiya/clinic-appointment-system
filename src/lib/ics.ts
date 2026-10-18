/**
 * Minimal RFC 5545 calendar generator for booking invites.
 *
 * - UID is stable per booking, SEQUENCE increments on every reschedule, so
 *   calendar apps update the existing event instead of adding a duplicate.
 * - METHOD:CANCEL with STATUS:CANCELLED removes it again.
 * - All times are written in UTC ("Z"), which every client converts to the
 *   viewer's zone correctly — no VTIMEZONE block needed.
 */

export interface IcsEvent {
  uid: string
  sequence: number
  method: 'REQUEST' | 'CANCEL'
  start: Date
  end: Date
  summary: string
  description: string
  location: string
  url?: string
  organizer: { name: string; email: string }
  attendee: { name: string; email: string }
  /** Defaults to now; injectable for tests. */
  stamp?: Date
}

const CRLF = '\r\n'

export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escape TEXT values (RFC 5545 §3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold content lines longer than 75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8')
    const limit = out.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + len > limit) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += len
  }
  out.push(current)
  return out.join(`${CRLF} `)
}

const paramQuote = (s: string) => `"${s.replace(/"/g, "'")}"`

export function buildIcs(e: IcsEvent): string {
  const cancelled = e.method === 'CANCEL'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Northside Physio//Booking System//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsEscape(cancelled ? `Cancelled: ${e.summary}` : e.summary)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    `LOCATION:${icsEscape(e.location)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    `ORGANIZER;CN=${paramQuote(e.organizer.name)}:mailto:${e.organizer.email}`,
    `ATTENDEE;CN=${paramQuote(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? 'DECLINED' : 'ACCEPTED'};RSVP=FALSE:mailto:${e.attendee.email}`,
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.summary)}`, 'TRIGGER:-PT2H', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}
