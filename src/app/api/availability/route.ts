import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env'
import { rateLimitByIp, RATE_LIMITS } from '@/lib/rate-limit'
import { verifyBookingToken } from '@/lib/tokens'
import { weekAvailability } from '@/server/availability-view'
import { staffOrNull } from '@/server/dal'
import { getServiceBySlug, getSettings } from '@/server/queries'

const query = z.object({
  service: z.string().regex(/^[a-z0-9-]{1,64}$/),
  therapist: z.union([z.literal('any'), z.uuid()]).default('any'),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** A reschedule token lets the patient's own booking stop blocking its slot. */
  token: z.string().max(512).optional(),
  mode: z.enum(['patient', 'staff']).default('patient'),
})

export async function GET(request: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const q = parsed.data

  const limit = await rateLimitByIp(RATE_LIMITS.availability)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '30' } })

  let staff = false
  if (q.mode === 'staff') {
    if (!(await staffOrNull())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    staff = true
  }

  let excludeBookingId: string | undefined
  if (q.token) {
    const v = verifyBookingToken(q.token, env().BOOKING_TOKEN_SECRET, 'reschedule')
    if (!v.ok) return NextResponse.json({ error: 'Invalid link' }, { status: 403 })
    excludeBookingId = v.payload.bookingId
  }

  const [settings, service] = await Promise.all([getSettings(), getServiceBySlug(q.service)])
  if (!service) return NextResponse.json({ error: 'Unknown service' }, { status: 404 })

  const data = await weekAvailability({ settings, service, therapist: q.therapist, weekStart: q.week, now: Date.now(), excludeBookingId, staff })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
