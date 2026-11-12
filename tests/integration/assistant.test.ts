/**
 * The booking assistant's tools and keyword fallback against a real Postgres.
 * The point: whatever the model (or a patient) asks for, only times that are
 * really free can reach the confirm card.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import * as s from '@/db/schema'
import { seed } from '@/db/seed'
import { wallToUtc } from '@/lib/time'
import { basicReply } from '@/server/assistant/basic'
import { loadContext, type LoadedContext } from '@/server/assistant/context'
import { systemPrompt } from '@/server/assistant/prompt'
import { emptyTurn, runTool } from '@/server/assistant/tools'
import { createBooking } from '@/server/bookings'

// Monday 19 Oct 2026, 06:00 IST.
const NOW = Date.parse('2026-10-19T00:30:00Z')
const TZ = 'Asia/Kolkata'
const TUESDAY = '2026-10-20'

let ids: Awaited<ReturnType<typeof seed>>
let ctx: LoadedContext
const say = (text: string) => [{ role: 'user' as const, text }]

beforeAll(async () => {
  ids = await seed(db, { now: NOW, withBookings: false })
})

beforeEach(async () => {
  await db.delete(s.bookings)
  ctx = await loadContext(NOW)
})

afterAll(async () => {
  await db.$client.end()
})

describe('assistant tools', () => {
  it('find_slots returns real free times and remembers which treatment they are for', async () => {
    const state = emptyTurn()
    const result = await runTool('find_slots', { treatment: 'initial-assessment', date: TUESDAY }, ctx, state)
    expect(result.ok).toBe(true)
    expect(state.slots.length).toBeGreaterThan(0)
    expect(state.slots.length).toBeLessThanOrEqual(8)
    expect(state.slots.every((slot) => slot.date === TUESDAY && /^\d{2}:\d{2}$/.test(slot.time))).toBe(true)
    expect(state.slotsFor?.serviceSlug).toBe('initial-assessment')
  })

  it('rejects unknown treatments, therapists who do not offer the treatment, and past dates', async () => {
    expect((await runTool('find_slots', { treatment: 'acupuncture', date: TUESDAY }, ctx, emptyTurn())).error).toMatch(/Unknown treatment/)
    expect((await runTool('find_slots', { treatment: 'clinical-pilates', date: TUESDAY, therapist: 'kabir-menon' }, ctx, emptyTurn())).error).toMatch(/does not offer/)
    expect((await runTool('find_slots', { treatment: 'follow-up', date: '2026-10-01' }, ctx, emptyTurn())).error).toMatch(/past/)
  })

  it('propose_booking only accepts a time that is free right now', async () => {
    const found = emptyTurn()
    await runTool('find_slots', { treatment: 'initial-assessment', date: TUESDAY, therapist: 'ananya-rao' }, ctx, found)
    const slot = found.slots[0]!

    const ok = emptyTurn()
    expect((await runTool('propose_booking', { treatment: 'initial-assessment', date: slot.date, time: slot.time, therapist: 'ananya-rao' }, ctx, ok)).ok).toBe(true)
    expect(ok.proposal?.serviceId).toBe(ids.serviceBySlug.get('initial-assessment')!.id)
    expect(ok.proposal?.therapist).toBe(ids.therapistBySlug.get('ananya-rao')!.id)

    // Someone else books that exact time; the same proposal must now be refused.
    const [h, m] = slot.time.split(':').map(Number)
    const start = new Date(wallToUtc(slot.date, h! * 60 + m!, TZ).ms)
    expect(ok.proposal?.start).toBe(start.toISOString())
    const booked = await createBooking({
      serviceId: ids.serviceBySlug.get('initial-assessment')!.id,
      therapist: ids.therapistBySlug.get('ananya-rao')!.id,
      start,
      patient: { name: 'Test Patient', email: 'patient@example.com', phone: '+919876543210', notes: '' },
      source: 'online',
      now: NOW,
    })
    expect(booked.ok).toBe(true)

    const late = emptyTurn()
    const refused = await runTool('propose_booking', { treatment: 'initial-assessment', date: slot.date, time: slot.time, therapist: 'ananya-rao' }, ctx, late)
    expect(refused.error).toMatch(/not free/)
    expect(late.proposal).toBeNull()
  })

  it('never proposes a made-up time', async () => {
    const state = emptyTurn()
    const result = await runTool('propose_booking', { treatment: 'follow-up', date: TUESDAY, time: '03:07' }, ctx, state)
    expect(result.error).toMatch(/not free/)
    expect(state.proposal).toBeNull()
  })
})

describe('keyword fallback', () => {
  it('sends emergencies to 112 instead of offering a booking', async () => {
    const state = emptyTurn()
    const reply = await basicReply(say('I have chest pain and my arm is numb'), ctx, state)
    expect(reply).toMatch(/112/)
    expect(state.slots).toHaveLength(0)
    expect(state.proposal).toBeNull()
  })

  it('turns a complaint and a day into tappable times', async () => {
    const state = emptyTurn()
    const reply = await basicReply(say('lower back pain, tomorrow evening'), ctx, state)
    expect(reply).toMatch(/Initial Assessment/)
    expect(state.slotsFor?.serviceSlug).toBe('initial-assessment')
    expect(state.slots.length).toBeGreaterThan(0)
    expect(state.slots.every((slot) => slot.date === TUESDAY && slot.time >= '16:00')).toBe(true)
  })

  it('turns a tapped time into a confirm card', async () => {
    const found = emptyTurn()
    await basicReply(say('sports massage on tuesday'), ctx, found)
    const slot = found.slots[0]!
    const state = emptyTurn()
    await basicReply(say(`Book Sports Massage on ${slot.label} (${slot.date} ${slot.time})`), ctx, state)
    expect(state.proposal?.serviceSlug).toBe('sports-massage')
    expect(state.proposal?.whenLabel).toBe(slot.label)
  })
})

describe('system prompt', () => {
  it('lists live treatments and the safety rules', () => {
    const prompt = systemPrompt(ctx)
    expect(prompt).toContain('initial-assessment: Initial Assessment')
    expect(prompt).toContain('2026-10-19 = Monday, 19 October 2026 (today)')
    expect(prompt).toMatch(/Never diagnose/)
    expect(prompt).toMatch(/112/)
  })
})
