import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../src/db/schema'
import { DEMO_PASSWORD, seed } from '../src/db/seed'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const client = postgres(url, { max: 1, onnotice: () => {} })
const result = await seed(drizzle(client, { schema }))
await client.end()

console.log(`✓ seeded Northside Physio: 6 services, 3 therapists, ${result.bookingCount} sample bookings`)
console.log(`  Staff logins (password: ${DEMO_PASSWORD}):`)
console.log('    admin@northside.example.com        (admin)')
console.log('    ananya.rao@northside.example.com   (therapist)')
console.log('    kabir.menon@northside.example.com  (therapist)')
console.log('    meera.iyer@northside.example.com   (therapist)')
