import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

export { app }

// Cloudflare Workers picks up the default export when this file is
// deployed as a Worker (see server/wrangler.jsonc). If the deployed
// Worker stops responding, this is the entrypoint to look at first.
// Background: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
export default app
