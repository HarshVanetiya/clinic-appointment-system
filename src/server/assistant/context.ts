import 'server-only'
import { getSettings, listActiveServices, listActiveTherapists, therapistsForService } from '@/server/queries'
import type { AssistantContext } from './tools'

export interface LoadedContext extends AssistantContext {
  /** Service slug → names of the therapists who offer it. */
  offeredBy: Map<string, string[]>
}

/** Live clinic data for one chat turn. Read fresh each time so admin edits show up at once. */
export async function loadContext(now = Date.now()): Promise<LoadedContext> {
  const [settings, services, therapists] = await Promise.all([getSettings(), listActiveServices(), listActiveTherapists()])
  const offering = await Promise.all(services.map((s) => therapistsForService(s.id)))
  const offeredBy = new Map(services.map((s, i) => [s.slug, offering[i]!.map((t) => t.name)]))
  return { settings, services, therapists, now, offeredBy }
}
