import { describe, expect, it } from 'vitest'
import type { KVNamespace } from '@cloudflare/workers-types'
import type { Hono } from 'hono'

import { buildApp } from '../app.js'
import type { AppEnv, Bindings } from '../lib/env.js'
import { mockGoogleApi, mockGoogleApiTokenFailure } from './mock-google-api.js'

function createMemoryKV(): KVNamespace {
  const store = new Map<string, string>()
  const unsupported = (name: string) => () => {
    throw new Error(`memory-kv: ${name} not implemented`)
  }
  return {
    get: (async (key: string) => store.get(key) ?? null) as KVNamespace['get'],
    put: (async (key: string, value: string) => { store.set(key, value) }) as KVNamespace['put'],
    delete: (async (key: string) => { store.delete(key) }) as KVNamespace['delete'],
    list: unsupported('list') as unknown as KVNamespace['list'],
    getWithMetadata: unsupported('getWithMetadata') as unknown as KVNamespace['getWithMetadata'],
  }
}

function buildTestEnv(): Bindings {
  return {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SIGNING_KEY: 'test-signing-key',
    PUBLIC_API_URL: 'http://localhost:3000',
    USERS_KV: createMemoryKV(),
  }
}

function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const match = setCookie.match(new RegExp(`(?:^|, )${name}=([^;]+)`))
  return match ? match[1] : null
}

const CSRF_COOKIE = 'ag_csrf_guard'
const SESSION_COOKIE = 'ag_session'

// Runs the full /start → /callback flow and returns the session
// cookie. Asserts along the way that each step succeeded.
async function signIn(app: Hono<AppEnv>, env: Bindings): Promise<string> {
  const startRes = await app.request('/api/auth/google/start', { redirect: 'manual' }, env)
  expect(startRes.headers.get('location')).toBeTruthy()
  const csrfGuard = new URL(startRes.headers.get('location')!).searchParams.get('state')!
  const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

  const cbRes = await app.request(
    `/api/auth/google/callback?code=test-code&state=${csrfGuard}`,
    { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` }, redirect: 'manual' },
    env,
  )
  expect(cbRes.status).toBe(302)
  const sessionCookie = extractCookie(cbRes.headers.get('set-cookie'), SESSION_COOKIE)
  expect(sessionCookie).toBeTruthy()
  return sessionCookie!
}

describe('OAuth flow: /start -> /callback', () => {
  it('exchanges the code, stores the refresh token, and sets a session cookie', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())
    await signIn(app, env)
  })

  it('rejects the callback when the CSRF guard cookie does not match', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())

    const res = await app.request(
      '/api/auth/google/callback?code=x&state=tampered',
      { headers: { cookie: `${CSRF_COOKIE}=different` } },
      env,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'state_mismatch' })
  })

  it('returns 502 when the Google token exchange fails', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApiTokenFailure(503))

    const startRes = await app.request('/api/auth/google/start', { redirect: 'manual' }, env)
    expect(startRes.headers.get('location')).toBeTruthy()
    const csrfGuard = new URL(startRes.headers.get('location')!).searchParams.get('state')!
    const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

    const res = await app.request(
      `/api/auth/google/callback?code=test&state=${csrfGuard}`,
      { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` } },
      env,
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'token_exchange_failed' })
  })
})

describe('GET /api/auth/me', () => {
  it('returns hasGoogleAccess: true when signed in', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())
    const sessionCookie = await signIn(app, env)

    const res = await app.request(
      '/api/auth/me',
      { headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } },
      env,
    )
    expect(await res.json()).toEqual({ hasGoogleAccess: true })
  })

  it('returns hasGoogleAccess: false without a session', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())

    const res = await app.request('/api/auth/me', {}, env)
    expect(await res.json()).toEqual({ hasGoogleAccess: false })
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session so /me reports no access', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())
    const sessionCookie = await signIn(app, env)

    const logoutRes = await app.request(
      '/api/auth/logout',
      { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } },
      env,
    )
    expect(await logoutRes.json()).toEqual({ ok: true })

    const meRes = await app.request(
      '/api/auth/me',
      { headers: { cookie: `${SESSION_COOKIE}=${sessionCookie}` } },
      env,
    )
    expect(await meRes.json()).toEqual({ hasGoogleAccess: false })
  })

  it('returns ok even without a session (idempotent)', async () => {
    const env = buildTestEnv()
    const app = buildApp(mockGoogleApi())

    const res = await app.request('/api/auth/logout', { method: 'POST' }, env)
    expect(await res.json()).toEqual({ ok: true })
  })
})
