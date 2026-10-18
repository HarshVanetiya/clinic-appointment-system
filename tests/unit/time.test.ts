import { describe, expect, it } from 'vitest'
import {
  addDays,
  diffDays,
  localDayRange,
  localToday,
  parseWallTime,
  startOfWeek,
  tzOffsetMs,
  utcToLocal,
  wallToUtc,
  weekdayOf,
} from '@/lib/time'

const iso = (ms: number) => new Date(ms).toISOString()

describe('wallToUtc', () => {
  it('converts IST (fixed +05:30, no DST)', () => {
    expect(iso(wallToUtc('2026-10-19', 9 * 60, 'Asia/Kolkata').ms)).toBe('2026-10-19T03:30:00.000Z')
    expect(iso(wallToUtc('2026-10-19', 0, 'Asia/Kolkata').ms)).toBe('2026-10-18T18:30:00.000Z')
  })

  it('keeps 09:00 local stable across the London spring-forward', () => {
    expect(iso(wallToUtc('2026-03-28', 9 * 60, 'Europe/London').ms)).toBe('2026-03-28T09:00:00.000Z')
    expect(iso(wallToUtc('2026-03-30', 9 * 60, 'Europe/London').ms)).toBe('2026-03-30T08:00:00.000Z')
  })

  it('flags non-existent times in the spring-forward gap and shifts them forward', () => {
    const r = wallToUtc('2026-03-29', 60 + 30, 'Europe/London') // 01:30 does not exist
    expect(r.exists).toBe(false)
    expect(iso(r.ms)).toBe('2026-03-29T01:30:00.000Z') // == 02:30 BST
    expect(wallToUtc('2026-03-29', 2 * 60, 'Europe/London').exists).toBe(true)
  })

  it('returns the earlier instant for ambiguous fall-back times', () => {
    const r = wallToUtc('2026-10-25', 60 + 30, 'Europe/London') // 01:30 happens twice
    expect(r.exists).toBe(true)
    expect(iso(r.ms)).toBe('2026-10-25T00:30:00.000Z') // the BST occurrence
  })

  it('handles US DST', () => {
    expect(iso(wallToUtc('2026-03-07', 9 * 60, 'America/New_York').ms)).toBe('2026-03-07T14:00:00.000Z')
    expect(iso(wallToUtc('2026-03-09', 9 * 60, 'America/New_York').ms)).toBe('2026-03-09T13:00:00.000Z')
    expect(wallToUtc('2026-03-08', 2 * 60 + 30, 'America/New_York').exists).toBe(false)
  })

  it('accepts 24:00 as the end of the day', () => {
    expect(iso(wallToUtc('2026-10-19', 24 * 60, 'Asia/Kolkata').ms)).toBe('2026-10-19T18:30:00.000Z')
  })
})

describe('utcToLocal / helpers', () => {
  it('round-trips', () => {
    const ms = Date.parse('2026-10-19T03:30:00Z')
    expect(utcToLocal(ms, 'Asia/Kolkata')).toEqual({ date: '2026-10-19', minutes: 540, weekday: 1 })
  })

  it('computes local today across the UTC date line', () => {
    // 20:00 UTC on the 18th is 01:30 IST on the 19th.
    expect(localToday(Date.parse('2026-10-18T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-19')
  })

  it('local day ranges are 23/24/25 hours long', () => {
    const len = (d: string) => {
      const r = localDayRange(d, 'Europe/London')
      return (r.end - r.start) / 3_600_000
    }
    expect(len('2026-03-29')).toBe(23)
    expect(len('2026-10-25')).toBe(25)
    expect(len('2026-10-26')).toBe(24)
  })

  it('offsets', () => {
    expect(tzOffsetMs(Date.parse('2026-06-01T00:00:00Z'), 'Asia/Kolkata')).toBe(19_800_000)
    expect(tzOffsetMs(Date.parse('2026-06-01T00:00:00Z'), 'Europe/London')).toBe(3_600_000)
  })

  it('calendar arithmetic is zone-free', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(diffDays('2026-10-18', '2026-12-13')).toBe(56)
    expect(weekdayOf('2026-10-18')).toBe(0)
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12')
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19')
  })

  it('parses wall times', () => {
    expect(parseWallTime('09:15')).toBe(555)
    expect(parseWallTime('09:15:00')).toBe(555)
    expect(() => parseWallTime('9:15')).toThrow()
    expect(() => parseWallTime('25:00')).toThrow()
  })
})
