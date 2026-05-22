import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { sign as signJwt } from 'hono/utils/jwt/jwt'

import type { AppEnv } from '../lib/env.js'

// OAuth scopes we ask Google to grant:
//   openid + userinfo.email    - so the callback can identify the user
//   calendar.app.created       - narrowest Calendar scope; only grants
//                                access to calendars our app creates,
//                                not the user's primary calendar
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ')

// Short-lived cookie holding the state token. The callback verifies
// the `state` query param Google echoes back matches this cookie
// (defends against callback CSRF — see RFC 6749 §10.12).
const STATE_COOKIE = 'ag_oauth_state'
const STATE_TTL_SECONDS = 10 * 60

export function buildAuthRouter(): Hono<AppEnv> {
  const auth = new Hono<AppEnv>()

  auth.get('/google/start', async (c) => {
    // The OAuth `state` value has to be unguessable and not reusable
    // by an attacker. We use a HS256 JWT with a 10-minute `exp` so
    // the callback can both verify it (signature check) and reject
    // stale values (exp check). No payload beyond exp — the value is
    // opaque to anything except sign/verify.
    const now = Math.floor(Date.now() / 1000)
    const state = await signJwt(
      { exp: now + STATE_TTL_SECONDS },
      c.env.SESSION_SIGNING_KEY,
      'HS256',
    )

    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      // Browsers reject Secure cookies on http origins, so we drop it
      // for local dev. Anything that isn't localhost gets Secure.
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
    // offline + prompt=consent together are what causes Google to
    // return a refresh_token on the callback. See "Refresh tokens" at
    // https://developers.google.com/identity/protocols/oauth2/web-server.
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)

    return c.redirect(url.toString())
  })

  return auth
}
