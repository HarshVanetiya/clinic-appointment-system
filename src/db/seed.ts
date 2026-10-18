/**
 * Demo data for Northside Physio — a fictional clinic. All names, emails and
 * phone numbers are invented; emails use the reserved example.com domain.
 */
import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { generateSlots, type TherapistSchedule } from '../lib/availability/engine'
import { addDays, localToday, startOfWeek } from '../lib/time'
import * as s from './schema'

type DB = PostgresJsDatabase<typeof s>

export const DEMO_PASSWORD = 'northside-demo'
export const TZ = 'Asia/Kolkata'

const SERVICES = [
  {
    slug: 'initial-assessment',
    name: 'Initial Assessment',
    description: 'A thorough first visit: history, movement assessment, diagnosis and a clear treatment plan you can start the same day.',
    durationMin: 60,
    bufferAfterMin: 15,
    pricePaise: 150000,
  },
  {
    slug: 'follow-up',
    name: 'Follow-up Treatment',
    description: 'Hands-on treatment and exercise progression for existing patients, building on your plan.',
    durationMin: 45,
    bufferAfterMin: 15,
    pricePaise: 120000,
  },
  {
    slug: 'sports-massage',
    name: 'Sports Massage',
    description: 'Deep tissue work to ease tight muscles, speed recovery and keep you training — ideal before a race or after a heavy block.',
    durationMin: 60,
    bufferAfterMin: 15,
    pricePaise: 180000,
  },
  {
    slug: 'dry-needling',
    name: 'Dry Needling',
    description: 'Targeted release of trigger points to relieve stubborn pain and restore movement. Often combined with treatment.',
    durationMin: 30,
    bufferAfterMin: 10,
    pricePaise: 100000,
  },
  {
    slug: 'post-surgery-rehab',
    name: 'Post-surgery Rehab',
    description: 'Structured, milestone-based rehabilitation after knee, shoulder, hip or spine surgery, coordinated with your surgeon.',
    durationMin: 60,
    bufferAfterMin: 15,
    pricePaise: 200000,
  },
  {
    slug: 'clinical-pilates',
    name: 'Clinical Pilates (1:1)',
    description: 'Physio-led Pilates for core strength, posture and back pain, tailored to your body and goals.',
    durationMin: 45,
    bufferAfterMin: 15,
    pricePaise: 140000,
  },
] as const

type Hours = [weekday: number, start: string, end: string][]

const THERAPISTS: {
  slug: string
  name: string
  title: string
  bio: string
  email: string
  accent: string
  services: (typeof SERVICES)[number]['slug'][]
  hours: Hours
}[] = [
  {
    slug: 'ananya-rao',
    name: 'Dr. Ananya Rao',
    title: 'Sports & Orthopaedic Physiotherapist',
    bio: 'MPT (Sports). Ten years working with runners, cricketers and weekend warriors. Believes every plan should get you back to the thing you love.',
    email: 'ananya.rao@northside.example.com',
    accent: '#2D6A4F',
    services: ['initial-assessment', 'follow-up', 'sports-massage', 'dry-needling'],
    hours: [
      [1, '09:00', '13:00'], [1, '14:00', '18:00'],
      [2, '09:00', '13:00'], [2, '14:00', '18:00'],
      [3, '09:00', '13:00'], [3, '14:00', '18:00'],
      [4, '09:00', '13:00'], [4, '14:00', '18:00'],
      [5, '09:00', '13:00'], [5, '14:00', '18:00'],
      [6, '09:00', '13:00'],
    ],
  },
  {
    slug: 'kabir-menon',
    name: 'Dr. Kabir Menon',
    title: 'Spine & Post-surgical Rehab Specialist',
    bio: 'MPT (Orthopaedics). Specialises in back and neck pain and rehabilitation after joint replacement and ligament surgery.',
    email: 'kabir.menon@northside.example.com',
    accent: '#3A5A8C',
    services: ['initial-assessment', 'follow-up', 'post-surgery-rehab', 'dry-needling'],
    hours: [
      [1, '10:00', '14:00'], [1, '15:00', '19:00'],
      [2, '10:00', '14:00'], [2, '15:00', '19:00'],
      [4, '10:00', '14:00'], [4, '15:00', '19:00'],
      [5, '10:00', '14:00'], [5, '15:00', '19:00'],
      [6, '10:00', '15:00'],
    ],
  },
  {
    slug: 'meera-iyer',
    name: 'Dr. Meera Iyer',
    title: "Women's Health & Clinical Pilates",
    bio: "BPT, certified Pilates instructor. Supports pre- and post-natal recovery, pelvic health and posture, with early-morning and evening sessions.",
    email: 'meera.iyer@northside.example.com',
    accent: '#9A5B3F',
    services: ['initial-assessment', 'follow-up', 'clinical-pilates', 'sports-massage'],
    hours: [
      [2, '07:30', '11:30'], [2, '16:00', '20:00'],
      [3, '07:30', '11:30'], [3, '16:00', '20:00'],
      [4, '07:30', '11:30'], [4, '16:00', '20:00'],
      [5, '07:30', '11:30'], [5, '16:00', '20:00'],
      [6, '08:00', '12:00'],
    ],
  },
]

const PATIENTS = [
  ['Riya Sharma', 'riya.sharma'], ['Arjun Nair', 'arjun.nair'], ['Sneha Kulkarni', 'sneha.k'], ['Vikram Singh', 'vikram.singh'],
  ['Aisha Khan', 'aisha.khan'], ['Rohan Gupta', 'rohan.g'], ['Kavya Reddy', 'kavya.reddy'], ['Siddharth Joshi', 'sid.joshi'],
  ['Neha Banerjee', 'neha.b'], ['Aditya Verma', 'aditya.verma'], ['Pooja Desai', 'pooja.desai'], ['Farhan Qureshi', 'farhan.q'],
  ['Lakshmi Pillai', 'lakshmi.p'], ['Manish Agarwal', 'manish.a'], ['Tanvi Mehta', 'tanvi.mehta'], ['Harpreet Kaur', 'harpreet.k'],
  ['Deepak Chauhan', 'deepak.c'], ['Isha Malhotra', 'isha.m'], ['Nikhil Rao', 'nikhil.rao'], ['Zoya Siddiqui', 'zoya.s'],
] as const

const NOTES = ['', '', '', 'Right knee pain after running.', 'Lower back stiffness, desk job.', 'Shoulder rehab after surgery in August.', 'Training for the Bengaluru 10K.', 'Neck pain, worse in the mornings.', '']

/** Deterministic PRNG so the demo data is stable between runs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const REF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export async function truncateAll(db: DB) {
  await db.execute(sql`
    truncate table email_log, bookings, availability_overrides, working_hours, therapist_services,
      services, therapists, clinic_settings, rate_limits, session, account, verification, "user"
    restart identity cascade
  `)
}

export interface SeedOptions {
  now?: number
  withBookings?: boolean
}

export async function seed(db: DB, opts: SeedOptions = {}) {
  const now = opts.now ?? Date.now()
  const rand = mulberry32(20261018)
  await truncateAll(db)

  await db.insert(s.clinicSettings).values({
    id: 1,
    name: 'Northside Physio',
    timeZone: TZ,
    currency: 'INR',
    locale: 'en-IN',
    phone: '+919900012345',
    email: 'hello@northside.example.com',
    addressLine: '3rd Floor, 42 Lavelle Lane, Indiranagar, Bengaluru 560038',
    slotIntervalMin: 15,
    minNoticeMin: 120,
    bookingWindowDays: 56,
    cancellationCutoffHours: 24,
  })

  const serviceRows = await db
    .insert(s.services)
    .values(SERVICES.map((sv, i) => ({ ...sv, sortOrder: i })))
    .returning()
  const serviceBySlug = new Map(serviceRows.map((r) => [r.slug, r]))

  // Staff accounts: one admin (clinic owner) + one login per therapist.
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const staff = [
    { name: 'Priya Nair', email: 'admin@northside.example.com', role: 'admin' as const },
    ...THERAPISTS.map((t) => ({ name: t.name, email: t.email, role: 'therapist' as const })),
  ]
  const users = staff.map((u) => ({ id: randomUUID(), name: u.name, email: u.email, role: u.role, emailVerified: true }))
  await db.insert(s.user).values(users)
  await db.insert(s.account).values(users.map((u) => ({ id: randomUUID(), accountId: u.id, providerId: 'credential', userId: u.id, password: passwordHash })))
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]))

  const therapistRows = await db
    .insert(s.therapists)
    .values(THERAPISTS.map((t) => ({ slug: t.slug, name: t.name, title: t.title, bio: t.bio, email: t.email, accent: t.accent, userId: userIdByEmail.get(t.email)! })))
    .returning()
  const therapistBySlug = new Map(therapistRows.map((r) => [r.slug, r]))

  await db.insert(s.therapistServices).values(
    THERAPISTS.flatMap((t) => t.services.map((slug) => ({ therapistId: therapistBySlug.get(t.slug)!.id, serviceId: serviceBySlug.get(slug)!.id }))),
  )
  await db.insert(s.workingHours).values(
    THERAPISTS.flatMap((t) => t.hours.map(([weekday, startTime, endTime]) => ({ therapistId: therapistBySlug.get(t.slug)!.id, weekday, startTime, endTime }))),
  )

  // Overrides relative to "today" so the demo always shows them, plus fixed public holidays.
  const today = localToday(now, TZ)
  const thisMonday = startOfWeek(today)
  const kabir = therapistBySlug.get('kabir-menon')!.id
  const meera = therapistBySlug.get('meera-iyer')!.id
  const ananya = therapistBySlug.get('ananya-rao')!.id
  const overrides: (typeof s.availabilityOverrides.$inferInsert)[] = [
    { therapistId: null, date: '2026-11-09', kind: 'closed', reason: 'Diwali holiday' },
    { therapistId: null, date: '2026-12-25', kind: 'closed', reason: 'Christmas' },
    { therapistId: null, date: '2027-01-26', kind: 'closed', reason: 'Republic Day' },
    { therapistId: kabir, date: addDays(thisMonday, 10), kind: 'time_off', startTime: '15:00', endTime: '19:00', reason: 'Conference (afternoon)' },
    { therapistId: ananya, date: addDays(thisMonday, 15), kind: 'time_off', reason: 'Annual leave' },
    { therapistId: ananya, date: addDays(thisMonday, 16), kind: 'time_off', reason: 'Annual leave' },
    { therapistId: meera, date: addDays(thisMonday, 13), kind: 'extra_hours', startTime: '09:00', endTime: '13:00', reason: 'Sunday clinic' },
  ]
  await db.insert(s.availabilityOverrides).values(overrides)

  if (opts.withBookings === false) return { serviceBySlug, therapistBySlug, today }

  // Sample bookings: last week (completed / no-shows) and the next 7 days (confirmed).
  // Generated through the real availability engine so they never overlap.
  const from = addDays(today, -7)
  const to = addDays(today, 7)
  const busy = new Map<string, { start: number; end: number }[]>(therapistRows.map((t) => [t.id, []]))
  const offers = new Map<string, Set<string>>()
  for (const t of THERAPISTS) offers.set(therapistBySlug.get(t.slug)!.id, new Set(t.services.map((x) => serviceBySlug.get(x)!.id)))
  const scheduleFor = (id: string, slug: string): TherapistSchedule => ({
    therapistId: id,
    weeklyHours: THERAPISTS.find((t) => t.slug === slug)!.hours.map(([weekday, start, end]) => ({ weekday, start, end })),
    overrides: overrides
      .filter((o) => o.therapistId === null || o.therapistId === id)
      .map((o) => ({ date: o.date, kind: o.kind, start: o.startTime ?? null, end: o.endTime ?? null })),
    busy: busy.get(id)!,
  })

  const values: (typeof s.bookings.$inferInsert)[] = []
  const pastNow = Date.parse('2000-01-01T00:00:00Z') // let the engine produce past slots too
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const t of THERAPISTS) {
      const th = therapistBySlug.get(t.slug)!
      // Walk the day, booking ~60% of the free starts with a random service the therapist offers.
      for (let guard = 0; guard < 40; guard++) {
        const svc = serviceBySlug.get(t.services[Math.floor(rand() * t.services.length)]!)!
        const slots = generateSlots({
          settings: { timeZone: TZ, slotIntervalMin: 15, minNoticeMin: 0, bookingWindowDays: 36500 },
          service: svc,
          schedule: scheduleFor(th.id, t.slug),
          from: date,
          to: date,
          now: pastNow,
        }).filter((sl) => sl.start % (30 * 60_000) === 0) // half-hour starts look more natural
        if (slots.length === 0) break
        if (rand() < 0.35) {
          // leave a gap: drop the first free slot by blocking it briefly
          busy.get(th.id)!.push({ start: slots[0]!.start, end: slots[0]!.start + 30 * 60_000 })
          continue
        }
        const slot = slots[0]!
        const patient = PATIENTS[Math.floor(rand() * PATIENTS.length)]!
        const isPast = slot.start < now
        const status: (typeof s.bookings.$inferInsert)['status'] = isPast ? (rand() < 0.08 ? 'no_show' : 'completed') : rand() < 0.06 ? 'cancelled' : 'confirmed'
        const blockedUntil = slot.end + svc.bufferAfterMin * 60_000
        busy.get(th.id)!.push({ start: slot.start, end: blockedUntil })
        let ref = 'NP-'
        for (let i = 0; i < 6; i++) ref += REF[Math.floor(rand() * REF.length)]
        const createdAt = new Date(Math.min(slot.start - (2 + Math.floor(rand() * 10)) * 86_400_000, now))
        values.push({
          reference: ref,
          serviceId: svc.id,
          therapistId: th.id,
          startsAt: new Date(slot.start),
          endsAt: new Date(slot.end),
          blockedUntil: new Date(blockedUntil),
          status,
          source: rand() < 0.75 ? 'online' : rand() < 0.5 ? 'phone' : 'walk_in',
          patientName: patient[0],
          patientEmail: `${patient[1]}@example.com`,
          patientPhone: `+919${String(Math.floor(100000000 + rand() * 899999999)).slice(0, 9)}`,
          notes: NOTES[Math.floor(rand() * NOTES.length)]!,
          pricePaise: svc.pricePaise,
          durationMin: svc.durationMin,
          // Treat seeded bookings as already reminded so the demo cron doesn't email fake patients.
          reminderSentAt: new Date(now),
          cancelledAt: status === 'cancelled' ? new Date(now) : null,
          createdAt,
          updatedAt: createdAt,
        })
      }
    }
  }
  if (values.length) await db.insert(s.bookings).values(values)
  return { serviceBySlug, therapistBySlug, today, bookingCount: values.length }
}
