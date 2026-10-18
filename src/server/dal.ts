import 'server-only'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/db'
import { therapists } from '@/db/schema'
import { auth, type StaffRole } from '@/lib/auth'

export interface StaffContext {
  userId: string
  name: string
  email: string
  role: StaffRole
  /** The therapist profile linked to this login, if any. */
  therapistId: string | null
}

/** Current staff member or null. Deduplicated per request. */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const role = (session.user as { role?: string }).role === 'admin' ? 'admin' : 'therapist'
  const [t] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, session.user.id))
  return { userId: session.user.id, name: session.user.name, email: session.user.email, role, therapistId: t?.id ?? null }
})

/**
 * Authorization gate for staff pages, Server Actions and route handlers.
 * The proxy only does an optimistic cookie check — this is the real one.
 */
export async function requireStaff(role?: StaffRole): Promise<StaffContext> {
  const staff = await getStaff()
  if (!staff) redirect('/login')
  if (role === 'admin' && staff.role !== 'admin') redirect('/staff')
  return staff
}

/** Same check for code paths that must not redirect (route handlers, JSON APIs). */
export async function staffOrNull(role?: StaffRole): Promise<StaffContext | null> {
  const staff = await getStaff()
  if (!staff || (role === 'admin' && staff.role !== 'admin')) return null
  return staff
}

/** Therapists may only act on their own bookings; admins on all. */
export function canActOnTherapist(staff: StaffContext, therapistId: string) {
  return staff.role === 'admin' || staff.therapistId === therapistId
}
