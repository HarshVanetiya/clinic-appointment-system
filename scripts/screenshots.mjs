// Regenerates docs/screenshots against a running server (default http://localhost:3000).
// Usage: npm run db:seed && rm -rf .emails && npm run build && npm start   (in another terminal)
//        npm run screenshots
// Needs RESEND_API_KEY unset on the server so emails land in ./.emails.
import { readdirSync, readFileSync } from 'node:fs'
import { chromium, devices } from '@playwright/test'

const B = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = 'docs/screenshots'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined })
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
const DAY = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/

// Patient flow on a phone
const p = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
await p.goto(B + '/')
await shot(p, '01-mobile-home')
await p.goto(B + '/book')
await shot(p, '02-mobile-choose-service')
await p.goto(B + '/book/initial-assessment')
await p.getByRole('button', { name: 'Next week' }).click()
const slot = p.getByRole('radiogroup', { name: DAY }).getByRole('radio').nth(1)
await slot.waitFor()
await slot.click()
await shot(p, '03-mobile-pick-time')
await p.getByRole('button', { name: 'Continue' }).click()
await p.getByLabel('Full name').fill('Kavya Reddy')
await p.getByLabel('Email').fill('kavya.reddy@example.com')
await p.getByLabel('Mobile number').fill('99001 23456')
await shot(p, '04-mobile-details', true)
await p.getByRole('button', { name: 'Confirm booking' }).click()
await p.getByRole('heading', { name: /booked in/ }).waitFor()
await shot(p, '05-mobile-confirmed', true)

// The confirmation email and its signed links
await new Promise((r) => setTimeout(r, 1500))
const meta = readdirSync('.emails')
  .filter((f) => f.endsWith('.json') && f.includes('-confirmation-'))
  .find((f) => JSON.parse(readFileSync(`.emails/${f}`, 'utf8')).to === 'kavya.reddy@example.com')
const html = readFileSync(`.emails/${meta.replace('.json', '.html')}`, 'utf8')
const mail = await (await browser.newContext({ viewport: { width: 640, height: 1100 } })).newPage()
await mail.setContent(html)
await shot(mail, '06-email-confirmation', true)
const link = (purpose) =>
  [...html.matchAll(/href="[^"]*(\/manage\/[^"]+)"/g)].map((m) => m[1]).find((l) => JSON.parse(Buffer.from(l.split('/')[2].split('.')[0], 'base64url')).p === purpose)
await p.goto(B + link('reschedule'))
await p.getByRole('heading', { name: 'Choose a new time' }).waitFor()
await shot(p, '07-mobile-reschedule')
await p.goto(B + link('cancel'))
await p.getByRole('heading', { name: /Cancel this/ }).waitFor()
await shot(p, '08-mobile-cancel')

// Admin on desktop
const d = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage()
await d.goto(B + '/login')
await shot(d, '09-desktop-login')
await d.getByLabel('Email').fill('admin@northside.example.com')
await d.getByLabel('Password').fill('northside-demo')
await d.getByRole('button', { name: 'Sign in' }).click()
await d.waitForURL('**/admin')
const nextWeekday = (() => {
  const t = new Date(Date.now() + 5.5 * 3_600_000)
  do t.setUTCDate(t.getUTCDate() + 1)
  while (t.getUTCDay() === 0)
  return t.toISOString().slice(0, 10)
})()
for (const [path, name] of [
  [`/staff?view=day&date=${nextWeekday}`, '10-desktop-admin-day-schedule'],
  ['/admin', '11-desktop-admin-dashboard'],
  ['/admin/bookings', '12-desktop-bookings'],
  [`/staff?view=week&date=${nextWeekday}`, '13-desktop-week'],
  ['/admin/bookings/new?service=sports-massage', '14-desktop-walk-in'],
  ['/admin/holidays', '15-desktop-holidays'],
  ['/admin/settings', '16-desktop-settings'],
]) {
  await d.goto(B + path)
  await d.waitForLoadState('networkidle')
  await shot(d, name, true)
}
await d.goto(B + '/admin/therapists')
await d.getByRole('link', { name: /Ananya/ }).click()
await d.getByRole('heading', { name: 'Weekly working hours' }).waitFor()
await shot(d, '17-desktop-therapist-hours', true)

// Therapist on a phone
const t = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
await t.goto(B + '/login')
await t.getByLabel('Email').fill('ananya.rao@northside.example.com')
await t.getByLabel('Password').fill('northside-demo')
await t.getByRole('button', { name: 'Sign in' }).click()
await t.waitForURL('**/staff')
await t.goto(B + `/staff?date=${nextWeekday}`)
await t.waitForLoadState('networkidle')
await shot(t, '18-mobile-therapist-day', true)

await browser.close()
console.log(`✓ screenshots written to ${OUT}/`)
