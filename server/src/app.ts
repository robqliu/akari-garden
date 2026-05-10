import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

export { app }

// Default export is the Cloudflare Workers entrypoint (Hono's `app`
// has a `fetch(request, env, ctx)` method that satisfies the Workers
// module-worker contract). The named `app` export above is consumed
// by `index.ts` (local Node dev) and the test suite.
export default app
