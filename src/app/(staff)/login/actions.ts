'use server'

import { APIError } from 'better-auth/api'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { clientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export type LoginState = { error?: string; email?: string }

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
})

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Enter your email and password.', email: String(formData.get('email') ?? '') }
  const { email, password, next } = parsed.data

  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(RATE_LIMITS.login, await clientIp()),
    checkRateLimit({ ...RATE_LIMITS.login, name: 'login-email' }, email),
  ])
  if (!byIp.allowed || !byEmail.allowed) return { error: 'Too many attempts. Please wait 10 minutes and try again.', email }

  let role = 'therapist'
  try {
    const res = await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
    role = (res.user as { role?: string }).role ?? 'therapist'
  } catch (e) {
    if (e instanceof APIError) return { error: 'That email and password don’t match.', email }
    throw e
  }
  // Only allow same-site relative redirects.
  const safeNext = next && /^\/(staff|admin)(\/|$)/.test(next) ? next : role === 'admin' ? '/admin' : '/staff'
  redirect(safeNext as Route)
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() })
  redirect('/login')
}
