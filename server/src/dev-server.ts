import { serve } from '@hono/node-server'
import type { KVNamespace } from '@cloudflare/workers-types'

import { app } from './app.js'
import type { Bindings } from './lib/env.js'

function createMemoryKV(): KVNamespace {
  const store = new Map<string, string>()
  const unsupported = (name: string) => () => {
    throw new Error(`memory-kv: ${name} not implemented`)
  }
  return {
    get: (async (key: string) => store.get(key) ?? null) as KVNamespace['get'],
    put: (async (key: string, value: string) => { store.set(key, value) }) as KVNamespace['put'],
    delete: (async (key: string) => { store.delete(key) }) as KVNamespace['delete'],
    list: unsupported('list') as unknown as KVNamespace['list'],
    getWithMetadata: unsupported('getWithMetadata') as unknown as KVNamespace['getWithMetadata'],
  }
}

const port = parseInt(process.env.PORT || '3000', 10)

const devEnv: Bindings = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  SESSION_SIGNING_KEY: process.env.SESSION_SIGNING_KEY ?? 'dev-only-signing-key',
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
  PUBLIC_WEB_URL: process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173',
  USERS_KV: createMemoryKV(),
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
