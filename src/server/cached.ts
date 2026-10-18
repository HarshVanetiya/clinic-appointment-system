import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { getServiceBySlug, getSettings, listActiveServices, listActiveTherapists } from './queries'

/**
 * Public, rarely-changing data rendered into the static shell. Admin mutations
 * call `updateTag(...)` with these tags so changes appear immediately.
 */
export const TAGS = { clinic: 'clinic', services: 'services', therapists: 'therapists' } as const

export async function getClinic() {
  'use cache'
  cacheLife('hours')
  cacheTag(TAGS.clinic)
  const s = await getSettings()
  return {
    name: s.name,
    phone: s.phone,
    email: s.email,
    addressLine: s.addressLine,
    timeZone: s.timeZone,
    cancellationCutoffHours: s.cancellationCutoffHours,
    bookingWindowDays: s.bookingWindowDays,
    minNoticeMin: s.minNoticeMin,
  }
}

export async function getPublicServices() {
  'use cache'
  cacheLife('hours')
  cacheTag(TAGS.services)
  return listActiveServices()
}

export async function getPublicService(slug: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(TAGS.services)
  return getServiceBySlug(slug)
}

export async function getPublicTherapists() {
  'use cache'
  cacheLife('hours')
  cacheTag(TAGS.therapists)
  return listActiveTherapists()
}
