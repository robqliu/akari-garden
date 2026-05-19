import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import {
  isGoogleError,
  listEvents,
  refreshAccessToken,
  type CalendarEvent,
} from '../lib/google.js'
import { getSessionId } from '../lib/session.js'
import { getUser } from '../lib/users.js'

export function buildCalendarRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.get('/events', async (c) => {
    const sessionId = await getSessionId(c)
    if (!sessionId) return c.json({ error: 'not_authenticated' }, 401)
    const user = await getUser(c.env, sessionId)
    if (!user) return c.json({ error: 'not_authenticated' }, 401)

    const now = new Date()
    const defaultTo = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const timeMin = c.req.query('from') ?? now.toISOString()
    const timeMax = c.req.query('to') ?? defaultTo.toISOString()

    let access
    try {
      access = await refreshAccessToken(
        {
          clientId: c.env.GOOGLE_CLIENT_ID,
          clientSecret: c.env.GOOGLE_CLIENT_SECRET,
          refreshToken: user.refreshToken,
        },
        fetchImpl,
      )
    } catch (err) {
      // If the refresh fails with a 400 from Google it means the user
      // revoked our access (or the token expired in testing mode after
      // 7 days). Tell the FE to send them through the OAuth flow
      // again; anything else is treated as a transient upstream error.
      if (isGoogleError(err) && err.status >= 400 && err.status < 500) {
        return c.json({ error: 'reauth_required' }, 401)
      }
      return c.json({ error: 'google_unavailable' }, 502)
    }

    let events: CalendarEvent[]
    try {
      events = await listEvents(
        {
          accessToken: access.access_token,
          calendarId: user.calendarId,
          timeMin,
          timeMax,
        },
        fetchImpl,
      )
    } catch {
      return c.json({ error: 'google_unavailable' }, 502)
    }

    return c.json({ events })
  })

  return router
}
