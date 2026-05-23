import type { Context } from 'hono'
import { Hono } from 'hono'
import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
} from 'hono/cookie'
import { sign as signJwt, verify as verifyJwt } from 'hono/utils/jwt/jwt'
import { JwtTokenExpired } from 'hono/utils/jwt/types'

import type { AppEnv, Bindings } from '../lib/env.js'

const SCOPES = 'openid'

// Cookie that survives the redirect to Google and back, carrying the
// signed state token so the callback can verify the redirect is legit.
// See RFC 6749 §10.12 for the attack this prevents.
const CSRF_GUARD_COOKIE = 'ag_csrf_guard'
const CSRF_GUARD_TTL_SECONDS = 10 * 60

const SESSION_COOKIE = 'ag_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

// Google's stable user identifier, from the `sub` claim in the ID
// token (https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload).
type UserRecord = {
  googleSub: string
  refreshToken: string
  createdAt: string
}

export function buildAuthRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const auth = new Hono<AppEnv>()

  auth.get('/google/start', async (c) => {
    const csrfGuard = await mintCsrfGuard(c.env.SESSION_SIGNING_KEY)

    setCookie(c, CSRF_GUARD_COOKIE, csrfGuard, {
      ...secureCookieOptions(c),
      maxAge: CSRF_GUARD_TTL_SECONDS,
    })

    const url = buildGoogleAuthorizeUrl(c.env, csrfGuard)
    return c.redirect(url)
  })

  auth.get('/google/callback', async (c) => {
    const code = c.req.query('code')
    const stateParam = c.req.query('state')
    const guardCookie = getCookie(c, CSRF_GUARD_COOKIE)
    deleteCookie(c, CSRF_GUARD_COOKIE, { path: '/' })

    const guardError = await verifyCsrfGuard(stateParam, guardCookie, c.env.SESSION_SIGNING_KEY)
    if (guardError) return c.json(guardError.body, guardError.status)
    if (!code) return c.json({ error: 'missing_code' }, 400)

    const tokens = await exchangeCodeForTokens(code, c.env, fetchImpl)
    if (!tokens) return c.json({ error: 'token_exchange_failed' }, 502)

    const googleSub = extractGoogleSub(tokens.id_token)
    if (!googleSub) return c.json({ error: 'invalid_id_token' }, 502)

    const sessionId = await createSession(c.env, googleSub, tokens.refresh_token)

    await setSignedCookie(c, SESSION_COOKIE, sessionId, c.env.SESSION_SIGNING_KEY, {
      ...secureCookieOptions(c),
      maxAge: SESSION_TTL_SECONDS,
    })

    return c.redirect(c.env.PUBLIC_WEB_URL)
  })

  auth.get('/me', async (c) => {
    const user = await getSessionUser(c)
    return c.json({ hasGoogleAccess: !!user })
  })

  // Idempotent: returns { ok: true } even without a session so the
  // frontend doesn't need to track signed-in state before calling.
  auth.post('/logout', async (c) => {
    const sessionId = await getSessionId(c)
    if (sessionId) {
      const user = await getSessionUser(c)
      if (user) {
        try {
          await revokeRefreshToken(user.refreshToken, fetchImpl)
        } catch (err) {
          console.error('Google /revoke failed, clearing local session anyway:', err)
        }
      }
      await c.env.USERS_KV.delete(`session:${sessionId}`)
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
    }
    return c.json({ ok: true })
  })

  return auth
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildGoogleAuthorizeUrl(env: Bindings, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.PUBLIC_API_URL}/api/auth/google/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  // access_type=offline + prompt=consent together cause Google to
  // return a refresh_token. See "Refresh tokens" at
  // https://developers.google.com/identity/protocols/oauth2/web-server.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

// The CSRF guard is a HS256 JWT with a short expiry. We sign it with
// SESSION_SIGNING_KEY so the callback can verify both authenticity
// (we minted it) and freshness (not expired).
async function mintCsrfGuard(signingKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({ exp: now + CSRF_GUARD_TTL_SECONDS }, signingKey, 'HS256')
}

type ErrorResponse = { body: { error: string; reason?: string }; status: 400 }

async function verifyCsrfGuard(
  stateParam: string | undefined,
  guardCookie: string | undefined,
  signingKey: string,
): Promise<ErrorResponse | null> {
  if (!stateParam || !guardCookie) {
    return { body: { error: 'missing_params' }, status: 400 }
  }
  if (stateParam !== guardCookie) {
    console.error('CSRF guard mismatch: state param does not match cookie')
    return { body: { error: 'state_mismatch' }, status: 400 }
  }
  try {
    await verifyJwt(stateParam, signingKey, 'HS256')
  } catch (err) {
    const reason = err instanceof JwtTokenExpired ? 'expired' : 'invalid'
    return { body: { error: 'invalid_state', reason }, status: 400 }
  }
  return null
}

type TokenResponse = { access_token: string; refresh_token: string; id_token: string }

async function exchangeCodeForTokens(
  code: string,
  env: Bindings,
  fetchImpl: typeof fetch,
): Promise<TokenResponse | null> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.PUBLIC_API_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    console.error(`Google /token failed: ${res.status}`)
    return null
  }
  return (await res.json()) as TokenResponse
}

// Reads the `sub` claim from a Google ID token without verifying the
// signature. Safe here because this token came directly from Google
// over TLS in a server-to-server response — the transport is the
// trust boundary. If we ever accept ID tokens from a client, switch
// to signature verification using Google's JWKS.
function extractGoogleSub(idToken: string): string | null {
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1])) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}

async function createSession(
  env: Bindings,
  googleSub: string,
  refreshToken: string,
): Promise<string> {
  const sessionId = crypto.randomUUID()
  const record: UserRecord = {
    googleSub,
    refreshToken,
    createdAt: new Date().toISOString(),
  }
  await env.USERS_KV.put(`session:${sessionId}`, JSON.stringify(record))
  return sessionId
}

async function getSessionId(c: Context<AppEnv>): Promise<string | null> {
  const value = await getSignedCookie(c, c.env.SESSION_SIGNING_KEY, SESSION_COOKIE)
  return typeof value === 'string' ? value : null
}

async function getSessionUser(c: Context<AppEnv>): Promise<UserRecord | null> {
  const sessionId = await getSessionId(c)
  if (!sessionId) return null
  const raw = await c.env.USERS_KV.get(`session:${sessionId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserRecord
  } catch {
    return null
  }
}

async function revokeRefreshToken(refreshToken: string, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error(`Google /revoke failed: ${res.status}`)
  }
}

// Cookie security flags — do not remove without understanding the
// attack each one prevents:
//   httpOnly  - JS can't read the cookie, so XSS can't steal it
//   secure    - only sent over HTTPS, prevents leak on plain HTTP
//              (dropped on localhost so dev works over http)
//   sameSite  - browser won't attach on cross-site POSTs, blocking CSRF
function secureCookieOptions(c: Context<AppEnv>): {
  httpOnly: boolean; secure: boolean; sameSite: 'Lax'; path: string
} {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).hostname !== 'localhost',
    sameSite: 'Lax',
    path: '/',
  }
}
