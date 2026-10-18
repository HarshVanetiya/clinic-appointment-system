import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    testTimeout: 20_000,
    // Make sure no test accidentally depends on the machine's zone.
    env: { TZ: 'America/Los_Angeles' },
  },
})
