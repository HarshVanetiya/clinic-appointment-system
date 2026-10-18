import { describe, expect, it } from 'vitest'
import { peekPurpose, signBookingToken, verifyBookingToken, withinCancellationCutoff } from '@/lib/tokens'
import { formatIndianMobile, normalizeIndianMobile } from '@/lib/phone'
import { formatDuration, formatINR, formatTime, formatLongDate, initials } from '@/lib/format'

const SECRET = 'test-secret-test-secret-test-secret'
const id = '6f9b7c67-574c-48c5-ad7f-56667fc59748'
const NOW = Date.parse('2026-10-18T10:00:00Z')
const later = new Date(NOW + 48 * 3_600_000)

describe('booking tokens', () => {
  const token = signBookingToken({ bookingId: id, purpose: 'cancel', version: 1, expiresAt: later }, SECRET)

  it('round-trips', () => {
    const r = verifyBookingToken(token, SECRET, 'cancel', NOW)
    expect(r.ok && r.payload).toMatchObject({ bookingId: id, purpose: 'cancel', version: 1 })
  })

  it('rejects the wrong purpose (single-purpose)', () => {
    expect(verifyBookingToken(token, SECRET, 'reschedule', NOW)).toEqual({ ok: false, reason: 'wrong_purpose' })
  })

  it('rejects a tampered payload', () => {
    const [body, sig] = token.split('.')
    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString())
    payload.p = 'reschedule'
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`
    expect(verifyBookingToken(forged, SECRET, 'reschedule', NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects another secret', () => {
    expect(verifyBookingToken(token, 'another-secret-another-secret', 'cancel', NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('expires', () => {
    expect(verifyBookingToken(token, SECRET, 'cancel', later.getTime())).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects garbage', () => {
    for (const t of ['', 'abc', 'a.b.c', '.x', 'eyJ9.x']) expect(verifyBookingToken(t, SECRET, 'cancel', NOW).ok).toBe(false)
  })

  it('peeks the purpose', () => {
    expect(peekPurpose(token)).toBe('cancel')
    expect(peekPurpose('nonsense')).toBeNull()
  })

  it('cancellation cutoff', () => {
    const start = new Date(NOW + 23 * 3_600_000)
    expect(withinCancellationCutoff(start, 24, NOW)).toBe(true)
    expect(withinCancellationCutoff(new Date(NOW + 25 * 3_600_000), 24, NOW)).toBe(false)
    expect(withinCancellationCutoff(new Date(NOW + 24 * 3_600_000), 24, NOW)).toBe(false) // exactly at cutoff is still allowed
  })
})

describe('Indian mobile numbers', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['91 9876543210', '+919876543210'],
    ['(+91) 6123-456-789', '+916123456789'],
  ])('normalizes %s', (input, out) => expect(normalizeIndianMobile(input)).toBe(out))

  it.each(['12345', '5876543210', '+44 7700 900123', '98765432101', ''])('rejects %s', (input) =>
    expect(normalizeIndianMobile(input)).toBeNull(),
  )

  it('formats for display', () => expect(formatIndianMobile('+919876543210')).toBe('+91 98765 43210'))
})

describe('formatting (en-IN, Asia/Kolkata)', () => {
  it('formats rupees with Indian digit grouping', () => {
    expect(formatINR(150000)).toBe('₹1,500')
    expect(formatINR(12500000)).toBe('₹1,25,000')
    expect(formatINR(149950)).toBe('₹1,499.50')
  })

  it('formats times and dates in the clinic zone regardless of server TZ', () => {
    const d = new Date('2026-10-19T03:30:00Z')
    expect(formatTime(d, 'Asia/Kolkata')).toBe('9:00 am')
    expect(formatLongDate(d, 'Asia/Kolkata')).toBe('Monday, 19 October 2026')
  })

  it('durations and initials', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(initials('Dr. Ananya Rao')).toBe('AR')
  })
})

describe('formatLocalDate (deterministic, hydration-safe)', () => {
  it('formats calendar days without Intl', async () => {
    const { formatLocalDate } = await import('@/lib/format')
    expect(formatLocalDate('2026-10-19', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('Monday, 19 October')
    expect(formatLocalDate('2026-10-19', { weekday: 'short' })).toBe('Mon')
    expect(formatLocalDate('2026-10-19', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('19 Oct 2026')
    expect(formatLocalDate('2026-10-19', { day: 'numeric' })).toBe('19')
  })
})
