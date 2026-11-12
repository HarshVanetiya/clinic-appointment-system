import 'server-only'
import type { ChatTurn } from '@/lib/assistant-types'
import { formatDuration, formatINR } from '@/lib/format'
import { formatIndianMobile } from '@/lib/phone'
import { addDays, isLocalDate, localToday, weekdayOf } from '@/lib/time'
import type { LoadedContext } from './context'
import { runTool, serviceCard, type Services, type TurnState } from './tools'

/**
 * A keyword helper that stands in for the AI when no GEMINI_API_KEY is set (or
 * the AI call fails), so the chat still books on a fresh clone. It recognises
 * treatments, a few common complaints, days and times, and drives the same
 * tools as the AI. It is not a language model, and the widget says so.
 */

/** Signs that need urgent care, not a physiotherapy booking. */
const RED_FLAGS =
  /chest pain|heart attack|can'?t breathe|cannot breathe|difficulty breathing|stroke|face droop|slurred|unconscious|faint(ed|ing)|bladder|bowel|numb(ness)? (in|around) (my |the )?(groin|saddle)|severe bleeding|accident|fracture|broken bone/

/** Complaint words → treatment slugs to prefer, when that treatment exists. */
const HINTS: [RegExp, string][] = [
  [/surgery|operation|replacement|acl|post[- ]?op|after (my )?(knee|hip|shoulder|spine)/, 'post-surgery-rehab'],
  [/needl|trigger point/, 'dry-needling'],
  [/massage|tight|sore muscles|marathon|race|recovery/, 'sports-massage'],
  [/pilates|posture|core strength/, 'clinical-pilates'],
  [/follow[- ]?up|next session|continue|again with/, 'follow-up'],
  [/pain|ache|hurt|injur|sprain|strain|stiff|sciatica|slip disc|dard|first (time|visit)|new patient|assessment|check[- ]?up|consult/, 'initial-assessment'],
]

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const namedService = (text: string, services: Services) =>
  services.find((s) => text.includes(s.name.toLowerCase().replace(/\s*\(.*\)/, '')) || text.includes(s.slug.replaceAll('-', ' ')))

function findService(text: string, services: Services) {
  const byName = namedService(text, services)
  if (byName) return byName
  for (const [pattern, slug] of HINTS) {
    const match = pattern.test(text) ? services.find((s) => s.slug === slug) : undefined
    if (match) return match
  }
  return undefined
}

function findDate(text: string, today: string): string | undefined {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1]
  if (iso && isLocalDate(iso)) return iso
  if (/\b(day after tomorrow|parso)\b/.test(text)) return addDays(today, 2)
  if (/\b(tomorrow|kal)\b/.test(text)) return addDays(today, 1)
  if (/\b(today|tonight|aaj|now|asap)\b/.test(text)) return today
  const weekday = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d.slice(0, 3)}(${d.slice(3)})?\\b`).test(text))
  if (weekday >= 0) {
    const ahead = (weekday - weekdayOf(today) + 7) % 7
    return addDays(today, ahead === 0 && /\bnext\b/.test(text) ? 7 : ahead)
  }
  const dm = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/) ?? null
  const md = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/) ?? null
  const day = dm ? Number(dm[1]) : md ? Number(md[2]) : undefined
  const month = dm ? MONTHS.indexOf(dm[2]!) : md ? MONTHS.indexOf(md[1]!) : -1
  if (day && month >= 0) {
    const year = Number(today.slice(0, 4))
    const candidate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (isLocalDate(candidate)) return candidate >= today ? candidate : `${year + 1}${candidate.slice(4)}`
  }
  return undefined
}

/** "17:30", "5:30 pm", "5pm" → "17:30". */
function findTime(text: string): string | undefined {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!m) return undefined
  let hour = Number(m[1])
  const minute = Number(m[2] ?? 0)
  if (m[3] === 'pm' && hour < 12) hour += 12
  if (m[3] === 'am' && hour === 12) hour = 0
  return hour < 24 && minute < 60 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : undefined
}

const partOfDay = (text: string) => (/\b(morning|subah)\b/.test(text) ? 'morning' : /\b(afternoon|lunch|dopahar)\b/.test(text) ? 'afternoon' : /\b(evening|after work|shaam|night)\b/.test(text) ? 'evening' : 'any')

export async function basicReply(history: ChatTurn[], ctx: LoadedContext, state: TurnState): Promise<string> {
  const s = ctx.settings
  const phone = formatIndianMobile(s.phone)
  const text = history[history.length - 1]!.text.toLowerCase().replace(/\s+/g, ' ')
  const today = localToday(ctx.now, s.timeZone)

  if (RED_FLAGS.test(text)) {
    return `That could need urgent medical attention. Please call 112 or go to the nearest emergency department now. Once you have been seen, we will gladly help with your recovery: call us on ${phone}.`
  }

  // The treatment may have been settled in an earlier message ("back pain" … "tomorrow evening").
  const earlier = history.slice(0, -1).reverse().map((t) => t.text.toLowerCase())
  const service = findService(text, ctx.services) ?? earlier.map((t) => findService(t, ctx.services)).find(Boolean)
  const therapist = ctx.therapists.find((t) => t.name.toLowerCase().replace(/^dr\.?\s*/, '').split(' ').some((part) => part.length > 2 && text.includes(part)))
  const date = findDate(text, today)
  const time = findTime(text)
  const wantsBooking = /\b(book|appointment|slot|time|available|availability|see someone|visit|schedule|when)\b/.test(text) || Boolean(date)

  if (service && date && time) {
    const result = await runTool('propose_booking', { treatment: service.slug, date, time, therapist: therapist?.slug ?? 'any' }, ctx, state)
    if (!result.error) return `${service.name}, ${state.proposal!.whenLabel}. Add your details on the card below and tap Confirm. You pay at the clinic.`
    await runTool('find_slots', { treatment: service.slug, date, therapist: therapist?.slug ?? 'any' }, ctx, state)
    return state.slots.length ? 'That exact time is not free. Here are the closest times I can offer. Tap one to book it.' : `I could not find a free time then. Please call us on ${phone}.`
  }

  if (service && (wantsBooking || findService(text, ctx.services))) {
    const result = await runTool('find_slots', { treatment: service.slug, date: date ?? today, therapist: therapist?.slug ?? 'any', part_of_day: partOfDay(text) }, ctx, state)
    if (result.error || state.slots.length === 0) {
      state.services = [serviceCard(service)]
      return `I could not find a free time for ${service.name} then. Try another day, or call us on ${phone}.`
    }
    const note = typeof result.note === 'string' ? ` ${result.note.split('. ')[0]}, so these are the next ones.` : ''
    const details = `${formatDuration(service.durationMin)}, ${formatINR(service.pricePaise)}, pay at the clinic`
    // Named outright ("sports massage on Friday") or inferred from a complaint ("my back hurts").
    const lead = namedService(text, ctx.services) ? `${service.name} is ${details}.` : `For that, patients usually start with ${service.name} (${details}). Your therapist will assess you properly at the visit.`
    return `${lead}${note} Tap a time to book it, or tell me another day.`
  }

  if (/\b(price|cost|fee|fees|charge|charges|how much|kitna)\b/.test(text)) {
    state.services = ctx.services.slice(0, 3).map(serviceCard)
    return `Prices: ${ctx.services.map((x) => `${x.name} ${formatINR(x.pricePaise)}`).join(', ')}. You pay at the clinic.`
  }
  if (/\b(cancel|reschedule|change my|move my)\b/.test(text)) {
    return `Use the Reschedule or Cancel link in your confirmation email. It is free until ${s.cancellationCutoffHours} hours before your appointment. If you cannot find the email, call us on ${phone}.`
  }
  if (/\b(where|address|location|directions|parking)\b/.test(text)) return `We are at ${s.addressLine}. Call ${phone} if you have trouble finding us.`
  if (/\b(phone|call|contact|number|email)\b/.test(text)) return `You can call us on ${phone} or email ${s.email}.`
  if (/\b(who|therapist|doctor|physio|team)\b/.test(text)) return `Our team: ${ctx.therapists.map((t) => `${t.name} (${t.title})`).join('; ')}. Tell me what is bothering you and I will find you a time.`

  state.services = ctx.services.slice(0, 3).map(serviceCard)
  return 'I can help you book a visit. Tell me what is bothering you and when you would like to come in, for example “lower back pain, tomorrow evening”.'
}
