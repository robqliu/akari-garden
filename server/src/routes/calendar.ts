import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import { putUser } from '../lib/db.js'
import { requireAuth } from '../lib/auth.js'
import { AppErrors, GoogleErrors, errorResponse } from '../lib/errors.js'
import { refreshAccessToken } from '../lib/google.js'

const GOOGLE_CALENDARS_URL = 'https://www.googleapis.com/calendar/v3/calendars'

export function buildCalendarRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use(requireAuth())

  router.get('/', async (c) => {
    const { user } = c.get('auth')
    return c.json({ id: user.calendarId ?? null })
  })

  router.post('/', async (c) => {
    const { user, userId } = c.get('auth')
    const body = await c.req.json<{ name?: string }>()
    const name = body.name?.trim() || 'Akari Garden'

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId })

    const calendar = await createGoogleCalendar(accessToken, name, fetchImpl)
    if (!calendar) return errorResponse(c, GoogleErrors.CALENDAR_CREATE_FAILED, { userId })

    user.calendarId = calendar.id
    await putUser(c.env, userId, user)

    return c.json({ id: calendar.id })
  })

  return router
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
    console.error(`Google calendar create failed: ${res.status}`, await res.text())
    return null
  }
  return { id: ((await res.json()) as { id: string }).id }
}
