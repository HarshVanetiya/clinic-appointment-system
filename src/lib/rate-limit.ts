import 'server-only'
import { sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/db'

export interface RateLimitRule {
  /** Logical bucket, e.g. "book". */
  name: string
  limit: number
  windowSec: number
}

export const RATE_LIMITS = {
  book: { name: 'book', limit: 8, windowSec: 600 },
  manage: { name: 'manage', limit: 10, windowSec: 600 },
  availability: { name: 'availability', limit: 120, windowSec: 60 },
  login: { name: 'login', limit: 10, windowSec: 600 },
} satisfies Record<string, RateLimitRule>

/** Best-effort client IP behind Vercel / proxies. */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
}

/**
 * Fixed-window counter in Postgres — one atomic upsert per request, works across
 * serverless instances without extra infrastructure.
 */
export async function checkRateLimit(rule: RateLimitRule, identifier: string, now = Date.now()) {
  const windowStart = new Date(Math.floor(now / (rule.windowSec * 1000)) * rule.windowSec * 1000)
  const key = `${rule.name}:${identifier}`
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count
  `)
  const count = Number(rows[0]?.count ?? 1)
  // Opportunistic cleanup of old windows (~1% of calls).
  if (Math.random() < 0.01) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`)
  }
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt: new Date(windowStart.getTime() + rule.windowSec * 1000) }
}

export async function rateLimitByIp(rule: RateLimitRule) {
  return checkRateLimit(rule, await clientIp())
}
