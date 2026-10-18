import 'server-only'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3000'),
  BETTER_AUTH_SECRET: z.string().min(16),
  BOOKING_TOKEN_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Northside Physio <bookings@example.com>'),
  CRON_SECRET: z.string().min(16).optional(),
})

let cached: z.infer<typeof schema> | undefined

/** Validated server environment. Read lazily so `next build` works without secrets. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`)
    }
    cached = parsed.data
  }
  return cached
}

export const appUrl = (path = '/') => new URL(path, env().APP_URL).toString()
