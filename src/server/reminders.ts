import 'server-only'
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { bookings } from '@/db/schema'
import { notifyBooking } from './email/notifications'

const LEAD_MS = 24 * 3_600_000

/**
 * Send 24-hour reminders. Safe to run as often as you like (hourly is ideal):
 * each booking is *claimed* with a conditional UPDATE before its email is sent,
 * so overlapping runs (Vercel Cron + GitHub Actions, retries) never double-send.
 */
export async function sendDueReminders(now = Date.now(), limit = 200) {
  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        isNull(bookings.reminderSentAt),
        gt(bookings.startsAt, new Date(now)),
        lte(bookings.startsAt, new Date(now + LEAD_MS)),
      ),
    )
    .limit(limit)

  let sent = 0
  for (const { id } of due) {
    const [claimed] = await db
      .update(bookings)
      .set({ reminderSentAt: sql`now()` })
      .where(and(eq(bookings.id, id), isNull(bookings.reminderSentAt), eq(bookings.status, 'confirmed')))
      .returning({ id: bookings.id })
    if (!claimed) continue
    await notifyBooking(id, 'reminder')
    sent++
  }
  return { checked: due.length, sent }
}
