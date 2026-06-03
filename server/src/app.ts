import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { AppEnv } from './lib/env.js'
import { buildAuthRouter } from './routes/auth.js'
import { buildCalendarRouter } from './routes/calendar.js'
import { buildNotesRouter } from './routes/notes.js'
import { buildTaskListRouter } from './routes/task-list.js'
import { buildTasksRouter } from './routes/tasks.js'

export function buildApp(fetchImpl?: typeof fetch): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  app.use('*', cors({
    origin: (_, c) => c.env.PUBLIC_WEB_URL,
    credentials: true,
  }))
  // KV.get is called on every request. This is intentional — caching the
  // value would require careful coordination with the deploy workflow to
  // ensure the Worker has seen the updated flag before it re-enables traffic.
  app.use('*', async (c, next) => {
    const disabled = await c.env.CONFIG_KV.get('disable_server')
    if (disabled === '1') {
      console.warn('Server is in maintenance mode, returning 503')
      return c.json({ error: 'maintenance' }, 503)
    }
    await next()
  })
  app.onError((err, c) => {
    console.error('Unhandled error:', err)
    return c.json({ error: 'internal_error' }, 500)
  })
  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.route('/api/auth', buildAuthRouter(fetchImpl))
  // TODO: not used by frontend anymore. Replaced by the task-related endpoints.
  // May be useful later if the user wants to schedule an actual event instead of just tasks.
  app.route('/api/calendar', buildCalendarRouter(fetchImpl))
  app.route('/api/task-list', buildTaskListRouter(fetchImpl))
  app.route('/api/tasks', buildTasksRouter(fetchImpl))
  app.route('/api', buildNotesRouter())
  return app
}

export const app = buildApp()

// Cloudflare Workers picks up the default export when this file is
// deployed as a Worker (see server/wrangler.jsonc). If the deployed
// Worker stops responding, this is the entrypoint to look at first.
// Background: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
export default app
