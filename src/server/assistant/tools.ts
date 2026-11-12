import 'server-only'
import type { ClinicSettings } from '@/db/schema'
import { lastBookableDate } from '@/lib/availability/engine'
import type { AssistantResponse, ServiceCardDTO } from '@/lib/assistant-types'
import { formatDuration, formatINR, formatShortDate, formatTime } from '@/lib/format'
import { addDays, isLocalDate, localToday, utcToLocal, wallToUtc } from '@/lib/time'
import { firstAvailableDate, getAvailability } from '@/server/availability'
import { engineSettings, listActiveServices, listActiveTherapists, therapistsForService } from '@/server/queries'

/**
 * The assistant can only act through these three tools. Each one reads live
 * data through the same availability engine as the booking pages, so the model
 * can never offer a time that is not really free, and it has no tool that
 * creates a booking: the patient always confirms on a card.
 */

export type Services = Awaited<ReturnType<typeof listActiveServices>>
export type Therapists = Awaited<ReturnType<typeof listActiveTherapists>>

export interface AssistantContext {
  settings: ClinicSettings
  services: Services
  therapists: Therapists
  now: number
}

/** What a turn has produced so far. Tools fill it in; the API returns it. */
export type TurnState = Pick<AssistantResponse, 'services' | 'slots' | 'slotsFor' | 'proposal'>

export const emptyTurn = (): TurnState => ({ services: [], slots: [], slotsFor: null, proposal: null })

export const toolDeclarations = [
  {
    name: 'show_treatments',
    description: 'Show up to 3 treatments as cards under your reply. Use when recommending a treatment or when the patient is choosing.',
    parameters: {
      type: 'OBJECT',
      properties: { slugs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Treatment slugs from the list' } },
      required: ['slugs'],
    },
  },
  {
    name: 'find_slots',
    description:
      'Look up free appointment times for one treatment on one date. Always call this before mentioning any time. If that date is full, it returns the next date that has times.',
    parameters: {
      type: 'OBJECT',
      properties: {
        treatment: { type: 'STRING', description: 'Treatment slug' },
        date: { type: 'STRING', description: 'YYYY-MM-DD in clinic time' },
        therapist: { type: 'STRING', description: "Therapist slug, or 'any' (default)" },
        part_of_day: { type: 'STRING', enum: ['any', 'morning', 'afternoon', 'evening'], description: 'morning = before 12, afternoon = 12 to 4, evening = after 4' },
      },
      required: ['treatment', 'date'],
    },
  },
  {
    name: 'propose_booking',
    description:
      'Once the patient has chosen a treatment and one exact time from find_slots, call this to show them a card where they enter their name, mobile and email and tap Confirm. This does not book anything.',
    parameters: {
      type: 'OBJECT',
      properties: {
        treatment: { type: 'STRING', description: 'Treatment slug' },
        date: { type: 'STRING', description: 'YYYY-MM-DD in clinic time' },
        time: { type: 'STRING', description: '24-hour HH:MM in clinic time, exactly as returned by find_slots' },
        therapist: { type: 'STRING', description: "Therapist slug, or 'any' (default)" },
      },
      required: ['treatment', 'date', 'time'],
    },
  },
] as const

const PART_OF_DAY: Record<string, [number, number]> = { morning: [0, 12 * 60], afternoon: [12 * 60, 16 * 60], evening: [16 * 60, 24 * 60] }
const MAX_SLOTS = 8

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export const serviceCard = (s: Services[number]): ServiceCardDTO => ({
  slug: s.slug,
  name: s.name,
  durationLabel: formatDuration(s.durationMin),
  priceLabel: formatINR(s.pricePaise),
})

/** Resolve the model's treatment + therapist arguments against real records. */
async function resolve(ctx: AssistantContext, args: Record<string, unknown>) {
  const service = ctx.services.find((s) => s.slug === String(args.treatment ?? ''))
  if (!service) return { error: `Unknown treatment. Use one of: ${ctx.services.map((s) => s.slug).join(', ')}.` } as const

  const wanted = String(args.therapist ?? 'any').trim() || 'any'
  if (wanted === 'any') return { service, therapistId: 'any' as const, therapistLabel: 'First available therapist' }

  const therapist = ctx.therapists.find((t) => t.slug === wanted)
  if (!therapist) return { error: `Unknown therapist. Use one of: ${ctx.therapists.map((t) => t.slug).join(', ')}, or 'any'.` } as const
  const offering = await therapistsForService(service.id)
  if (!offering.some((t) => t.id === therapist.id)) {
    return { error: `${therapist.name} does not offer ${service.name}. It is offered by: ${offering.map((t) => t.name).join(', ')}.` } as const
  }
  return { service, therapistId: therapist.id, therapistLabel: therapist.name }
}

function checkDate(ctx: AssistantContext, value: unknown) {
  const date = String(value ?? '')
  const tz = ctx.settings.timeZone
  const today = localToday(ctx.now, tz)
  const last = lastBookableDate(ctx.now, engineSettings(ctx.settings))
  if (!isLocalDate(date)) return { error: 'date must be YYYY-MM-DD.' } as const
  if (date < today) return { error: `That date is in the past. Today is ${today}.` } as const
  if (date > last) return { error: `Bookings open up to ${last}. Offer a date on or before that.` } as const
  return { date } as const
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: AssistantContext, state: TurnState): Promise<Record<string, unknown>> {
  const tz = ctx.settings.timeZone

  if (name === 'show_treatments') {
    const slugs = Array.isArray(args.slugs) ? args.slugs.map(String) : []
    const found = ctx.services.filter((s) => slugs.includes(s.slug)).slice(0, 3)
    if (found.length === 0) return { error: 'None of those slugs are treatments here.' }
    state.services = found.map(serviceCard)
    return { ok: true, shown: found.map((s) => s.slug) }
  }

  if (name === 'find_slots') {
    const target = await resolve(ctx, args)
    if ('error' in target) return { error: target.error }
    const day = checkDate(ctx, args.date)
    if ('error' in day) return { error: day.error }
    const base = { settings: ctx.settings, service: target.service, therapist: target.therapistId, now: ctx.now }

    let date = day.date
    let slots = await getAvailability({ ...base, from: date, to: date })
    let note: string | undefined
    if (slots.length === 0) {
      const next = await firstAvailableDate({ ...base, from: addDays(date, 1) })
      if (!next) return { ok: true, date, slots: [], note: 'No free times in the booking window. Suggest calling the clinic.' }
      note = `Nothing is free on ${formatShortDate(Date.parse(`${date}T12:00:00Z`), 'UTC')}. These are the times on the next available date, ${formatShortDate(Date.parse(`${next}T12:00:00Z`), 'UTC')} (${next}).`
      date = next
      slots = await getAvailability({ ...base, from: date, to: date })
    }

    const local = slots.map((s) => ({ start: s.start, minutes: utcToLocal(s.start, tz).minutes }))
    const range = PART_OF_DAY[String(args.part_of_day ?? 'any')]
    let chosen = range ? local.filter((s) => s.minutes >= range[0] && s.minutes < range[1]) : local
    if (range && chosen.length === 0) {
      note = `${note ? `${note} ` : ''}Nothing in the ${String(args.part_of_day)} that day, so these are the other times.`
      chosen = local
    }
    // Spread a long list across the day instead of only showing the earliest times.
    if (chosen.length > MAX_SLOTS) {
      const step = chosen.length / MAX_SLOTS
      chosen = Array.from({ length: MAX_SLOTS }, (_, i) => chosen[Math.floor(i * step)]!)
    }

    state.slots = chosen.map((s) => ({ date, time: hhmm(s.minutes), label: `${formatShortDate(s.start, tz)} · ${formatTime(s.start, tz)}` }))
    state.slotsFor = { serviceSlug: target.service.slug, serviceName: target.service.name, therapistLabel: target.therapistLabel }
    state.proposal = null
    return {
      ok: true,
      treatment: target.service.slug,
      date,
      weekday: formatShortDate(chosen[0]?.start ?? ctx.now, tz).split(',')[0],
      times: state.slots.map((s) => s.time),
      total_free_that_day: slots.length,
      shown_to_patient: 'These times are now shown as tappable buttons under your reply.',
      ...(note ? { note } : {}),
    }
  }

  if (name === 'propose_booking') {
    const target = await resolve(ctx, args)
    if ('error' in target) return { error: target.error }
    const day = checkDate(ctx, args.date)
    if ('error' in day) return { error: day.error }
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(args.time ?? ''))
    if (!match) return { error: 'time must be 24-hour HH:MM, exactly as returned by find_slots.' }
    const wall = wallToUtc(day.date, Number(match[1]) * 60 + Number(match[2]), tz)

    // Check the exact instant against live availability before showing the card.
    const free = await getAvailability({ settings: ctx.settings, service: target.service, therapist: target.therapistId, from: day.date, to: day.date, now: ctx.now })
    if (!wall.exists || !free.some((s) => s.start === wall.ms)) {
      return { error: `${String(args.time)} on ${day.date} is not free for that treatment and therapist. Call find_slots and offer the times it returns.` }
    }

    state.proposal = {
      serviceId: target.service.id,
      serviceSlug: target.service.slug,
      serviceName: target.service.name,
      therapist: target.therapistId,
      therapistLabel: target.therapistLabel,
      start: new Date(wall.ms).toISOString(),
      whenLabel: `${formatShortDate(wall.ms, tz)} · ${formatTime(wall.ms, tz)}`,
      durationLabel: formatDuration(target.service.durationMin),
      priceLabel: formatINR(target.service.pricePaise),
    }
    state.slots = []
    state.slotsFor = null
    return { ok: true, note: 'A card is now shown where the patient enters their name, mobile and email and taps Confirm. Do not ask for those details yourself.' }
  }

  return { error: `Unknown tool ${name}.` }
}
