import type { Context } from 'hono'
import type { CookieOptions } from 'hono/utils/cookie'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

import type { AppEnv } from './env.js'

// Name of the cookie holding the user's session id. Single source of
// truth so we never accidentally read one name and write another.
const SESSION_COOKIE = 'agss'

// Sliding window: cookie lifetime in seconds. Refreshed on every use
// (see touchSession) so an active user stays signed in indefinitely
// without giving an idle attacker an unbounded window.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

// Workers/browsers reject Secure cookies on insecure origins. In dev
// the API is served over plain http://localhost:3000, so we relax the
// Secure flag there. Detection is conservative: only "localhost" or a
// loopback IP host turns it off; anything else (incl. *.workers.dev,
// custom domains) keeps Secure on.
function cookieOptions(c: Context<AppEnv>): CookieOptions {
  const host = new URL(c.req.url).hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return {
    httpOnly: true,
    secure: !isLocal,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

export async function getSessionId(c: Context<AppEnv>): Promise<string | null> {
  const value = await getSignedCookie(c, c.env.SESSION_SIGNING_KEY, SESSION_COOKIE)
  // getSignedCookie returns false when the signature is invalid or the
  // cookie is missing — normalise both to null so callers only handle
  // "have a session" vs "don't".
  return typeof value === 'string' ? value : null
}

export async function setSessionId(c: Context<AppEnv>, sessionId: string): Promise<void> {
  await setSignedCookie(c, SESSION_COOKIE, sessionId, c.env.SESSION_SIGNING_KEY, cookieOptions(c))
}

// Re-sets the cookie with a fresh maxAge. Call from any authenticated
// endpoint to extend the sliding window.
export async function touchSession(c: Context<AppEnv>, sessionId: string): Promise<void> {
  await setSessionId(c, sessionId)
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

// Cryptographically random session id. 32 bytes of entropy hex-encoded
// — plenty for a bearer-style identifier that maps to a KV record.
export function newSessionId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
