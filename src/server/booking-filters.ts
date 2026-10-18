import 'server-only'
import { z } from 'zod'
import { addDays, isLocalDate, localToday, type LocalDate } from '@/lib/time'
import type { BookingFilters } from './staff-queries'

const schema = z.object({
  from: z.string().refine(isLocalDate).optional().catch(undefined),
  to: z.string().refine(isLocalDate).optional().catch(undefined),
  therapist: z.uuid().optional().catch(undefined),
  service: z.uuid().optional().catch(undefined),
  status: z.enum(['confirmed', 'completed', 'no_show', 'cancelled']).optional().catch(undefined),
  source: z.enum(['online', 'phone', 'walk_in']).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
})

/** Parse untrusted query params into safe filters (defaults: the next 30 days). */
export function parseBookingFilters(sp: Record<string, string | string[] | undefined>, now: number, timeZone: string) {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]))
  const p = schema.parse(flat)
  const today = localToday(now, timeZone)
  let from: LocalDate = p.from ?? today
  let to: LocalDate = p.to ?? addDays(today, 30)
  if (to < from) [from, to] = [to, from]
  const filters: BookingFilters = { from, to, therapistId: p.therapist, serviceId: p.service, status: p.status, source: p.source, q: p.q }
  return { filters, page: p.page ?? 1 }
}

export function filtersToQuery(f: BookingFilters) {
  const q = new URLSearchParams({ from: f.from, to: f.to })
  if (f.therapistId) q.set('therapist', f.therapistId)
  if (f.serviceId) q.set('service', f.serviceId)
  if (f.status) q.set('status', f.status)
  if (f.source) q.set('source', f.source)
  if (f.q) q.set('q', f.q)
  return q
}
