import type { Context } from 'hono'
import { getSignedCookie } from 'hono/cookie'

import type { AppEnv, Bindings } from './env.js'

const SESSION_COOKIE = 'ag_session'

// Session record: ephemeral, deleted on logout. Maps a browser to a
// user via their Google sub — a stable identifier from the ID token's
// `sub` claim (https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload).
// Multiple sessions can point to the same googleSub (e.g. two
// devices signed into the same Google account).
export type SessionRecord = {
  googleSub: string
}

// User record: persists across sessions. Keyed by googleSub. Holds
// the refresh token and anything else that should survive logout +
// re-login (e.g. calendar registration, added in a future commit).
export type UserRecord = {
  refreshToken: string
  createdAt: string
  calendarId?: string
}

export async function putSession(env: Bindings, sessionId: string, record: SessionRecord): Promise<void> {
  await env.USERS_KV.put(`session:${sessionId}`, JSON.stringify(record))
}

export async function getSession(env: Bindings, sessionId: string): Promise<SessionRecord | null> {
  const raw = await env.USERS_KV.get(`session:${sessionId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

export async function deleteSession(env: Bindings, sessionId: string): Promise<void> {
  await env.USERS_KV.delete(`session:${sessionId}`)
}

export async function putUser(env: Bindings, googleSub: string, record: UserRecord): Promise<void> {
  await env.USERS_KV.put(`user:${googleSub}`, JSON.stringify(record))
}

export async function getUser(env: Bindings, googleSub: string): Promise<UserRecord | null> {
  const raw = await env.USERS_KV.get(`user:${googleSub}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserRecord
  } catch {
    return null
  }
}

// Resolves session cookie → session record → user record.
export async function getAuthenticatedUser(c: Context<AppEnv>): Promise<UserRecord | null> {
  const result = await getAuthenticatedUserWithSub(c)
  return result?.user ?? null
}

// Same as getAuthenticatedUser but also returns the googleSub, needed
// by routes that update the user record (which is keyed by sub).
export async function getAuthenticatedUserWithSub(
  c: Context<AppEnv>,
): Promise<{ user: UserRecord; googleSub: string } | null> {
  const sessionId = await getSessionId(c)
  if (!sessionId) return null
  const session = await getSession(c.env, sessionId)
  if (!session) return null
  const user = await getUser(c.env, session.googleSub)
  if (!user) return null
  return { user, googleSub: session.googleSub }
}

export async function getSessionId(c: Context<AppEnv>): Promise<string | null> {
  const value = await getSignedCookie(c, c.env.SESSION_SIGNING_KEY, SESSION_COOKIE)
  return typeof value === 'string' ? value : null
}
