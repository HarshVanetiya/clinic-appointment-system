import { expect, test } from '@playwright/test'
import { bookFirstAvailable, extractManageLink, latestEmail } from './helpers'

test.describe('patient booking flow (phone)', () => {
  test('books in under a minute, gets a confirmation email with a calendar invite', async ({ page, request }) => {
    const started = Date.now()
    const email = `e2e-${Date.now()}@example.com`
    await bookFirstAvailable(page, { service: /Sports Massage/, email })
    expect(Date.now() - started).toBeLessThan(60_000)

    // Confirmation page details + working .ics download
    await expect(page.getByText(/NP-[A-Z0-9]{6}/)).toBeVisible()
    const icsHref = await page.getByRole('link', { name: 'Add to calendar' }).getAttribute('href')
    const ics = await request.get(icsHref!)
    expect(ics.headers()['content-type']).toContain('text/calendar')
    const body = await ics.text()
    expect(body).toContain('BEGIN:VEVENT')
    expect(body).toContain('METHOD:REQUEST')

    // The confirmation email went out, with manage links
    const html = await latestEmail('confirmation', email)
    expect(html).toContain('Sports Massage')
    expect(extractManageLink(html, 'cancel')).toContain('/manage/')
    expect(extractManageLink(html, 'reschedule')).toContain('/manage/')
  })

  test('cancelling via the email link frees the slot immediately', async ({ page, request }) => {
    const email = `cancel-${Date.now()}@example.com`
    await bookFirstAvailable(page, { service: /Dry Needling/, email, nextWeek: true })
    const html = await latestEmail('confirmation', email)
    const cancelUrl = new URL(extractManageLink(html, 'cancel'))

    await page.goto(cancelUrl.pathname)
    await expect(page.getByRole('heading', { name: 'Cancel this appointment?' })).toBeVisible()
    const when = await page.locator('article, .card').filter({ hasText: 'Dry Needling' }).first().textContent()
    await page.getByRole('button', { name: 'Yes, cancel my appointment' }).click()
    await expect(page.getByRole('heading', { name: 'Your appointment is cancelled' })).toBeVisible()

    // Same link again → already cancelled (single use)
    await page.goto(cancelUrl.pathname)
    await expect(page.getByRole('heading', { name: 'This booking is cancelled' })).toBeVisible()

    // The freed time is offered again by the availability API
    const m = /(\d{1,2}:\d{2} [ap]m)/.exec(when ?? '')
    expect(m).not.toBeNull()
    const week = new Date().toISOString().slice(0, 10)
    let found = false
    for (let i = 0; i < 3 && !found; i++) {
      const d = new Date(Date.parse(week) + i * 7 * 86_400_000).toISOString().slice(0, 10)
      const res = await request.get(`/api/availability?service=dry-needling&therapist=any&week=${d}`)
      const json = await res.json()
      found = json.days.some((day: { slots: { label: string }[] }) => day.slots.some((s) => s.label === m![1]))
    }
    expect(found).toBe(true)
  })

  test('slot picker is fully keyboard operable', async ({ page }) => {
    await page.goto('/book/follow-up')
    const group = page.getByRole('radiogroup', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/ })
    const first = group.getByRole('radio').first()
    await first.focus()
    await page.keyboard.press('Space')
    await expect(first).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio').nth(1)).toBeFocused()
    await expect(group.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  test('invalid details are explained next to the field', async ({ page }) => {
    await page.goto('/book/follow-up')
    await page.getByRole('radiogroup', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/ }).getByRole('radio').first().click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Full name').fill('Arjun Nair')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Mobile number').fill('12345')
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await expect(page.getByText('Please enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter a 10-digit Indian mobile number')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('tampered manage links are rejected', async ({ page }) => {
    await page.goto('/manage/eyJiIjoieCJ9.bogus')
    await expect(page.getByRole('heading', { name: /isn’t valid/ })).toBeVisible()
  })
})
