import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql }

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // `prepare: false` keeps us compatible with transaction-mode poolers (Neon/Supabase pgbouncer).
  return postgres(url, { prepare: false, max: process.env.NODE_ENV === 'production' ? 5 : 10 })
}

const client = globalForDb.pgClient ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForDb.pgClient = client

export const db = drizzle(client, { schema, casing: 'snake_case' })
export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export { schema }
