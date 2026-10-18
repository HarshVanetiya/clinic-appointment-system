/**
 * Signed, single-purpose booking links (cancel / reschedule / view).
 *
 *   token = base64url(payload) "." base64url(HMAC-SHA256(secret, purpose-domain + payload))
 *
 * - Single purpose: the purpose is inside the signed payload *and* part of the
 *   MAC domain, so a cancel token can never be replayed as a reschedule token.
 * - Expiry: tokens expire at the appointment start.
 * - Single use / revocable: the payload carries the booking's `tokenVersion`;
 *   cancelling or rescheduling bumps it, so every previously emailed link dies.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/** `view` only shows the confirmation page; it can never change anything. */
export type TokenPurpose = 'cancel' | 'reschedule' | 'view'

const payloadSchema = z.object({
  b: z.uuid(),
  p: z.enum(['cancel', 'reschedule', 'view']),
  v: z.number().int().positive(),
  e: z.number().int().positive(),
})

export interface BookingTokenPayload {
  bookingId: string
  purpose: TokenPurpose
  version: number
  expiresAt: Date
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url')

function mac(secret: string, purpose: string, body: string) {
  return createHmac('sha256', secret).update(`northside:booking-link:${purpose}:`).update(body).digest()
}

export function signBookingToken(p: BookingTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify({ b: p.bookingId, p: p.purpose, v: p.version, e: Math.floor(p.expiresAt.getTime() / 1000) }))
  return `${body}.${b64url(mac(secret, p.purpose, body))}`
}

export type VerifyResult =
  | { ok: true; payload: BookingTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_purpose' }

export function verifyBookingToken(token: string, secret: string, expected: TokenPurpose, now = Date.now()): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts as [string, string]

  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'malformed' }

  // Verify against the purpose claimed in the payload first (constant time)…
  const given = Buffer.from(sig, 'base64url')
  const want = mac(secret, parsed.data.p, body)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'bad_signature' }
  // …then make sure it is the purpose this endpoint accepts.
  if (parsed.data.p !== expected) return { ok: false, reason: 'wrong_purpose' }
  if (parsed.data.e * 1000 <= now) return { ok: false, reason: 'expired' }

  return {
    ok: true,
    payload: { bookingId: parsed.data.b, purpose: parsed.data.p, version: parsed.data.v, expiresAt: new Date(parsed.data.e * 1000) },
  }
}

/** Peek at the purpose without trusting it (used to route /manage/[token]). Signature is checked later. */
export function peekPurpose(token: string): TokenPurpose | null {
  try {
    const body = token.split('.')[0]
    if (!body) return null
    const p = payloadSchema.shape.p.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).p)
    return p.success ? p.data : null
  } catch {
    return null
  }
}

/** Whether a booking can still be changed by the patient online. */
export function withinCancellationCutoff(startsAt: Date, cutoffHours: number, now = Date.now()) {
  return startsAt.getTime() - now < cutoffHours * 3_600_000
}
