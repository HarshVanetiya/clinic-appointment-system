import { describe, expect, it } from 'vitest'
import {
  aggregateSlots,
  generateSlots,
  isSlotAvailable,
  nearestSlots,
  normalize,
  openIntervalsForDate,
  subtract,
  type EngineSettings,
  type ServiceSpec,
  type TherapistSchedule,
  type WeeklyHours,
} from '@/lib/availability/engine'
import { utcToLocal, wallToUtc, formatWallTime } from '@/lib/time'

const IST = 'Asia/Kolkata'
const LON = 'Europe/London'

const settings = (over: Partial<EngineSettings> = {}): EngineSettings => ({
  timeZone: IST,
  slotIntervalMin: 15,
  minNoticeMin: 0,
  bookingWindowDays: 365,
  ...over,
})

const svc = (durationMin: number, bufferAfterMin = 0): ServiceSpec => ({ durationMin, bufferAfterMin })

const allWeek = (start: string, end: string): WeeklyHours[] => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start, end }))

const schedule = (over: Partial<TherapistSchedule> = {}): TherapistSchedule => ({
  therapistId: 't1',
  weeklyHours: allWeek('09:00', '12:00'),
  overrides: [],
  busy: [],
  ...over,
})

const at = (date: string, time: string, tz = IST) => {
  const [h, m] = time.split(':').map(Number)
  return wallToUtc(date, h! * 60 + m!, tz).ms
}

/** Local 'HH:MM' labels of the generated slots, for readable assertions. */
const labels = (slots: { start: number }[], tz = IST) => slots.map((s) => formatWallTime(utcToLocal(s.start, tz).minutes))

// A "now" well before the dates under test, so minimum notice is irrelevant unless set.
const EARLY = Date.parse('2026-01-01T00:00:00Z')

const run = (opts: {
  sched?: Partial<TherapistSchedule>
  service?: ServiceSpec
  set?: Partial<EngineSettings>
  date?: string
  to?: string
  now?: number
}) =>
  generateSlots({
    settings: settings(opts.set),
    service: opts.service ?? svc(60),
    schedule: schedule(opts.sched),
    from: opts.date ?? '2026-10-19',
    to: opts.to ?? opts.date ?? '2026-10-19',
    now: opts.now ?? EARLY,
  })

describe('interval algebra', () => {
  it('normalizes overlapping and touching intervals', () => {
    expect(
      normalize([
        { start: 5, end: 10 },
        { start: 0, end: 5 },
        { start: 8, end: 12 },
        { start: 20, end: 20 },
      ]),
    ).toEqual([{ start: 0, end: 12 }])
  })

  it('subtracts holes, edges and full covers', () => {
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ])
    expect(subtract([{ start: 0, end: 10 }], [{ start: -5, end: 2 }])).toEqual([{ start: 2, end: 10 }])
    expect(subtract([{ start: 0, end: 10 }], [{ start: 0, end: 10 }])).toEqual([])
    expect(subtract([{ start: 0, end: 10 }], [{ start: 10, end: 20 }])).toEqual([{ start: 0, end: 10 }])
  })
})

describe('basic slot generation', () => {
  it('generates 15-minute grid slots that fit inside working hours', () => {
    // 09:00–12:00, 60-min service → last start 11:00.
    expect(labels(run({}))).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00'])
  })

  it('respects a configurable slot interval', () => {
    expect(labels(run({ set: { slotIntervalMin: 30 } }))).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00'])
  })

  it('aligns to the local grid in a half-hour offset zone (IST)', () => {
    const slots = run({})
    // 09:00 IST is 03:30 UTC — slots must be on local quarter hours, not UTC ones.
    expect(new Date(slots[0]!.start).toISOString()).toBe('2026-10-19T03:30:00.000Z')
  })

  it('only starts on the grid even when hours start off-grid', () => {
    expect(labels(run({ sched: { weeklyHours: allWeek('09:10', '11:00') } }))).toEqual(['09:15', '09:30', '09:45', '10:00'])
  })

  it('returns nothing on days without working hours', () => {
    const weekdaysOnly = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }))
    expect(run({ sched: { weeklyHours: weekdaysOnly }, date: '2026-10-18' })).toEqual([]) // Sunday
  })

  it('supports split shifts', () => {
    const split = [
      { weekday: 1, start: '09:00', end: '10:00' },
      { weekday: 1, start: '14:00', end: '15:00' },
    ]
    expect(labels(run({ sched: { weeklyHours: split }, service: svc(30) }))).toEqual(['09:00', '09:15', '09:30', '14:00', '14:15', '14:30'])
  })

  it('returns nothing when the service is longer than the open window', () => {
    expect(run({ service: svc(240) })).toEqual([])
  })

  it('end boundary: appointment may end exactly at closing', () => {
    const slots = run({ service: svc(45) })
    expect(labels(slots).at(-1)).toBe('11:15')
    expect(slots.at(-1)!.end).toBe(at('2026-10-19', '12:00'))
  })
})

describe('existing bookings & buffers', () => {
  const booked = (from: string, to: string) => ({ start: at('2026-10-19', from), end: at('2026-10-19', to) })

  it('excludes slots that overlap a booking', () => {
    // Booked 10:00–11:00 (no buffer). 30-min service.
    const slots = run({ service: svc(30), sched: { busy: [booked('10:00', '11:00')] } })
    expect(labels(slots)).toEqual(['09:00', '09:15', '09:30', '11:00', '11:15', '11:30'])
  })

  it('allows back-to-back bookings when there is no buffer (half-open ranges)', () => {
    const slots = run({ service: svc(30), sched: { busy: [booked('10:00', '11:00')] } })
    expect(labels(slots)).toContain('09:30') // ends 10:00 exactly
    expect(labels(slots)).toContain('11:00') // starts at the booking's end exactly
  })

  it("respects an existing booking's buffer (busy range = start → blockedUntil)", () => {
    // Existing 10:00–10:45 + 15 min buffer → blocked until 11:00.
    const slots = run({ service: svc(30), sched: { busy: [booked('10:00', '11:00')] } })
    expect(labels(slots)).not.toContain('10:45')
  })

  it("respects the new service's own buffer before the next booking", () => {
    // New service: 30 min + 15 buffer. Existing booking at 10:00.
    // 09:30 would end 10:00 but its buffer runs to 10:15 → not allowed. 09:15 is OK.
    const slots = run({ service: svc(30, 15), sched: { busy: [booked('10:00', '11:00')] } })
    expect(labels(slots)).toEqual(['09:00', '09:15', '11:00', '11:15', '11:30'])
  })

  it('lets the buffer run past closing time', () => {
    const slots = run({ service: svc(30, 15) })
    expect(labels(slots).at(-1)).toBe('11:30')
  })

  it('handles many overlapping/unsorted busy ranges', () => {
    const slots = run({
      service: svc(15),
      sched: { busy: [booked('11:00', '11:30'), booked('09:00', '09:45'), booked('09:30', '10:15'), booked('11:15', '12:00')] },
    })
    expect(labels(slots)).toEqual(['10:15', '10:30', '10:45'])
  })

  it('ignores bookings on other days', () => {
    const other = { start: at('2026-10-20', '09:00'), end: at('2026-10-20', '12:00') }
    expect(run({ sched: { busy: [other] } })).toHaveLength(9)
  })
})

describe('overrides', () => {
  const D = '2026-10-19'

  it('whole-day closure removes the day', () => {
    expect(run({ sched: { overrides: [{ date: D, kind: 'closed' }] } })).toEqual([])
  })

  it('partial time off removes only that window', () => {
    const slots = run({ service: svc(30), sched: { overrides: [{ date: D, kind: 'time_off', start: '10:00', end: '11:00' }] } })
    expect(labels(slots)).toEqual(['09:00', '09:15', '09:30', '11:00', '11:15', '11:30'])
  })

  it('extra hours add availability, merging with regular hours', () => {
    const slots = run({ service: svc(60), sched: { overrides: [{ date: D, kind: 'extra_hours', start: '12:00', end: '14:00' }] } })
    expect(labels(slots).at(-1)).toBe('13:00')
    expect(labels(slots)).toContain('11:30') // spans the seam 11:30–12:30
  })

  it('extra hours on a normally closed day', () => {
    const weekdaysOnly = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }))
    const slots = run({
      date: '2026-10-18',
      sched: { weeklyHours: weekdaysOnly, overrides: [{ date: '2026-10-18', kind: 'extra_hours', start: '10:00', end: '11:00' }] },
    })
    expect(labels(slots)).toEqual(['10:00'])
  })

  it('closures win over extra hours', () => {
    const slots = run({
      sched: {
        overrides: [
          { date: D, kind: 'extra_hours', start: '12:00', end: '14:00' },
          { date: D, kind: 'closed' },
        ],
      },
    })
    expect(slots).toEqual([])
  })

  it('only applies to the matching date', () => {
    expect(run({ sched: { overrides: [{ date: '2026-10-20', kind: 'closed' }] } })).toHaveLength(9)
  })

  it('openIntervalsForDate exposes the merged open time', () => {
    const open = openIntervalsForDate(schedule({ overrides: [{ date: D, kind: 'time_off', start: '10:00', end: '10:30' }] }), D, IST)
    expect(open).toEqual([
      { start: at(D, '09:00'), end: at(D, '10:00') },
      { start: at(D, '10:30'), end: at(D, '12:00') },
    ])
  })
})

describe('minimum notice & booking window', () => {
  it('drops slots inside the minimum notice period', () => {
    const now = at('2026-10-19', '08:50')
    const slots = run({ now, set: { minNoticeMin: 120 } }) // earliest 10:50
    expect(labels(slots)[0]).toBe('11:00')
  })

  it('includes a slot exactly at now + notice', () => {
    const now = at('2026-10-19', '08:00')
    const slots = run({ now, set: { minNoticeMin: 120 } })
    expect(labels(slots)[0]).toBe('10:00')
  })

  it('never offers past slots with zero notice', () => {
    const now = at('2026-10-19', '10:01')
    expect(labels(run({ now }))[0]).toBe('10:15')
  })

  it('stops at the end of the booking window (inclusive)', () => {
    const now = at('2026-10-19', '08:00')
    const slots = run({ now, set: { bookingWindowDays: 2 }, date: '2026-10-19', to: '2026-10-30' })
    const dates = new Set(slots.map((s) => utcToLocal(s.start, IST).date))
    expect([...dates]).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('clamps a range that starts in the past', () => {
    const now = at('2026-10-19', '08:00')
    const slots = run({ now, date: '2026-10-10', to: '2026-10-19' })
    expect(new Set(slots.map((s) => utcToLocal(s.start, IST).date))).toEqual(new Set(['2026-10-19']))
  })

  it('computes "today" in the clinic zone, not UTC', () => {
    // 19:00 UTC on Oct 18 = 00:30 IST Oct 19. With a 0-day window only Oct 19 is bookable.
    const now = Date.parse('2026-10-18T19:00:00Z')
    const slots = run({ now, set: { bookingWindowDays: 0 }, date: '2026-10-18', to: '2026-10-20' })
    expect(new Set(slots.map((s) => utcToLocal(s.start, IST).date))).toEqual(new Set(['2026-10-19']))
  })
})

describe('DST (clinic configured in a DST zone)', () => {
  const lon = { timeZone: LON }

  it('09:00 local stays 09:00 local across spring-forward (UTC shifts by an hour)', () => {
    const before = run({ set: lon, date: '2026-03-27' }) // Friday, GMT
    const after = run({ set: lon, date: '2026-03-30' }) // Monday, BST
    expect(labels(before, LON)[0]).toBe('09:00')
    expect(labels(after, LON)[0]).toBe('09:00')
    expect(new Date(before[0]!.start).toISOString()).toBe('2026-03-27T09:00:00.000Z')
    expect(new Date(after[0]!.start).toISOString()).toBe('2026-03-30T08:00:00.000Z')
  })

  it('never offers non-existent times on the spring-forward day', () => {
    const slots = run({ set: lon, date: '2026-03-29', sched: { weeklyHours: allWeek('00:00', '04:00') }, service: svc(30) })
    const l = labels(slots, LON)
    expect(l).not.toContain('01:00')
    expect(l).not.toContain('01:30')
    expect(l).toContain('00:30') // ends 01:00 GMT == 02:00 BST, still inside open time
    expect(l).toContain('02:00')
    // Every slot is exactly 30 real minutes long.
    expect(slots.every((s) => s.end - s.start === 30 * 60_000)).toBe(true)
  })

  it('offers the repeated fall-back hour only once and keeps real durations', () => {
    const slots = run({ set: lon, date: '2026-10-25', sched: { weeklyHours: allWeek('00:00', '03:00') }, service: svc(60), })
    const l = labels(slots, LON)
    expect(l.filter((x) => x === '01:00')).toHaveLength(1)
    expect(new Set(slots.map((s) => s.start)).size).toBe(slots.length)
    // Open time 00:00–03:00 local is 4 real hours on this day.
    const open = openIntervalsForDate(schedule({ weeklyHours: allWeek('00:00', '03:00') }), '2026-10-25', LON)
    expect(open[0]!.end - open[0]!.start).toBe(4 * 3_600_000)
  })

  it('a booking spanning the transition blocks the right real instants', () => {
    const busy = [{ start: Date.parse('2026-03-29T00:30:00Z'), end: Date.parse('2026-03-29T01:30:00Z') }] // 00:30 GMT → 02:30 BST
    const slots = run({ set: lon, date: '2026-03-29', sched: { weeklyHours: allWeek('00:00', '04:00'), busy }, service: svc(30) })
    expect(labels(slots, LON)).toEqual(['00:00', '02:30', '02:45', '03:00', '03:15', '03:30'])
  })

  it('works for US zones too', () => {
    const slots = run({ set: { timeZone: 'America/New_York' }, date: '2026-03-09' })
    expect(new Date(slots[0]!.start).toISOString()).toBe('2026-03-09T13:00:00.000Z')
  })
})

describe('any available / helpers', () => {
  it('aggregates slots across therapists', () => {
    const a = run({ service: svc(30), sched: { therapistId: 'a', weeklyHours: allWeek('09:00', '10:30') } })
    const b = run({ service: svc(30), sched: { therapistId: 'b', weeklyHours: allWeek('10:00', '11:00') } })
    const agg = aggregateSlots([a, b])
    expect(labels(agg)).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30'])
    const ids = (l: string) => agg.find((s) => labels([s])[0] === l)!.therapistIds
    expect(ids('09:30')).toEqual(['a'])
    expect(ids('10:00')).toEqual(['a', 'b'])
    expect(ids('10:30')).toEqual(['b'])
  })

  it('nearestSlots returns the closest alternatives in time order', () => {
    const slots = run({ service: svc(30) })
    const target = at('2026-10-19', '10:00')
    expect(labels(nearestSlots(slots, target, 3))).toEqual(['09:45', '10:15', '09:30'].sort())
  })

  it('isSlotAvailable matches generateSlots', () => {
    const base = { settings: settings(), service: svc(30), schedule: schedule(), now: EARLY }
    expect(isSlotAvailable({ ...base, start: at('2026-10-19', '10:00') })).toBe(true)
    expect(isSlotAvailable({ ...base, start: at('2026-10-19', '10:05') })).toBe(false) // off-grid
    expect(isSlotAvailable({ ...base, start: at('2026-10-19', '11:45') })).toBe(false) // runs past close
  })
})
