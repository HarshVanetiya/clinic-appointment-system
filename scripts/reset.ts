import 'dotenv/config'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  throw new Error('Refusing to reset a production database without --force')
}
const sql = postgres(url, { max: 1, onnotice: () => {} })
await sql`drop schema if exists public cascade`
await sql`drop schema if exists drizzle cascade`
await sql`create schema public`
await sql.end()
console.log('✓ database reset')
