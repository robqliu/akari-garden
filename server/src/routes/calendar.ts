import { Hono } from 'hono'

import type { AppEnv, Bindings } from '../lib/env.js'
import { getAuthenticatedUserWithId, putUser } from '../lib/kv.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDARS_URL = 'https://www.googleapis.com/calendar/v3/calendars'

export function buildCalendarRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.get('/registered', async (c) => {
    const auth = await getAuthenticatedUserWithId(c)
    if (!auth) return c.json({ error: 'not_authenticated' }, 401)

    if (!auth.user.calendarId) return c.json({ calendar: null })
    return c.json({ calendar: { id: auth.user.calendarId } })
  })

  router.post('/create', async (c) => {
    const auth = await getAuthenticatedUserWithId(c)
    if (!auth) return c.json({ error: 'not_authenticated' }, 401)

    const body = await c.req.json<{ name?: string }>()
    const name = body.name?.trim() || 'Akari Garden'

    const accessToken = await refreshAccessToken(auth.user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return c.json({ error: 'reauth_required' }, 401)

    const created = await createGoogleCalendar(accessToken, name, fetchImpl)
    if (!created) return c.json({ error: 'google_unavailable' }, 502)

    auth.user.calendarId = created.id
    await putUser(c.env, auth.userId, auth.user)

    return c.json({ calendar: { id: created.id } })
  })

  return router
}

async function refreshAccessToken(
  refreshToken: string,
  env: Bindings,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error(`Google /token refresh failed: ${res.status}`)
    return null
  }
  return ((await res.json()) as { access_token: string }).access_token
}

async function createGoogleCalendar(
  accessToken: string,
  name: string,
  fetchImpl: typeof fetch,
): Promise<{ id: string } | null> {
  const res = await fetchImpl(GOOGLE_CALENDARS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ summary: name }),
  })
  if (!res.ok) {
    console.error(`Google calendar create failed: ${res.status}`)
    return null
  }
  return { id: ((await res.json()) as { id: string }).id }
}
