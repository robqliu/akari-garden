import { serve } from '@hono/node-server'

import { app } from './app.js'
import type { Bindings } from './lib/env.js'

// Production runs on Cloudflare Workers, which passes Bindings (the
// OAuth secrets) to app.fetch automatically. In Node dev we fabricate
// that argument from process.env. tsx's --env-file-if-exists flag
// loads server/.env (gitignored); see server/.env.example for the
// variables to set.

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
