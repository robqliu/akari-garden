// Values passed to Hono handlers via `c.env`. In production the
// Cloudflare Workers runtime injects them (secrets are configured
// with `wrangler secret put`). In dev, src/index.ts populates them
// from process.env — see server/.env.example.
export type Bindings = {
  // OAuth client id from the Google Cloud Console.
  GOOGLE_CLIENT_ID: string

  // HMAC key used to sign the OAuth state token. Any long random
  // string; rotating invalidates outstanding /google/start redirects.
  SESSION_SIGNING_KEY: string

  // Public origin of this API. Used to build the redirect_uri Google
  // sends the user back to. Must exactly match one of the authorized
  // redirect URIs configured on the OAuth client in Google Cloud.
  PUBLIC_API_URL: string
}

export type AppEnv = { Bindings: Bindings }
