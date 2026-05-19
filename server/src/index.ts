import { serve } from '@hono/node-server'

import { app } from './app.js'
import { createMemoryKV } from './dev/memory-kv.js'
import type { Bindings } from './lib/env.js'

// In production the Workers runtime passes Bindings as the second arg
// to app.fetch automatically (KV namespaces, secrets, vars). In Node
// dev we have to fabricate them: KV becomes an in-memory Map, and the
// secrets/vars come from process.env (set via server/.env loaded with
// Node's --env-file flag — see README for setup).

const port = parseInt(process.env.PORT || '3000', 10)

const devEnv: Bindings = {
  USERS_KV: createMemoryKV(),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  SESSION_SIGNING_KEY: process.env.SESSION_SIGNING_KEY ?? 'dev-only-signing-key',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
}

const missing = (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const).filter(
  (k) => !devEnv[k],
)
if (missing.length > 0) {
  console.warn(
    `[dev] Missing env vars: ${missing.join(', ')}. ` +
      'Google sign-in will fail until these are set in server/.env.',
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
