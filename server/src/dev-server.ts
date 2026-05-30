import { serve } from '@hono/node-server'

import { app } from './app.js'
import { createSqliteD1 } from './lib/d1-adapter.js'
import { createMemoryKV } from './lib/kv-adapter.js'
import type { Bindings } from './lib/env.js'

const port = parseInt(process.env.PORT || '3000', 10)

const devEnv: Bindings = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  SESSION_SIGNING_KEY: process.env.SESSION_SIGNING_KEY ?? 'dev-only-signing-key',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
  PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',
  DB: createSqliteD1('.dev.sqlite'),
  CONFIG_KV: createMemoryKV(),
}

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_WEB_URL'] as const
const missing = required.filter((k) => !devEnv[k])
if (missing.length > 0) {
  console.warn(
    `[dev] Missing env vars: ${missing.join(', ')}. Google sign-in will fail. Set them in server/.env.`,
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
