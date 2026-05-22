import { serve } from '@hono/node-server'

import { app } from './app.js'
import type { Bindings } from './lib/env.js'

// This file is dev-only. In production, wrangler.jsonc's `main` field
// points at src/app.ts, the Cloudflare Workers runtime imports that
// module's default export (the Hono app), and the runtime itself
// calls `app.fetch(request, env, ctx)` on every incoming request —
// passing the Bindings (secrets configured with `wrangler secret
// put`) as the env argument. We never start a server in production;
// Workers does that part.
//
// For local dev there's no Workers runtime, so this file bridges to
// Node's @hono/node-server and fabricates the env argument from
// process.env. tsx's --env-file-if-exists flag loads server/.env;
// see server/.env.example for the variables to set.

const port = parseInt(process.env.PORT || '3000', 10)

const devEnv: Bindings = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  SESSION_SIGNING_KEY: process.env.SESSION_SIGNING_KEY ?? 'dev-only-signing-key',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
}

if (!devEnv.GOOGLE_CLIENT_ID) {
  console.warn(
    '[dev] GOOGLE_CLIENT_ID is unset. /api/auth/google/start will redirect to a Google page that rejects the request. Set it in server/.env.',
  )
}

serve(
  {
    fetch: (req) => app.fetch(req, devEnv),
    port,
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`)
  },
)
