// Dev-only script: seeds Google Tasks with test data by calling POST /api/tasks.
// Sign in via the app first, then run: pnpm --filter @akari-garden/server seed-tasks
//
// Auth approach — why it works this way:
//
// The script needs to call our authenticated API. The normal auth path (OAuth +
// session cookie) was designed for browsers. For a headless script, the right
// production pattern would be machine-to-machine API keys — a pre-shared secret
// stored in .env that the server accepts as an alternative to session cookies
// (think Stripe's sk_live_xxx tokens). We don't have that yet.
//
// The options we considered:
//
//   1. Call Google directly, bypassing our API entirely. Works, but doesn't
//      exercise our endpoint and requires reading the refresh_token from the DB.
//
//   2. Spin up the app in-process and call it via app.request() (how tests work).
//      Problem: the dev server is already running and we haven't designed the app
//      to support multiple instances, so this could cause unexpected behaviour.
//
//   3. Read the session ID from .dev.sqlite, reconstruct the signed cookie value,
//      and call the running dev server over HTTP. This is what we do below.
//
// For (3), the session cookie uses HMAC-SHA256 (Hono's setSignedCookie). Hono
// doesn't export this as a public API, so signCookieValue() reimplements it.
// In dev the signing key defaults to 'dev-only-signing-key' on both sides, so
// this isn't providing real security — it's just matching the format the server
// expects. In production this script wouldn't run at all.
import { Temporal } from '@js-temporal/polyfill'
import BetterSqlite3 from 'better-sqlite3'

const DB_PATH = '.dev.sqlite'
const API_BASE = 'http://localhost:3000'
const SESSION_COOKIE = 'ag_session'

// Mirrors Hono's setSignedCookie format: encodeURIComponent(`${value}.${base64_hmac_sha256}`)
async function signCookieValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  const signature = btoa(String.fromCharCode(...new Uint8Array(buf)))
  return encodeURIComponent(`${value}.${signature}`)
}

async function createTask(sessionCookie: string, title: string, dueOffset: number | null): Promise<void> {
  const due = dueOffset !== null ? Temporal.Now.plainDateISO().add({ days: dueOffset }).toString() : undefined
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title, ...(due ? { due } : {}) }),
  })
  if (res.status === 401) throw new Error('Session invalid — sign in again.')
  if (res.status === 400) {
    const { error } = await res.json() as { error: string }
    if (error === 'no_task_list') throw new Error('No task list — complete setup in the app first.')
    throw new Error(`Bad request: ${error}`)
  }
  if (!res.ok) throw new Error(`Create task failed (${res.status}): ${await res.text()}`)
  console.log(`  ✓ "${title}"${due ? ` — ${due}` : ''}`)
}

async function main() {
  const db = new BetterSqlite3(DB_PATH)
  const row = db.prepare('SELECT id FROM sessions LIMIT 1').get() as { id: string } | undefined
  if (!row) throw new Error('No session found — sign in via the app first.')

  const signingKey = process.env.SESSION_SIGNING_KEY ?? 'dev-only-signing-key'
  const sessionCookie = await signCookieValue(row.id, signingKey)

  const tasks: Array<{ title: string; dueOffset: number | null }> = [
    { title: 'overdue 3 days ago', dueOffset: -3 },
    { title: 'overdue yesterday',  dueOffset: -1 },
    { title: 'today 1',            dueOffset:  0 },
    { title: 'today 2',            dueOffset:  0 },
    { title: 'tomorrow 1',         dueOffset:  1 },
    { title: 'next next next day', dueOffset:  3 },
    { title: 'future',             dueOffset: 21 },
    { title: 'future + 1',         dueOffset: 22 },
    { title: 'future (gap)',        dueOffset: 24 },
    { title: 'double future',      dueOffset: 42 },
  ]

  console.log('Creating tasks...')
  for (const { title, dueOffset } of tasks) {
    await createTask(sessionCookie, title, dueOffset)
  }
  console.log('Done!')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
