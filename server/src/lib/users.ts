import type { Bindings } from './env.js'

// The single piece of persistent state our app holds per user. Stored
// in KV under the key "session:<sessionId>". Mapping session-id → user
// (rather than userId → user with a separate session table) keeps the
// schema to one key per logged-in browser; the same Google account
// signed in on two devices gets two records, which is fine.
export type UserRecord = {
  // Google's stable user identifier (from the ID token's `sub` claim).
  // Useful for de-duping if we ever need to find all sessions for one
  // Google account.
  googleSub: string

  // Long-lived OAuth refresh token. Stored as-is — Cloudflare encrypts
  // KV at rest. App-layer encryption is left for a follow-up if/when
  // we need defense-in-depth beyond CF.
  refreshToken: string

  // Id of the "Akari Garden" calendar we created in the user's Google
  // account on first sign-in.
  calendarId: string

  // ISO timestamp; useful for debugging "when did this user sign in".
  createdAt: string
}

function key(sessionId: string): string {
  return `session:${sessionId}`
}

export async function getUser(env: Bindings, sessionId: string): Promise<UserRecord | null> {
  const raw = await env.USERS_KV.get(key(sessionId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserRecord
  } catch {
    return null
  }
}

export async function putUser(env: Bindings, sessionId: string, user: UserRecord): Promise<void> {
  await env.USERS_KV.put(key(sessionId), JSON.stringify(user))
}

export async function deleteUser(env: Bindings, sessionId: string): Promise<void> {
  await env.USERS_KV.delete(key(sessionId))
}
