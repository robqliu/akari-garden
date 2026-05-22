import { defineConfig } from 'vitest/config'

// vitest auto-discovers this file by name (vitest.config.ts at the
// package root). Without it, vitest's default `include` matches the
// test files tsc compiles into dist/ as well, and every test runs
// twice (once against src, once against dist).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
