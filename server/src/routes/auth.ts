import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

import type { AppEnv } from '../lib/env.js'
import {
  buildAuthorizeUrl,
  createCalendar,
  decodeIdTokenSub,
  exchangeCodeForTokens,
  revokeToken,
} from '../lib/google.js'
import { createState, verifyState } from '../lib/oauth-state.js'
import {
  clearSession,
  getSessionId,
  newSessionId,
  setSessionId,
} from '../lib/session.js'
import { deleteUser, getUser, putUser } from '../lib/users.js'

// Short-lived cookie holding the OAuth `state` value across the
// redirect to Google. Matched against the `state` query param on the
// callback to prevent callback CSRF.
const STATE_COOKIE = 'agos'

// The fetch passed in here is what's used to call Google's APIs. Tests
// pass a stub; production passes `fetch` from app.ts.
export function buildAuthRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const auth = new Hono<AppEnv>()

  auth.get('/google/start', async (c) => {
    const state = await createState(c.env.SESSION_SIGNING_KEY)
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure: new URL(c.req.url).hostname !== 'localhost',
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 10,
    })
    const redirectUri = `${c.env.PUBLIC_API_URL}/api/auth/google/callback`
    return c.redirect(
      buildAuthorizeUrl({
        clientId: c.env.GOOGLE_CLIENT_ID,
        redirectUri,
        state,
      }),
    )
  })

  auth.get('/google/callback', async (c) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')
    const stateCookie = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    if (!code || !stateParam || !stateCookie) {
      return c.json({ error: 'missing_params' }, 400)
    }
    if (stateParam !== stateCookie) {
      return c.json({ error: 'state_mismatch' }, 400)
    }
    const verification = await verifyState(stateParam, c.env.SESSION_SIGNING_KEY)
    if (!verification.ok) {
      return c.json({ error: 'invalid_state', reason: verification.reason }, 400)
    }

    const redirectUri = `${c.env.PUBLIC_API_URL}/api/auth/google/callback`
    let tokens
    try {
      tokens = await exchangeCodeForTokens(
        {
          clientId: c.env.GOOGLE_CLIENT_ID,
          clientSecret: c.env.GOOGLE_CLIENT_SECRET,
          code,
          redirectUri,
        },
        fetchImpl,
      )
    } catch {
      return c.json({ error: 'token_exchange_failed' }, 502)
    }

    const googleSub = decodeIdTokenSub(tokens.id_token)
    if (!googleSub) {
      return c.json({ error: 'invalid_id_token' }, 502)
    }

    let calendarId: string
    try {
      const created = await createCalendar(
        { accessToken: tokens.access_token, summary: 'Akari Garden' },
        fetchImpl,
      )
      calendarId = created.id
    } catch {
      return c.json({ error: 'calendar_create_failed' }, 502)
    }

    const sessionId = newSessionId()
    await putUser(c.env, sessionId, {
      googleSub,
      refreshToken: tokens.refresh_token,
      calendarId,
      createdAt: new Date().toISOString(),
    })
    await setSessionId(c, sessionId)
    return c.redirect('/')
  })

  auth.get('/me', async (c) => {
    const sessionId = await getSessionId(c)
    if (!sessionId) return c.json({ authenticated: false })
    const user = await getUser(c.env, sessionId)
    if (!user) return c.json({ authenticated: false })
    return c.json({ authenticated: true, calendarId: user.calendarId })
  })

  auth.post('/logout', async (c) => {
    const sessionId = await getSessionId(c)
    if (sessionId) {
      const user = await getUser(c.env, sessionId)
      if (user) {
        // If Google's revoke fails (e.g. token already dead) we still
        // want to clear our own state, so swallow the error.
        try {
          await revokeToken(user.refreshToken, fetchImpl)
        } catch {
          // intentional
        }
        await deleteUser(c.env, sessionId)
      }
      clearSession(c)
    }
    return c.json({ ok: true })
  })

  return auth
}
