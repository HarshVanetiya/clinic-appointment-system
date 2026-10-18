import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, email: string, from = '/admin') {
  await page.goto(from)
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('northside-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('admin sees the dashboard and can export CSV', async ({ page }) => {
  await signIn(page, 'admin@northside.example.com')
  await expect(page.getByRole('heading', { name: 'Today at a glance' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Utilisation this week' })).toBeVisible()
  await page.goto('/admin/bookings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()])
  expect(download.suggestedFilename()).toMatch(/^northside-bookings-.*\.csv$/)
})

test('therapists are kept out of admin pages', async ({ page }) => {
  await signIn(page, 'kabir.menon@northside.example.com', '/staff')
  await expect(page).toHaveURL(/\/staff$/)
  await page.goto('/admin/settings')
  await expect(page).toHaveURL(/\/staff$/)
})

test('wrong password shows an error, staff routes need a session', async ({ page, request }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@northside.example.com')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/don’t match/)).toBeVisible()
  const csv = await request.get('/admin/bookings/export', { maxRedirects: 0 })
  expect([307, 308, 401]).toContain(csv.status())
})
