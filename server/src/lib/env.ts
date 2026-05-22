import type { KVNamespace } from '@cloudflare/workers-types'

// Values passed to Hono handlers via `c.env`. In production the
// Workers runtime injects them. In dev, dev-server.ts fabricates
// them from process.env — see server/.env.example.
export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SIGNING_KEY: string
  PUBLIC_API_URL: string

  // Stores per-user OAuth records. Configured in wrangler.jsonc; in
  // dev, dev-server.ts supplies an in-memory polyfill.
  USERS_KV: KVNamespace
}

export type AppEnv = { Bindings: Bindings }
