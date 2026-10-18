import 'server-only'
import type { ClinicSettings, Service } from '@/db/schema'
import { lastBookableDate } from '@/lib/availability/engine'
import type { AvailabilityDTO, DayDTO } from '@/lib/booking-types'
import { formatTime } from '@/lib/format'
import { addDays, eachDate, localToday, startOfWeek, utcToLocal, type LocalDate } from '@/lib/time'
import { firstAvailableDate, getAvailability, type TherapistChoice } from './availability'
import { engineSettings } from './queries'

/** One week (Mon–Sun) of slots, shaped for the picker. */
export async function weekAvailability(args: {
  settings: ClinicSettings
  service: Pick<Service, 'id' | 'durationMin' | 'bufferAfterMin'>
  therapist: TherapistChoice
  weekStart: LocalDate
  now: number
  excludeBookingId?: string
  staff?: boolean
}): Promise<AvailabilityDTO> {
  const tz = args.settings.timeZone
  const weekStart = startOfWeek(args.weekStart)
  const weekEnd = addDays(weekStart, 6)
  const slots = await getAvailability({ ...args, from: weekStart, to: weekEnd })

  const days: DayDTO[] = eachDate(weekStart, weekEnd).map((date) => ({ date, slots: [] }))
  for (const s of slots) {
    const { date } = utcToLocal(s.start, tz)
    days.find((d) => d.date === date)?.slots.push({ start: new Date(s.start).toISOString(), label: formatTime(s.start, tz), therapistIds: s.therapistIds })
  }

  const empty = slots.length === 0
  const nextAvailable = empty ? await firstAvailableDate({ ...args, from: addDays(weekEnd, 1) }) : null

  return {
    timeZone: tz,
    weekStart,
    today: localToday(args.now, tz),
    lastBookableDate: lastBookableDate(args.now, engineSettings(args.settings)),
    days,
    nextAvailable,
  }
}

/** Week to open the picker on: the requested one, else the first week with availability. */
export async function initialWeek(
  args: Omit<Parameters<typeof firstAvailableDate>[0], 'from'>,
  requested?: string | null,
): Promise<LocalDate> {
  const today = localToday(args.now, args.settings.timeZone)
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= startOfWeek(today)) return startOfWeek(requested)
  const first = await firstAvailableDate({ ...args, from: today })
  return startOfWeek(first ?? today)
}
