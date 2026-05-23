import type { KVNamespace } from '@cloudflare/workers-types'

// Values passed to Hono handlers via `c.env`. In production the
// Workers runtime injects them. In dev, dev-server.ts fabricates
// them from process.env — see server/.env.example.
export type Bindings = {
  // OAuth client credentials from the Google Cloud Console.
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  // HMAC key for signing session cookies and OAuth state JWTs. Any
  // long random string; rotating it invalidates all outstanding
  // sessions and in-flight OAuth redirects.
  SESSION_SIGNING_KEY: string

  // Public origin of this API (e.g. http://localhost:3000 in dev).
  // Used to build the OAuth redirect_uri. Must exactly match one of
  // the authorized redirect URIs on the Google Cloud OAuth client.
  PUBLIC_API_URL: string

  // Stores per-user OAuth records (refresh token, Google sub).
  // Configured in wrangler.jsonc; in dev, dev-server.ts supplies an
  // in-memory polyfill.
  USERS_KV: KVNamespace
}

export type AppEnv = { Bindings: Bindings }
