import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { render, toPlainText } from '@react-email/components'
import type { ReactElement } from 'react'
import { Resend } from 'resend'
import { db } from '@/db'
import { emailLog } from '@/db/schema'
import { env } from '@/lib/env'

export type EmailKind = (typeof emailLog.$inferInsert)['kind']

export interface OutgoingEmail {
  kind: EmailKind
  bookingId: string | null
  to: string
  subject: string
  body: ReactElement
  ics?: { content: string; method: 'REQUEST' | 'CANCEL' }
  /** Prevents duplicate sends if the same logical email is retried. */
  idempotencyKey: string
}

let resend: Resend | null | undefined

function client() {
  if (resend === undefined) resend = env().RESEND_API_KEY ? new Resend(env().RESEND_API_KEY) : null
  return resend
}

/**
 * Sends one email. Never throws: email failures must not undo a booking, so the
 * outcome is recorded in `email_log` instead.
 *
 * Without RESEND_API_KEY the email is written to ./.emails (HTML + .ics) and
 * logged — handy for local development, screenshots and E2E tests.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  let providerId: string | null = null
  let status = 'sent'
  let error: string | null = null

  try {
    const html = await render(email.body)
    const text = toPlainText(html)
    const resendClient = client()

    if (resendClient) {
      const { data, error: sendError } = await resendClient.emails.send(
        {
          from: env().EMAIL_FROM,
          to: email.to,
          subject: email.subject,
          html,
          text,
          attachments: email.ics
            ? [
                {
                  filename: email.ics.method === 'CANCEL' ? 'cancelled-appointment.ics' : 'appointment.ics',
                  content: Buffer.from(email.ics.content, 'utf8'),
                  contentType: `text/calendar; method=${email.ics.method}; charset=UTF-8`,
                },
              ]
            : undefined,
          tags: [{ name: 'kind', value: email.kind }],
        },
        { idempotencyKey: email.idempotencyKey },
      )
      if (sendError) throw new Error(`${sendError.name}: ${sendError.message}`)
      providerId = data?.id ?? null
    } else {
      status = 'logged'
      // Serverless file systems are read-only outside the temp dir.
      const dir = path.join(process.env.VERCEL ? os.tmpdir() : process.cwd(), '.emails')
      const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${email.kind}-${email.bookingId ?? 'none'}`
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, `${base}.html`), html)
      if (email.ics) await writeFile(path.join(dir, `${base}.ics`), email.ics.content)
      console.info(`[email:${email.kind}] → ${email.to} · "${email.subject}" (saved to .emails/${base}.html)`)
    }
  } catch (e) {
    status = 'failed'
    error = e instanceof Error ? e.message : String(e)
    console.error(`[email:${email.kind}] failed for ${email.to}:`, error)
  }

  try {
    await db.insert(emailLog).values({ bookingId: email.bookingId, kind: email.kind, to: email.to, providerId, status, error })
  } catch (e) {
    console.error('[email] could not write email_log', e)
  }
}
