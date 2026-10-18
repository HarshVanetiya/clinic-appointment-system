'use server'

import { and, eq, gte, lt, ne } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { availabilityOverrides, bookings } from '@/db/schema'
import { addDays, diffDays, isLocalDate, parseWallTime, wallToUtc } from '@/lib/time'
import { markCancelled, setAttendance } from '@/server/bookings'
import { canActOnTherapist, requireStaff } from '@/server/dal'
import { notifyBooking } from '@/server/email/notifications'
import { getSettings } from '@/server/queries'

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

async function loadOwned(bookingId: string) {
  const staff = await requireStaff()
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  if (!b || !canActOnTherapist(staff, b.therapistId)) return null
  return b
}

export async function markAttendance(bookingId: string, status: 'completed' | 'no_show' | 'confirmed'): Promise<ActionResult> {
  if (!z.uuid().safeParse(bookingId).success || !['completed', 'no_show', 'confirmed'].includes(status)) return { ok: false, error: 'Invalid request' }
  if (!(await loadOwned(bookingId))) return { ok: false, error: 'Not allowed' }
  const row = await setAttendance(bookingId, status)
  if (!row) return { ok: false, error: 'Only past appointments can be marked.' }
  refresh()
  return { ok: true }
}

export async function staffCancel(bookingId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(bookingId).success) return { ok: false, error: 'Invalid request' }
  if (!(await loadOwned(bookingId))) return { ok: false, error: 'Not allowed' }
  const row = await markCancelled(bookingId)
  if (!row) return { ok: false, error: 'This booking can no longer be cancelled.' }
  after(() => notifyBooking(row.id, 'cancelled'))
  refresh()
  return { ok: true, message: 'Cancelled — the patient has been emailed.' }
}

const timeOffSchema = z
  .object({
    therapistId: z.uuid(),
    from: z.string().refine(isLocalDate, 'Choose a start date'),
    to: z.string().refine(isLocalDate, 'Choose an end date'),
    allDay: z.coerce.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    reason: z.string().trim().max(120).default(''),
  })
  .refine((v) => v.to >= v.from, { message: 'End date must be after the start date', path: ['to'] })
  .refine((v) => diffDays(v.from, v.to) <= 60, { message: 'Please add at most 60 days at a time', path: ['to'] })
  .refine((v) => v.allDay || (v.startTime && v.endTime && parseWallTime(v.endTime) > parseWallTime(v.startTime)), {
    message: 'Choose a start and end time',
    path: ['endTime'],
  })

/** Block time off. Existing bookings in that time are kept — we report them so staff can contact patients. */
export async function addTimeOff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireStaff()
  const raw = Object.fromEntries(formData)
  if (!raw.therapistId && staff.therapistId) raw.therapistId = staff.therapistId
  const parsed = timeOffSchema.safeParse({ ...raw, allDay: raw.allDay === 'on' })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  const v = parsed.data
  if (!canActOnTherapist(staff, v.therapistId)) return { ok: false, error: 'Not allowed' }

  const rows: (typeof availabilityOverrides.$inferInsert)[] = []
  for (let d = v.from; d <= v.to; d = addDays(d, 1)) {
    rows.push({ therapistId: v.therapistId, date: d, kind: 'time_off', startTime: v.allDay ? null : v.startTime, endTime: v.allDay ? null : v.endTime, reason: v.reason })
  }
  await db.insert(availabilityOverrides).values(rows)

  const { timeZone } = await getSettings()
  const start = new Date(wallToUtc(v.from, v.allDay ? 0 : parseWallTime(v.startTime!), timeZone).ms)
  const end = new Date(wallToUtc(v.allDay ? addDays(v.to, 1) : v.to, v.allDay ? 0 : parseWallTime(v.endTime!), timeZone).ms)
  const clashes = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.therapistId, v.therapistId), ne(bookings.status, 'cancelled'), lt(bookings.startsAt, end), gte(bookings.endsAt, start)))
  refresh()
  return {
    ok: true,
    message: clashes.length
      ? `Time off saved. ${clashes.length} existing booking${clashes.length > 1 ? 's are' : ' is'} still in that time — please contact ${clashes.length > 1 ? 'those patients' : 'that patient'}.`
      : 'Time off saved. Those times are no longer bookable.',
  }
}

export async function deleteOverride(id: string): Promise<ActionResult> {
  const staff = await requireStaff()
  if (!z.uuid().safeParse(id).success) return { ok: false, error: 'Invalid request' }
  const [o] = await db.select().from(availabilityOverrides).where(eq(availabilityOverrides.id, id))
  if (!o) return { ok: false, error: 'Already removed' }
  if (o.therapistId === null ? staff.role !== 'admin' : !canActOnTherapist(staff, o.therapistId)) return { ok: false, error: 'Not allowed' }
  await db.delete(availabilityOverrides).where(eq(availabilityOverrides.id, id))
  refresh()
  return { ok: true }
}
