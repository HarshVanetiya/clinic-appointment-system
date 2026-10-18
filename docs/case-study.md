# Case study — Northside Physio booking system

**Client (fictional):** Northside Physio, a three-therapist physiotherapy clinic in Indiranagar, Bengaluru
**Scope:** Product design, front-end, back-end, testing, deployment
**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Postgres · Drizzle · Better Auth · Resend · Vitest · Playwright

---

## The problem

Small clinics run on phone calls and WhatsApp messages. Every booking interrupts treatment, double bookings happen when two people pencil in the same slot, and patients who want to cancel at 11pm can't, so they simply don't turn up.

Off-the-shelf schedulers didn't fit how this clinic works. Each therapist keeps their own split shifts. Treatments have different lengths plus cleanup time. Patients often don't care who treats them, just *when*. Most of them book from a phone, on patchy mobile data.

The brief: **a patient should be able to book on their phone in under a minute, and the clinic should never be double-booked, ever.**

## Approach

### 1. Start from the hardest guarantee: no double booking

Double booking is a correctness problem, not a UI problem, so the guarantee lives in the database. Every booking stores the range it occupies, including the buffer after it, and Postgres refuses any overlapping range for the same therapist:

```sql
EXCLUDE USING gist (therapist_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&)
  WHERE (status <> 'cancelled')
```

On top of that, booking runs in a transaction that locks the therapist's row and re-checks the slot against fresh data. When two patients tap the same time, one gets it. The other sees *"That time was just taken — here are the nearest options"* with three one-tap alternatives, and the details they already typed are kept. A test fires 20 simultaneous requests at one slot and asserts exactly one booking.

Cancelled bookings drop out of the constraint, so **cancelling frees the slot the instant it happens.**

### 2. A slot engine you can trust

Availability is a pure function: weekly hours, date overrides (holidays, leave, extra Sunday clinics), existing bookings, buffers, minimum notice and booking window go in; slots come out. It has no database calls and no hidden clock, so it can be tested exhaustively. Fifty-plus tests cover overlapping and unsorted bookings, buffers on both sides, back-to-back boundaries, split shifts, closures overriding extra hours, notice and window edges, and "today" computed in the clinic's zone rather than UTC.

India doesn't observe daylight saving, but a booking system that silently breaks when the next clinic is in London isn't a product. The time layer converts wall-clock rules to UTC per date without ever touching the server's local zone. It is tested on spring-forward and fall-back days: non-existent times are never offered, and a 09:00 shift stays 09:00. IST's +05:30 offset gets its own tests, to prove slots land on :00/:15 locally rather than on UTC quarter-hours.

### 3. Designed for a phone in one hand

- **Three steps, always visible:** Service → Time → Details. Every step has its own URL, so back, refresh and sharing all just work.
- **Week strip + time grid**, grouped into Morning / Afternoon / Evening, with dots marking days that have availability. "Any available" is the default because most patients care about *when*, not *who*.
- **A sticky bottom bar** that always shows what you picked and a single Continue button within thumb reach.
- **Indian conventions throughout:** ₹1,500 pricing with Indian digit grouping, "Monday, 26 October at 9:15 am (IST)", and a mobile field that accepts `98765 43210`, `098765-43210` or `+91 98765 43210`.
- **An installable PWA** with an offline page. If the connection drops mid-booking, Next.js holds the request and retries when the patient is back online, and a calm banner explains what's happening.

### 4. Changing plans without calling

Every confirmation includes an `.ics` invite plus **Reschedule** and **Cancel** buttons. Each button carries a signed, single-purpose token:

- A cancel link can't be replayed as a reschedule link.
- Links expire at the appointment time.
- Using a link revokes all older ones.

Rescheduling moves the same booking, so the reference and calendar entry stay the same. The calendar file's sequence number increases, so Google Calendar, Apple Calendar and Outlook update the existing event instead of adding a duplicate. A clinic-set cutoff (24 hours by default) switches the page to "please call us" with a tap-to-call number.

### 5. A back office that stays out of the way

- **Therapists** see their day as a clean list with patient notes and tap-to-call, and mark completed / no-show in one tap.
- **The owner** gets today at a glance, upcoming bookings, utilisation per therapist (booked time ÷ open hours, using the same engine as the booking flow), filters, CSV export and a front-desk screen for phone and walk-in bookings that skips minimum notice.
- Services, working hours (with split shifts), holidays and booking rules are all editable. Changes reach the public site immediately.

## Key decisions

| Decision | Why |
| --- | --- |
| Exclusion constraint **and** row lock | The lock gives a friendly re-check and clean alternatives. The constraint is the proof: even a buggy future code path can't double-book. |
| Pure availability engine | Makes the riskiest logic the most testable. The same code powers booking, rescheduling, the walk-in screen and utilisation. |
| Recurring rules in wall-clock time, instants in UTC | "Kabir works 10–2 on Mondays" is a local-time fact; an appointment is an instant. Mixing the two is where DST bugs come from. |
| Signed tokens instead of patient accounts | Patients book once or twice a year. Asking them for a password costs conversions; a signed link in their inbox costs nothing. |
| Better Auth over Auth.js | Auth.js v5 never left beta and is in maintenance mode, and its maintainers now point new projects to Better Auth. |
| Cache Components (Partial Prerendering) | The page shell, services and team list are prerendered. Live availability streams in behind a skeleton, which is why the booking pages hit 95+ on Lighthouse mobile. |
| Postgres-backed rate limiting | Protects booking, cancel and login endpoints with zero extra infrastructure. |
| Emails after the response (`after()`) | Confirming feels instant. Email failures are logged and never undo a booking. |
| Deterministic date formatting on the client | Node and Chrome ship different ICU data for `en-IN`, which caused hydration mismatches. Calendar labels are formatted without Intl on the client. |

## Results

- **Booking time:** the full flow (service, time, details, confirm) completes in about 4 seconds in an automated phone-sized browser. A real person doing it comfortably stays under a minute.
- **Correctness:** 92 unit and integration tests, plus 8 end-to-end tests that book on a phone viewport, open the real confirmation email, follow its cancel link and verify the slot is offered again.
- **Concurrency:** 20 parallel requests for one slot produce exactly 1 booking. Twelve "any available" requests for a slot with 3 free therapists produce exactly 3 bookings, one per therapist.
- **Lighthouse (mobile):** booking pages score 95–98 performance and 100 accessibility, best practices and SEO.
- **Accessibility:** a keyboard-operable slot picker (arrow keys, Home/End, live region announcements), visible focus, 24px+ targets, AA contrast, reduced-motion support.

## Screenshots

All files are in `docs/screenshots/`:

1. `01-mobile-home.png` — Landing hero with booking preview card
2. `02-mobile-choose-service.png` — Step 1: treatments with INR pricing
3. `03-mobile-pick-time.png` — Step 2: therapist chips, week strip, grouped time grid, sticky Continue bar
4. `04-mobile-details.png` — Step 3: details form with summary card and +91 phone field
5. `05-mobile-confirmed.png` — Confirmation with reference, calendar buttons and manage links
6. `06-email-confirmation.png` — Confirmation email (React Email) with Reschedule / Cancel
7. `07-mobile-reschedule.png` — Reschedule via signed link
8. `08-mobile-cancel.png` — Cancel via signed link
9. `09-desktop-login.png` — Staff sign-in
10. `10-desktop-admin-day-schedule.png` — Day schedule across all therapists
11. `11-desktop-admin-dashboard.png` — Today at a glance, utilisation meters, coming up
12. `12-desktop-bookings.png` — Bookings with filters and CSV export
13. `13-desktop-week.png` — Week view
14. `14-desktop-walk-in.png` — Front-desk booking for phone calls and walk-ins
15. `15-desktop-holidays.png` — Clinic closures and therapist time off
16. `16-desktop-settings.png` — Booking rules: slot interval, notice, window, cutoff
17. `17-desktop-therapist-hours.png` — Therapist profile with split-shift working hours
18. `18-mobile-therapist-day.png` — Therapist's day on a phone, with notes and tap-to-call

Suggested hero for the portfolio page: `03-mobile-pick-time.png` beside `11-desktop-admin-dashboard.png`.
