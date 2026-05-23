import { Hono } from 'hono'
import {
  deleteCookie,
  getCookie,
  setCookie,
  setSignedCookie,
} from 'hono/cookie'
import { sign as signJwt, verify as verifyJwt } from 'hono/utils/jwt/jwt'
import { JwtTokenExpired } from 'hono/utils/jwt/types'

import type { AppEnv } from '../lib/env.js'

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ')

const STATE_COOKIE = 'ag_oauth_state'
const STATE_TTL_SECONDS = 10 * 60

const SESSION_COOKIE = 'ag_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

type UserRecord = {
  googleSub: string
  refreshToken: string
  createdAt: string
}

// Tests pass a stub fetch so they can fake Google's responses without
// hitting the network. Production uses the global fetch.
export function buildAuthRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const auth = new Hono<AppEnv>()

  // ── Step 1 of the OAuth flow ──────────────────────────────────────
  // Redirect to Google's consent page. Sets a state cookie that the
  // callback will verify.
  auth.get('/google/start', async (c) => {
    const now = Math.floor(Date.now() / 1000)
    const state = await signJwt(
      { exp: now + STATE_TTL_SECONDS },
      c.env.SESSION_SIGNING_KEY,
      'HS256',
    )

    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      secure: new URL(c.req.url).hostname !== 'localhost',
      sameSite: 'Lax',
      path: '/',
      maxAge: STATE_TTL_SECONDS,
    })

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_API_URL}/api/auth/google/callback`)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)

    return c.redirect(url.toString())
  })

  // ── Step 2 of the OAuth flow ──────────────────────────────────────
  // Google redirects the user here after they approve (or deny). We
  // verify the state, exchange the one-time `code` for tokens, store
  // the refresh token, and set a session cookie.
  auth.get('/google/callback', async (c) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')
    const stateCookie = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    if (!code || !stateParam || !stateCookie) {
      return c.json({ error: 'missing_params' }, 400)
    }

    // Two checks: the param has to match the cookie we set on this
    // browser (defends against an attacker substituting their own
    // state), and the value has to be a token we minted (defends
    // against replaying a stale state from another session).
    if (stateParam !== stateCookie) {
      return c.json({ error: 'state_mismatch' }, 400)
    }
    try {
      await verifyJwt(stateParam, c.env.SESSION_SIGNING_KEY, 'HS256')
    } catch (err) {
      const reason = err instanceof JwtTokenExpired ? 'expired' : 'invalid'
      return c.json({ error: 'invalid_state', reason }, 400)
    }

    // Exchange the one-time code for tokens. This is a server-to-
    // server call (never touches the browser) authenticated by the
    // client secret, so an attacker who saw the code in URL logs
    // can't replay it without also having our secret.
    const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.PUBLIC_API_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) {
      console.error(`Google /token failed: ${tokenRes.status}`)
      return c.json({ error: 'token_exchange_failed' }, 502)
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string
      refresh_token: string
      id_token: string
    }

    // Pull the user's stable Google id from the id_token. We don't
    // verify the JWT signature because we received this token directly
    // from Google over TLS in a server-to-server response — the
    // transport is the trust boundary. If we ever accept id_tokens
    // from a client, we'd need to fetch Google's JWKS and verify.
    const idPayload = JSON.parse(atob(tokens.id_token.split('.')[1])) as {
      sub?: string
    }
    const googleSub = idPayload.sub
    if (!googleSub) {
      return c.json({ error: 'invalid_id_token' }, 502)
    }

    // Persist the refresh token. Keyed by session id (a random UUID),
    // not by Google sub, because we don't need cross-device session
    // lookup yet. The refresh token is the only secret we store; the
    // access token is short-lived and used only in-memory by the
    // /events endpoint (a later commit).
    const sessionId = crypto.randomUUID()
    const record: UserRecord = {
      googleSub,
      refreshToken: tokens.refresh_token,
      createdAt: new Date().toISOString(),
    }
    await c.env.USERS_KV.put(`session:${sessionId}`, JSON.stringify(record))

    // Cookie security flags — do not remove without understanding the
    // attack each one prevents:
    //   httpOnly  - JS can't read the cookie, so XSS can't steal it.
    //   secure    - only sent over HTTPS, prevents leak on plain HTTP.
    //              (dropped on localhost so dev works over http.)
    //   sameSite  - browser won't attach the cookie on cross-site
    //              POSTs, blocking CSRF against our endpoints.
    await setSignedCookie(c, SESSION_COOKIE, sessionId, c.env.SESSION_SIGNING_KEY, {
      httpOnly: true,
      secure: new URL(c.req.url).hostname !== 'localhost',
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })

    return c.redirect('/')
  })

  return auth
}
