import { describe, expect, it } from 'vitest'
import { buildIcs, foldLine, icsDate, icsEscape } from '@/lib/ics'

const base = {
  uid: '7c1f3f0e-1111-4c2a-9a55-0d6c2b9f0001@northside-physio',
  sequence: 0,
  method: 'REQUEST' as const,
  start: new Date('2026-10-19T03:30:00Z'),
  end: new Date('2026-10-19T04:15:00Z'),
  summary: 'Sports massage with Ananya Rao',
  description: 'Ref NP-7K3Q2X\nManage: https://example.com/manage/abc',
  location: '14 Residency Road, Bengaluru',
  organizer: { name: 'Northside Physio', email: 'bookings@example.com' },
  attendee: { name: 'Riya Sharma', email: 'riya@example.com' },
  stamp: new Date('2026-10-18T10:00:00Z'),
}

describe('ics', () => {
  it('formats UTC dates', () => {
    expect(icsDate(new Date('2026-10-19T03:30:00.000Z'))).toBe('20261019T033000Z')
  })

  it('escapes text', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
  })

  it('folds long lines at 75 octets without breaking multi-byte chars', () => {
    const folded = foldLine(`DESCRIPTION:${'₹'.repeat(40)}`)
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'₹'.repeat(40)}`)
  })

  it('builds a valid REQUEST invite', () => {
    const ics = buildIcs(base)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('DTSTART:20261019T033000Z')
    expect(ics).toContain('DTEND:20261019T041500Z')
    expect(ics).toContain('SEQUENCE:0')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('LOCATION:14 Residency Road\\, Bengaluru')
    // Every line ends in CRLF; no bare LF.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('builds a CANCEL with the same UID and a bumped sequence', () => {
    const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 2 })
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain(`UID:${base.uid}`)
    expect(ics).toContain('SEQUENCE:2')
    expect(ics).not.toContain('VALARM')
  })
})
