import 'server-only'
import { aggregateSlots, generateSlots, type AggregatedSlot } from '@/lib/availability/engine'
import type { ClinicSettings, Service } from '@/db/schema'
import { addDays, utcToLocal, type LocalDate } from '@/lib/time'
import { engineSettings, loadSchedules, therapistsForService } from './queries'

export type TherapistChoice = string | 'any'

export interface AvailabilityRequest {
  settings: ClinicSettings
  service: Pick<Service, 'id' | 'durationMin' | 'bufferAfterMin'>
  therapist: TherapistChoice
  from: LocalDate
  to: LocalDate
  now: number
  excludeBookingId?: string
  /** Staff can book walk-ins: no minimum notice, and up to 60 min in the past. */
  staff?: boolean
}

/** Slots for a service, either for one therapist or aggregated across all who offer it. */
export async function getAvailability(req: AvailabilityRequest): Promise<AggregatedSlot[]> {
  const offering = await therapistsForService(req.service.id)
  const ids = req.therapist === 'any' ? offering.map((t) => t.id) : offering.some((t) => t.id === req.therapist) ? [req.therapist] : []
  if (ids.length === 0) return []

  const schedules = await loadSchedules(ids, req.from, req.to, req.settings.timeZone, { excludeBookingId: req.excludeBookingId })
  const settings = engineSettings(req.settings)
  if (req.staff) settings.minNoticeMin = -60

  return aggregateSlots(
    schedules.map((schedule) =>
      generateSlots({ settings, service: req.service, schedule, from: req.from, to: req.to, now: req.now }),
    ),
  )
}

/** First local date (within the window) that has any slot — used to open the picker on a useful week. */
export async function firstAvailableDate(req: Omit<AvailabilityRequest, 'from' | 'to'> & { from: LocalDate }): Promise<LocalDate | null> {
  // Scan in 14-day chunks to keep each query small.
  for (let offset = 0; offset <= req.settings.bookingWindowDays; offset += 14) {
    const from = addDays(req.from, offset)
    const slots = await getAvailability({ ...req, from, to: addDays(from, 13) })
    if (slots[0]) return utcToLocal(slots[0].start, req.settings.timeZone).date
  }
  return null
}
