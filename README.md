# Northside Physio — booking system

A production-grade appointment system for a (fictional) multi-therapist physiotherapy clinic in Bengaluru. Patients book in under a minute on their phone, with no account needed. Therapists manage their day. The clinic owner runs everything from one dashboard.

> Portfolio build. All people, phone numbers and addresses are invented. Emails use the reserved `example.com` domain.

> **How this was built:** written with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent, working from my requirements.

![Mobile booking flow](docs/screenshots/03-mobile-pick-time.png)

## What's inside

| Who | What they can do |
| --- | --- |
| **Patient** (no account) | Browse treatments → pick a therapist or "any available" → choose a slot on a week strip + time grid → enter details → get a confirmation email with an `.ics` invite → reschedule or cancel from signed links in that email |
| **Therapist** | Sign in, see their own day/week schedule, mark appointments completed / no-show, block time off |
| **Admin** (clinic owner) | Dashboard (today, upcoming, utilisation per therapist), all bookings with filters + CSV export, walk-in / phone bookings, services, therapists & working hours, holidays, booking rules |

Highlights:

- **No double booking, ever.** A Postgres `EXCLUDE USING gist` constraint on `(therapist, [start, end+buffer))` plus a transaction that row-locks the therapist. If two patients race, one wins and the other sees *"That time was just taken — here are the nearest options"*. This is proven by a test that fires 20 simultaneous requests.
- **Time zones done right.** Instants are stored in UTC. Recurring rules use the clinic's wall-clock time (`Asia/Kolkata`, which has a +05:30 offset). The engine is zone-generic and DST-tested against `Europe/London` and `America/New_York`.
- **India-first.** INR pricing with Indian digit grouping (₹1,25,000), `en-IN` dates, +91 mobile validation that accepts how people actually type numbers.
- **Installable PWA.** Manifest, maskable icons, a hand-written service worker with an offline page, and automatic retry of navigations / Server Actions when the connection drops.
- **Accessible.** WCAG AA: the slot picker is a keyboard-operable radiogroup with roving focus and live announcements. Focus is visible, motion respects `prefers-reduced-motion`, and every screen has loading skeletons, empty states and error states.
- **Fast.** Lighthouse mobile scores on the booking pages: performance 95–98, accessibility 100, best practices 100, SEO 100.

## Stack

| | Version | Notes |
| --- | --- | --- |
| Next.js (App Router, Server Actions, Cache Components / PPR) | 16.4 | `proxy.ts`, async request APIs, Turbopack |
| React | 19.3 | `useActionState`, `useEffectEvent` |
| TypeScript (strict + `noUncheckedIndexedAccess`) | 6.0 | Not 7.x: `typescript-eslint` doesn't support TS ≥ 6.1 yet |
| Tailwind CSS | 4.3 | CSS-first `@theme` tokens |
| PostgreSQL + Drizzle ORM / drizzle-kit | 16 / 0.45 | SQL migrations in `drizzle/` |
| Better Auth (staff only) | 1.7 | Chosen over Auth.js: v5 never left beta and is in maintenance mode |
| Resend + React Email | 6.34 | Console/file fallback when no API key is set |
| Zod | 4.6 | Validation on every Server Action and route |
| Vitest / Playwright | 5.0 / 1.64 | Unit + DB integration / E2E |

## Getting started

Requirements: **Node ≥ 22.12** and **Postgres ≥ 14** (local, Docker, [Neon](https://neon.tech) or Supabase). The `btree_gist` extension must be available; it is on all three.

```bash
npm install
cp .env.example .env          # then fill in secrets (see below)

# local Postgres via Docker (optional)
docker run -d --name northside-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=northside -p 5432:5432 postgres:16

npm run db:migrate            # creates tables + the no-overlap constraint
npm run db:seed               # 6 services, 3 therapists, ~2 weeks of sample bookings
npm run dev                   # http://localhost:3000
```

### Demo logins

Password for all accounts: `northside-demo`

| Email | Role |
| --- | --- |
| `admin@northside.example.com` | Admin (clinic owner) |
| `ananya.rao@northside.example.com` | Therapist |
| `kabir.menon@northside.example.com` | Therapist |
| `meera.iyer@northside.example.com` | Therapist |

Without `RESEND_API_KEY`, every email is written to `./.emails/` as HTML + `.ics` + a JSON envelope. Open them in a browser to see exactly what patients receive.

> If you re-seed a database that a running production server is already serving, restart the server (or wait an hour). Cached display data such as service names is revalidated hourly or when an admin edits it. Booking logic always reads live data.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string. On Vercel use Neon's **pooled** string. The client runs with `prepare: false`, so it works with transaction poolers. |
| `APP_URL` | ✅ | Public base URL, used in email links, `.ics` files and metadata. |
| `BETTER_AUTH_SECRET` | ✅ | ≥ 32 random bytes: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | ✅ | Same as `APP_URL`. |
| `BOOKING_TOKEN_SECRET` | ✅ | HMAC key for cancel / reschedule / view links. Rotating it invalidates every outstanding link. |
| `RESEND_API_KEY` | prod | Resend API key. If empty, emails are logged to `.emails/`. |
| `EMAIL_FROM` | prod | e.g. `Northside Physio <bookings@yourdomain.in>`. The domain must be verified in Resend. |
| `CRON_SECRET` | prod | Bearer token for `/api/cron/reminders`. Vercel Cron sends it automatically. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | optional | Stable key if you self-host on multiple instances. |
| `TEST_DATABASE_URL` | tests | Defaults to `postgres://postgres:postgres@localhost:5432/northside_test`. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (flat config, `eslint-config-next` + TypeScript rules) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest: unit tests (engine, time zones, tokens, ICS, formatting) and integration tests against `TEST_DATABASE_URL` (the schema is recreated on each run) |
| `npm run test:e2e` | Playwright on a production build (`npm run build` first). Re-seeds `DATABASE_URL`. |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations / seed demo data / drop everything and start over |

## How reminders are scheduled

`GET /api/cron/reminders`, with the header `Authorization: Bearer $CRON_SECRET`, sends a 24-hour reminder for every confirmed booking that starts within the next 24 hours and hasn't been reminded yet.

- **Idempotent and overlap-safe.** Each booking is *claimed* with `UPDATE … SET reminder_sent_at = now() WHERE reminder_sent_at IS NULL RETURNING` before its email is sent. Two schedulers, retries or overlapping runs can never double-send. An integration test covers this.
- **No pointless reminders.** A booking made (or moved) less than 24 hours ahead is marked as reminded at creation, because the confirmation email already serves that purpose.
- **Run it hourly.** The window is 24 hours wide, so an hourly run means each patient is reminded 23–24 hours before their appointment.

Two schedulers are included. Use either or both:

1. **Vercel Cron** (`vercel.json`): `7 * * * *` (hourly). Hourly crons need **Vercel Pro**; the Hobby plan only allows one run per day.
2. **GitHub Actions** (`.github/workflows/reminders.yml`): an hourly `curl` to the endpoint. This is free and works on Vercel Hobby. One-time setup:
   1. In the repo, open **Settings → Secrets and variables → Actions**.
   2. Under **Variables**, add `APP_URL`, e.g. `https://northside-physio.vercel.app` (no trailing slash).
   3. Under **Secrets**, add `CRON_SECRET` with exactly the same value as the `CRON_SECRET` env var on Vercel.
   4. Go to **Actions → Send appointment reminders → Run workflow** once to test it. It should log `{"ok":true,…}`.

   Scheduled workflows only run from the **default branch** and can be delayed by a few minutes at busy times. GitHub also disables them after 60 days without repository activity; re-enable with one click.

## Deploying to Vercel + Neon

1. **Database.** Create a Neon project, region `aws-ap-south-1` (Mumbai), and copy the **pooled** connection string.
2. **Migrate + seed** from your machine:
   ```bash
   DATABASE_URL="postgres://…pooler…/neondb?sslmode=require" npm run db:migrate
   DATABASE_URL="…" npm run db:seed      # optional demo data
   ```
3. **Import the repo in Vercel.** It is detected as Next.js; no build settings are needed. Set the function region to `bom1` (Mumbai) so it sits close to the database.
4. **Environment variables.** Add everything from the table above for *Production* (and *Preview* if you want). `DATABASE_URL` must also be available at build time, because public pages such as services and the team list are prerendered from the database.
5. **Email.** Verify your sending domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`.
6. **Reminders.** On Pro, `vercel.json` already schedules them. On Hobby, set up the GitHub Action as described above.
7. **Smoke test.** Make a booking on your phone, check the email and calendar invite, cancel from the email, and confirm the slot reappears.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit + integration tests, a production build and the Playwright suite against a Postgres service container on every PR.

## Architecture

```
src/
  app/
    (site)/            public site + booking flow (book → [service] → details), confirmation, manage links
    (staff)/           login, /staff (therapist), /admin (owner) — every page & action re-checks role
    api/               availability (JSON for the picker), ics download, auth, cron
    manifest.ts, icons/, icon.tsx    PWA
  lib/
    availability/engine.ts   pure slot engine (no I/O) — the heart of the system
    time.ts                  DST-safe wall-clock ↔ UTC conversion without Date's local methods
    tokens.ts                HMAC single-purpose links       ics.ts   RFC 5545 generator
    validation.ts, phone.ts, format.ts, rate-limit.ts, auth.ts, env.ts
  server/
    bookings.ts        create / reschedule / cancel transactions
    availability.ts    loads schedules → engine          queries.ts, staff-queries.ts
    email/             React Email templates, Resend sender, notifications
    reminders.ts       cron job logic                    dal.ts   requireStaff() authorization
  db/                  Drizzle schema, client, seed
drizzle/               SQL migrations (0001 = exclusion constraint)
tests/unit, tests/integration, tests/e2e
public/sw.js           service worker
```

### Booking logic in one paragraph

Open time for a day = (weekly hours ∪ extra hours) − closures − time off. Closures always win over extra hours. Slots start on the clinic's local grid (every *n* minutes from local midnight). The appointment must fit inside open time. Its buffer may run past closing, but `[start, start + duration + buffer)` must not overlap any existing booking's `[start, blocked_until)`, which already includes that booking's buffer. This is exactly the range the database constraint checks. Slots inside the minimum notice period or beyond the booking window are dropped, and wall times that don't exist on a DST spring-forward day are never offered. Creating a booking locks the therapist row (`SELECT … FOR UPDATE`), re-runs the engine on fresh data inside the transaction, and inserts. The exclusion constraint is the final guarantee. For "any available", eligible therapists are tried from lightest to busiest that day.

## Security

- All input is validated server-side with Zod. Server Actions re-authenticate and re-authorize; page-level gating is never relied on. `proxy.ts` is only an optimistic redirect.
- Postgres-backed fixed-window **rate limits** on booking, manage-link actions, availability and login (per IP and per email). Better Auth adds its own limit on sign-in.
- Manage links are **HMAC-signed and single-purpose**: the purpose is part of the MAC domain, links expire at the appointment time, and they are single-use (a version bump on cancel or reschedule revokes every older link). They're served with `Referrer-Policy: no-referrer` and never cached by the service worker.
- Patients only ever see their own booking, through a valid token. Staff routes are role-protected: therapists can only act on their own bookings.
- Staff sign-up is disabled; admins create therapist logins. Cookies are HTTP-only, and `Secure` in production.
- CSV export neutralises spreadsheet formula injection. Security headers include HSTS, `nosniff`, frame denial and a permissions policy.
- Secrets live only in environment variables (see `.env.example`).

## Known limitations / next steps

- Staff can cancel and mark attendance but not yet reschedule from the admin UI (patients can, via their link).
- Rate limiting uses Postgres for zero extra infrastructure. At high traffic, move it to Redis or Upstash.
- Payments are taken at the clinic. Razorpay / UPI prepayment would slot in after `createBooking`.
- SMS/WhatsApp reminders (common in India) would reuse `reminders.ts` with a second channel.
