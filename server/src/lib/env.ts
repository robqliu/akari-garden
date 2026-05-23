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

  // Public origin of this API, e.g. http://localhost:3000 in dev or
  // https://akari-garden-api.<account>.workers.dev in prod. Used to
  // build the OAuth redirect_uri, which Google requires to exactly
  // match a URI you registered on the OAuth client:
  // https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred
  PUBLIC_API_URL: string

  // Origin of the frontend, e.g. http://localhost:5173 in dev or
  // https://akari-garden.pages.dev in prod. Used as the CORS
  // Access-Control-Allow-Origin value so the browser allows
  // credentialed requests (session cookie) from the frontend.
  PUBLIC_WEB_URL: string

  // Stores per-user OAuth records (refresh token, Google sub). In
  // dev, an in-memory polyfill.
  USERS_KV: KVNamespace
}

export type AppEnv = { Bindings: Bindings }
