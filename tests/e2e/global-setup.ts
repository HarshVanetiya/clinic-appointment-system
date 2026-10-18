import 'dotenv/config'
import { rm } from 'node:fs/promises'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../../src/db/schema'
import { seed } from '../../src/db/seed'

/** Fresh demo data + empty outbox before the E2E run. */
export default async function globalSetup() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  await seed(drizzle(client, { schema }))
  await client.end()
  await rm('.emails', { recursive: true, force: true })
}
