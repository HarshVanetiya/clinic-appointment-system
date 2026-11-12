import { expect, test } from '@playwright/test'
import { latestEmail } from './helpers'

// These run without GEMINI_API_KEY, so they exercise the keyword fallback.
// The tools, confirm card and booking action are the same ones the AI uses.
test.describe('booking assistant (phone)', () => {
  test('books from a sentence: complaint → times → confirm card → confirmation', async ({ page }) => {
    const email = `e2e-chat-${Date.now()}@example.com`
    await page.goto('/')
    await page.getByRole('button', { name: 'Book by chat' }).last().click()
    const chat = page.getByRole('dialog', { name: /booking assistant/ })

    await chat.getByLabel('Your message').fill('knee pain, I would like to come in tomorrow')
    await chat.getByRole('button', { name: 'Send' }).click()
    await expect(chat.getByText(/Initial Assessment/).first()).toBeVisible()
    await chat.getByRole('button', { name: /^\d{1,2}:\d{2} (am|pm)$/ }).first().click()

    // Contact details are typed on the card, not into the chat.
    await chat.getByLabel('Full name').fill('Chat Patient')
    await chat.getByLabel('Mobile number').fill('98765 43210')
    await chat.getByLabel('Email').fill(email)
    await chat.getByRole('button', { name: 'Confirm booking' }).click()

    await expect(page).toHaveURL(/\/booking\//)
    await expect(page.getByText(/NP-[A-Z0-9]{6}/)).toBeVisible()
    expect(await latestEmail('confirmation', email)).toContain('Initial Assessment')
  })

  test('sends a possible emergency to 112 and offers no times', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Book by chat' }).last().click()
    const chat = page.getByRole('dialog', { name: /booking assistant/ })
    await chat.getByLabel('Your message').fill('I have chest pain and trouble breathing')
    await chat.getByRole('button', { name: 'Send' }).click()
    await expect(chat.getByText(/call 112/)).toBeVisible()
    await expect(chat.getByRole('button', { name: /^\d{1,2}:\d{2} (am|pm)$/ })).toHaveCount(0)
  })
})
