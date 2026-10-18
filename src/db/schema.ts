import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/* -------------------------------------------------------------------------- */
/*  Auth (Better Auth core tables + a `role` column)                          */
/* -------------------------------------------------------------------------- */

export const staffRole = pgEnum('staff_role', ['admin', 'therapist'])

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: staffRole('role').notNull().default('therapist'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* -------------------------------------------------------------------------- */
/*  Clinic                                                                    */
/* -------------------------------------------------------------------------- */

/** Singleton row (id = 1). */
export const clinicSettings = pgTable(
  'clinic_settings',
  {
    id: smallint('id').primaryKey().default(1),
    name: text('name').notNull(),
    timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
    currency: text('currency').notNull().default('INR'),
    locale: text('locale').notNull().default('en-IN'),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    addressLine: text('address_line').notNull(),
    slotIntervalMin: smallint('slot_interval_min').notNull().default(15),
    minNoticeMin: integer('min_notice_min').notNull().default(120),
    bookingWindowDays: smallint('booking_window_days').notNull().default(56),
    cancellationCutoffHours: smallint('cancellation_cutoff_hours').notNull().default(24),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('clinic_settings_singleton', sql`${t.id} = 1`),
    check('clinic_settings_interval', sql`${t.slotIntervalMin} between 5 and 60`),
  ],
)

export const therapists = pgTable('therapists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .unique()
    .references(() => user.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  bio: text('bio').notNull().default(''),
  email: text('email').notNull(),
  /** Hex colour used for avatar initials and schedule chips. */
  accent: text('accent').notNull().default('#2D6A4F'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    durationMin: smallint('duration_min').notNull(),
    bufferAfterMin: smallint('buffer_after_min').notNull().default(0),
    /** Price in paise (₹1 = 100 paise). */
    pricePaise: integer('price_paise').notNull(),
    active: boolean('active').notNull().default(true),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('services_duration', sql`${t.durationMin} between 5 and 480`),
    check('services_buffer', sql`${t.bufferAfterMin} between 0 and 120`),
    check('services_price', sql`${t.pricePaise} >= 0`),
  ],
)

export const therapistServices = pgTable(
  'therapist_services',
  {
    therapistId: uuid('therapist_id')
      .notNull()
      .references(() => therapists.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.therapistId, t.serviceId] })],
)

/** Recurring weekly hours in the clinic's local wall-clock time. 0 = Sunday. */
export const workingHours = pgTable(
  'working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    therapistId: uuid('therapist_id')
      .notNull()
      .references(() => therapists.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('working_hours_therapist_idx').on(t.therapistId, t.weekday),
    check('working_hours_weekday', sql`${t.weekday} between 0 and 6`),
    check('working_hours_order', sql`${t.endTime} > ${t.startTime}`),
  ],
)

export const overrideKind = pgEnum('override_kind', ['closed', 'time_off', 'extra_hours'])

/**
 * Date-specific changes. therapistId = null means clinic-wide (e.g. a holiday).
 * startTime/endTime = null means the whole day.
 */
export const availabilityOverrides = pgTable(
  'availability_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    therapistId: uuid('therapist_id').references(() => therapists.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    kind: overrideKind('kind').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    reason: text('reason').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('overrides_date_idx').on(t.date),
    check(
      'overrides_times',
      sql`(${t.startTime} is null and ${t.endTime} is null) or (${t.startTime} is not null and ${t.endTime} is not null and ${t.endTime} > ${t.startTime})`,
    ),
    check('overrides_extra_needs_times', sql`${t.kind} <> 'extra_hours' or ${t.startTime} is not null`),
  ],
)

/* -------------------------------------------------------------------------- */
/*  Bookings                                                                  */
/* -------------------------------------------------------------------------- */

export const bookingStatus = pgEnum('booking_status', ['confirmed', 'completed', 'no_show', 'cancelled'])
export const bookingSource = pgEnum('booking_source', ['online', 'phone', 'walk_in'])

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    therapistId: uuid('therapist_id')
      .notNull()
      .references(() => therapists.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** endsAt + service buffer. The exclusion constraint covers [startsAt, blockedUntil). */
    blockedUntil: timestamp('blocked_until', { withTimezone: true }).notNull(),
    status: bookingStatus('status').notNull().default('confirmed'),
    source: bookingSource('source').notNull().default('online'),
    patientName: text('patient_name').notNull(),
    patientEmail: text('patient_email').notNull(),
    patientPhone: text('patient_phone').notNull(),
    notes: text('notes').notNull().default(''),
    pricePaise: integer('price_paise').notNull(),
    durationMin: smallint('duration_min').notNull(),
    /** Bumped on cancel/reschedule so previously emailed links stop working. */
    tokenVersion: integer('token_version').notNull().default(1),
    /** Incremented on reschedule; becomes SEQUENCE in the .ics so calendars update in place. */
    icsSequence: integer('ics_sequence').notNull().default(0),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_therapist_start_idx').on(t.therapistId, t.startsAt),
    index('bookings_start_idx').on(t.startsAt),
    index('bookings_email_idx').on(t.patientEmail),
    check('bookings_order', sql`${t.endsAt} > ${t.startsAt} and ${t.blockedUntil} >= ${t.endsAt}`),
    // NOTE: the no-double-booking EXCLUDE constraint lives in a custom SQL migration
    // (drizzle-kit cannot express EXCLUDE USING gist). See drizzle/0001_*.sql.
  ],
)

export const emailKind = pgEnum('email_kind', [
  'confirmation',
  'reminder',
  'cancellation',
  'reschedule',
  'therapist_new',
  'therapist_cancelled',
  'therapist_rescheduled',
])

export const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
    kind: emailKind('kind').notNull(),
    to: text('to').notNull(),
    providerId: text('provider_id'),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_log_booking_idx').on(t.bookingId)],
)

/** Fixed-window rate-limit counters. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limits_window_idx').on(t.windowStart)],
)

export type Service = typeof services.$inferSelect
export type Therapist = typeof therapists.$inferSelect
export type Booking = typeof bookings.$inferSelect
export type ClinicSettings = typeof clinicSettings.$inferSelect
export type WorkingHoursRow = typeof workingHours.$inferSelect
export type OverrideRow = typeof availabilityOverrides.$inferSelect
