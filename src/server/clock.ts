import 'server-only'
import { connection } from 'next/server'

/**
 * The current time for a request-time render. Awaiting `connection()` first marks
 * the render as dynamic, so the clock is never frozen into a prerendered shell.
 */
export async function requestNow(): Promise<number> {
  await connection()
  return Date.now()
}
