import type { KVNamespace } from '@cloudflare/workers-types'

// Bindings injected by the Cloudflare Workers runtime (in production)
// or by src/index.ts (in local dev, where KV is an in-memory polyfill
// and the *_SECRET / *_ID fields come from process.env).
//
// In Workers, these are configured via wrangler.jsonc (kv_namespaces,
// vars) and `wrangler secret put` (sensitive values).
//
// In dev, populate them in server/.env (gitignored) — see README for the
// list of required vars.
export type Bindings = {
  USERS_KV: KVNamespace

  // OAuth client credentials from the Google Cloud Console.
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  // HMAC key used to sign session cookies and OAuth state values. Any
  // long random string; rotating invalidates all outstanding sessions.
  SESSION_SIGNING_KEY: string

  // Public origin of the API (used to build the OAuth redirect_uri).
  // Example: http://localhost:3000 in dev, https://akari-garden-api.<acct>.workers.dev in prod.
  PUBLIC_API_URL: string
}

export type AppEnv = { Bindings: Bindings }
