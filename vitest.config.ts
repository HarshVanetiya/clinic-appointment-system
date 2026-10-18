import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 'server-only' throws outside the react-server condition; it is a no-op in tests.
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    testTimeout: 20_000,
    // Make sure no test accidentally depends on the machine's zone.
    env: {
      TZ: 'America/Los_Angeles',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/northside_test',
      APP_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789',
      BOOKING_TOKEN_SECRET: 'test-booking-token-secret-0123456789',
      RESEND_API_KEY: '',
    },
    globalSetup: ['./tests/global-setup.ts'],
  },
})
