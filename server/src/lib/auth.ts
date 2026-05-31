import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from './env.js'
import { getAuthenticatedUserWithId } from './db.js'

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = await getAuthenticatedUserWithId(c)
    if (!auth) return c.json({ error: 'not_authenticated' }, 401)
    c.set('auth', auth)
    await next()
  }
}
