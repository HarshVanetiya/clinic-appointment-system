import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { sendDueReminders } from '@/server/reminders'

export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

/** Called hourly by Vercel Cron (GET) or the GitHub Actions workflow (GET or POST). */
async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await sendDueReminders()
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}

export { handle as GET, handle as POST }
