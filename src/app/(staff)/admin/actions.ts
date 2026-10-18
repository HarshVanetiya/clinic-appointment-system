'use server'

import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import type { Route } from 'next'
import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { account, availabilityOverrides, clinicSettings, services, therapistServices, therapists, user, workingHours } from '@/db/schema'
import type { BookState } from '@/lib/booking-state'
import { formatShortDate, formatTime } from '@/lib/format'
import { normalizeIndianMobile } from '@/lib/phone'
import { addDays, diffDays, isLocalDate, parseWallTime } from '@/lib/time'
import { bookingRequestSchema, fieldErrors } from '@/lib/validation'
import { createBooking } from '@/server/bookings'
import { TAGS } from '@/server/cached'
import { requireStaff } from '@/server/dal'
import { notifyBooking } from '@/server/email/notifications'
import { getSettings } from '@/server/queries'

export type FormResult = { ok: true; message: string } | { ok: false; error: string } | null

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Please check the form.'

/* ------------------------------ walk-in / phone ----------------------------- */

export async function staffCreateBooking(_prev: BookState, formData: FormData): Promise<BookState> {
  await requireStaff('admin')
  const raw = Object.fromEntries(['serviceId', 'therapist', 'start', 'name', 'email', 'phone', 'notes', 'source'].map((k) => [k, String(formData.get(k) ?? '')]))
  const values = { name: raw.name!, email: raw.email!, phone: raw.phone!, notes: raw.notes! }
  const parsed = bookingRequestSchema.extend({ source: z.enum(['phone', 'walk_in']) }).safeParse(raw)
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error)
    if (!raw.start) errors.form = 'Choose a time first.'
    return { status: 'error', errors, values }
  }
  const input = parsed.data
  const result = await createBooking({
    serviceId: input.serviceId,
    therapist: input.therapist,
    start: input.start,
    patient: { name: input.name, email: input.email, phone: input.phone, notes: input.notes },
    source: input.source,
    staff: true,
  })
  if (!result.ok) {
    if (result.code === 'invalid') return { status: 'error', errors: { form: result.message }, values }
    const { timeZone } = await getSettings()
    return {
      status: 'taken',
      values,
      alternatives: result.alternatives.map((a) => ({ start: new Date(a.start).toISOString(), label: `${formatShortDate(a.start, timeZone)} · ${formatTime(a.start, timeZone)}` })),
    }
  }
  after(() => notifyBooking(result.booking.id, 'created'))
  redirect(`/admin/bookings/${result.booking.id}?created=1` as Route)
}

/* --------------------------------- services -------------------------------- */

const serviceSchema = z.object({
  id: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug: lowercase letters, numbers and dashes'),
  description: z.string().trim().min(10, 'Add a short description').max(300),
  durationMin: z.coerce.number().int().min(5).max(480),
  bufferAfterMin: z.coerce.number().int().min(0).max(120),
  priceRupees: z.coerce.number().min(0).max(100000),
  active: z.boolean(),
  therapistIds: z.array(z.uuid()),
})

export async function saveService(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff('admin')
  const parsed = serviceSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get('active') === 'on',
    therapistIds: formData.getAll('therapistIds'),
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  const v = parsed.data
  const values = { name: v.name, slug: v.slug, description: v.description, durationMin: v.durationMin, bufferAfterMin: v.bufferAfterMin, pricePaise: Math.round(v.priceRupees * 100), active: v.active }
  try {
    await db.transaction(async (tx) => {
      let id = v.id || ''
      if (id) await tx.update(services).set(values).where(eq(services.id, id))
      else id = (await tx.insert(services).values(values).returning({ id: services.id }))[0]!.id
      await tx.delete(therapistServices).where(eq(therapistServices.serviceId, id))
      if (v.therapistIds.length) await tx.insert(therapistServices).values(v.therapistIds.map((therapistId) => ({ therapistId, serviceId: id })))
    })
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code === '23505') return { ok: false, error: 'That slug is already used by another service.' }
    throw e
  }
  updateTag(TAGS.services)
  refresh()
  return { ok: true, message: v.id ? 'Service updated.' : 'Service added.' }
}

/* -------------------------------- therapists ------------------------------- */

const hoursSchema = z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }))

const therapistSchema = z.object({
  id: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(400).default(''),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  serviceIds: z.array(z.uuid()),
  hours: z.string().transform((s, ctx) => {
    try {
      return hoursSchema.parse(JSON.parse(s))
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Working hours are invalid' })
      return z.NEVER
    }
  }),
  password: z.string().max(128).optional().or(z.literal('')),
})

export async function saveTherapist(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff('admin')
  const parsed = therapistSchema.safeParse({
    ...Object.fromEntries(formData),
    active: formData.get('active') === 'on',
    serviceIds: formData.getAll('serviceIds'),
  })
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  const v = parsed.data

  // Hours: end after start, and no overlapping ranges on the same day.
  for (const h of v.hours) if (parseWallTime(h.end) <= parseWallTime(h.start)) return { ok: false, error: 'Each working-hours range must end after it starts.' }
  for (let d = 0; d < 7; d++) {
    const day = v.hours.filter((h) => h.weekday === d).sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < day.length; i++) if (day[i]!.start < day[i - 1]!.end) return { ok: false, error: 'Working-hours ranges on the same day overlap.' }
  }
  if (!v.id && (!v.password || v.password.length < 10)) return { ok: false, error: 'Set a temporary password of at least 10 characters for the new login.' }

  const slug = v.name.toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  let id = v.id || ''
  try {
    await db.transaction(async (tx) => {
      const profile = { name: v.name, title: v.title, bio: v.bio, email: v.email, accent: v.accent, active: v.active }
      if (id) {
        await tx.update(therapists).set(profile).where(eq(therapists.id, id))
        const [t] = await tx.select({ userId: therapists.userId }).from(therapists).where(eq(therapists.id, id))
        if (t?.userId) await tx.update(user).set({ name: v.name, email: v.email, updatedAt: new Date() }).where(eq(user.id, t.userId))
        if (t?.userId && v.password) {
          if (v.password.length < 10) throw new Error('PASSWORD_SHORT')
          await tx.update(account).set({ password: await hashPassword(v.password), updatedAt: new Date() }).where(and(eq(account.userId, t.userId), eq(account.providerId, 'credential')))
        }
      } else {
        const userId = randomUUID()
        await tx.insert(user).values({ id: userId, name: v.name, email: v.email, role: 'therapist', emailVerified: true })
        await tx.insert(account).values({ id: randomUUID(), userId, accountId: userId, providerId: 'credential', password: await hashPassword(v.password!) })
        id = (await tx.insert(therapists).values({ ...profile, slug: `${slug}-${randomUUID().slice(0, 4)}`, userId }).returning({ id: therapists.id }))[0]!.id
      }
      await tx.delete(therapistServices).where(eq(therapistServices.therapistId, id))
      if (v.serviceIds.length) await tx.insert(therapistServices).values(v.serviceIds.map((serviceId) => ({ therapistId: id, serviceId })))
      await tx.delete(workingHours).where(eq(workingHours.therapistId, id))
      if (v.hours.length) await tx.insert(workingHours).values(v.hours.map((h) => ({ therapistId: id, weekday: h.weekday, startTime: h.start, endTime: h.end })))
    })
  } catch (e) {
    if ((e as Error).message === 'PASSWORD_SHORT') return { ok: false, error: 'New password must be at least 10 characters.' }
    if ((e as { cause?: { code?: string } }).cause?.code === '23505') return { ok: false, error: 'That email is already used by another login.' }
    throw e
  }
  updateTag(TAGS.therapists)
  if (!v.id) redirect(`/admin/therapists/${id}?created=1` as Route)
  refresh()
  return { ok: true, message: 'Saved. Availability updates immediately.' }
}

/* --------------------------------- holidays -------------------------------- */

const holidaySchema = z
  .object({
    from: z.string().refine(isLocalDate, 'Choose a date'),
    to: z.string().refine(isLocalDate, 'Choose an end date'),
    reason: z.string().trim().min(2, 'Add a name, e.g. "Diwali"').max(80),
  })
  .refine((v) => v.to >= v.from, { message: 'End date must be on or after the start date' })
  .refine((v) => diffDays(v.from, v.to) <= 31, { message: 'Add at most 31 days at a time' })

export async function addHoliday(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff('admin')
  const parsed = holidaySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  const v = parsed.data
  const rows = []
  for (let d = v.from; d <= v.to; d = addDays(d, 1)) rows.push({ therapistId: null, date: d, kind: 'closed' as const, reason: v.reason })
  await db.insert(availabilityOverrides).values(rows)
  refresh()
  return { ok: true, message: `Clinic closed for ${rows.length} day${rows.length > 1 ? 's' : ''}. Existing bookings are kept — contact those patients.` }
}

/* --------------------------------- settings -------------------------------- */

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().transform((v, ctx) => normalizeIndianMobile(v) ?? (ctx.addIssue({ code: 'custom', message: 'Enter a valid Indian mobile number' }), z.NEVER)),
  email: z.string().trim().pipe(z.email()),
  addressLine: z.string().trim().min(5).max(160),
  slotIntervalMin: z.coerce.number().int().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), 'Choose a slot interval'),
  minNoticeMin: z.coerce.number().int().min(0).max(7 * 24 * 60),
  bookingWindowDays: z.coerce.number().int().min(1).max(365),
  cancellationCutoffHours: z.coerce.number().int().min(0).max(168),
})

export async function saveSettings(_prev: FormResult, formData: FormData): Promise<FormResult> {
  await requireStaff('admin')
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) }
  await db.update(clinicSettings).set({ ...parsed.data, updatedAt: new Date() }).where(eq(clinicSettings.id, 1))
  updateTag(TAGS.clinic)
  refresh()
  return { ok: true, message: 'Settings saved. New rules apply to bookings from now on.' }
}

