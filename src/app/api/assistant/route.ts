import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimitByIp, RATE_LIMITS } from '@/lib/rate-limit'
import { respond } from '@/server/assistant/respond'

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(40),
})

const MAX_TURNS = 16

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // The conversation sent to the model must start and end with the patient.
  const turns = parsed.data.messages.slice(-MAX_TURNS)
  while (turns[0]?.role === 'assistant') turns.shift()
  if (turns.length === 0 || turns[turns.length - 1]!.role !== 'user') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const limit = await rateLimitByIp(RATE_LIMITS.assistant)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please wait a few minutes, or book from the Book page.' }, { status: 429, headers: { 'Retry-After': '120' } })
  }

  return NextResponse.json(await respond(turns), { headers: { 'Cache-Control': 'private, no-store' } })
}
