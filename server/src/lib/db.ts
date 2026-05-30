import type { Context, MiddlewareHandler } from 'hono'
import { getSignedCookie } from 'hono/cookie'

import type { AppEnv, Bindings } from './env.js'

const SESSION_COOKIE = 'ag_session'

// userId is the Google `sub` claim — a stable identifier from the ID token:
// https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload
// Multiple sessions can reference the same userId (e.g. two devices signed into the same account).
export type SessionRecord = {
  userId: string
}

export type UserRecord = {
  refreshToken: string
  createdAt: string
  calendarId?: string
}

export type AuthResult = { user: UserRecord; userId: string }

export async function putSession(env: Bindings, sessionId: string, record: SessionRecord): Promise<void> {
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)')
    .bind(sessionId, record.userId, new Date().toISOString())
    .run()
}

export async function getSession(env: Bindings, sessionId: string): Promise<SessionRecord | null> {
  const row = await env.DB.prepare('SELECT user_id FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ user_id: string }>()
  if (!row) return null
  return { userId: row.user_id }
}

export async function deleteSession(env: Bindings, sessionId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
}

// Upserts a user record. On conflict (re-login), updates mutable fields but
// leaves created_at unchanged so we preserve the original signup timestamp.
export async function putUser(env: Bindings, userId: string, record: UserRecord): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO users (id, refresh_token, calendar_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      calendar_id = excluded.calendar_id
  `).bind(userId, record.refreshToken, record.calendarId ?? null, record.createdAt).run()
}

export async function getUser(env: Bindings, userId: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; refresh_token: string; calendar_id: string | null; created_at: string }>()
  if (!row) return null
  return {
    refreshToken: row.refresh_token,
    calendarId: row.calendar_id ?? undefined,
    createdAt: row.created_at,
  }
}

// Resolves session cookie → session record → user record.
export async function getAuthenticatedUser(c: Context<AppEnv>): Promise<UserRecord | null> {
  const result = await getAuthenticatedUserWithId(c)
  return result?.user ?? null
}

// Same as getAuthenticatedUser but also returns the userId, needed
// by routes that update the user record (which is keyed by userId).
export async function getAuthenticatedUserWithId(
  c: Context<AppEnv>,
): Promise<{ user: UserRecord; userId: string } | null> {
  const sessionId = await getSessionId(c)
  if (!sessionId) return null
  const session = await getSession(c.env, sessionId)
  if (!session) return null
  const user = await getUser(c.env, session.userId)
  if (!user) return null
  return { user, userId: session.userId }
}

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = await getAuthenticatedUserWithId(c)
    if (!auth) return c.json({ error: 'not_authenticated' }, 401)
    c.set('auth', auth)
    await next()
  }
}

export async function getSessionId(c: Context<AppEnv>): Promise<string | null> {
  const value = await getSignedCookie(c, c.env.SESSION_SIGNING_KEY, SESSION_COOKIE)
  return typeof value === 'string' ? value : null
}
