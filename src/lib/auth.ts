import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/db'
import { account, session, user, verification } from '@/db/schema'

/**
 * Staff-only authentication. Patients never sign in — they use signed links.
 * Public sign-up is disabled; admins create therapist accounts.
 */
export const auth = betterAuth({
  appName: 'Northside Physio',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, input: false, defaultValue: 'therapist' },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: { '/sign-in/email': { window: 60, max: 5 } },
  },
  advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
  plugins: [nextCookies()],
})

export type StaffRole = 'admin' | 'therapist'
