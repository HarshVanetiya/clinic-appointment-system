import { readdir, readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

/** Latest email of a kind for an address, from the dev outbox (.emails/). */
export async function latestEmail(kind: string, to: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = (await readdir('.emails').catch(() => [] as string[])).filter((f) => f.includes(`-${kind}-`) && f.endsWith('.json')).sort().reverse()
    for (const f of files) {
      const meta = JSON.parse(await readFile(`.emails/${f}`, 'utf8')) as { to: string }
      if (meta.to === to) return readFile(`.emails/${f.replace(/\.json$/, '.html')}`, 'utf8')
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No ${kind} email for ${to}`)
}

/** Find the /manage/ link in an email whose (signed) token has the given purpose. */
export function extractManageLink(html: string, purpose: 'cancel' | 'reschedule'): string {
  for (const m of html.matchAll(/href="([^"]*\/manage\/([^"]+))"/g)) {
    const payload = JSON.parse(Buffer.from(m[2]!.split('.')[0]!, 'base64url').toString('utf8')) as { p: string }
    if (payload.p === purpose) return m[1]!.replace(/&amp;/g, '&')
  }
  throw new Error(`No ${purpose} link in email`)
}

export async function bookFirstAvailable(page: Page, opts: { service: RegExp; email: string; name?: string; nextWeek?: boolean }) {
  await page.goto('/book')
  await page.getByRole('link', { name: opts.service }).click()
  const firstSlot = page.getByRole('radiogroup', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/ }).getByRole('radio').first()
  await expect(firstSlot).toBeVisible()
  if (opts.nextWeek) {
    // Book well outside the cancellation cutoff.
    const week = await page.locator('#week-label').textContent()
    await page.getByRole('button', { name: 'Next week' }).click()
    await expect(page.locator('#week-label')).not.toHaveText(week!)
    await expect(firstSlot).toBeVisible()
  }
  const label = (await firstSlot.textContent())!.trim()
  await firstSlot.click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Full name').fill(opts.name ?? 'Riya Sharma')
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel('Mobile number').fill('98765 43210')
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await expect(page.getByRole('heading', { name: /booked in/i })).toBeVisible()
  return { label, url: page.url() }
}
