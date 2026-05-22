import { defineConfig } from 'vitest/config'

// The `vitest` CLI looks for a file named `vitest.config.{ts,js,...}`
// in the package root automatically — no wiring needed in any other
// file. Docs: https://vitest.dev/config/file.html
//
// Without this config, vitest's default include pattern matches test
// files compiled into dist/ by tsc, so every test runs twice (once
// against src, once against the compiled copy in dist).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
