import { describe, expect, it } from 'vitest'
import type { KVNamespace } from '@cloudflare/workers-types'

import { buildApp } from '../app.js'
import type { Bindings } from '../lib/env.js'

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

function fakeIdToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ sub }))
  return `${header}.${payload}.`
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function fakeFetch(routes: Record<string, (url: string, init?: RequestInit) => Response | Promise<Response>>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveUrl(input)
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(url, init)
    }
    throw new Error(`fakeFetch: no route for ${url}`)
  }) as typeof fetch
}

function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const match = setCookie.match(new RegExp(`(?:^|, )${name}=([^;]+)`))
  return match ? match[1] : null
}

const CSRF_COOKIE = 'ag_csrf_guard'
const SESSION_COOKIE = 'ag_session'

describe('OAuth flow: /start -> /callback', () => {
  it('exchanges the code, stores the refresh token, and sets a session cookie', async () => {
    const env = buildTestEnv()
    const app = buildApp(fakeFetch({
      'https://oauth2.googleapis.com/token': () =>
        Response.json({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          id_token: fakeIdToken('google-user-123'),
        }),
    }))

    const startRes = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      env,
    )
    const location = new URL(startRes.headers.get('location') ?? '')
    const state = location.searchParams.get('state')!
    const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

    const cbRes = await app.request(
      `/api/auth/google/callback?code=test-code&state=${state}`,
      { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` }, redirect: 'manual' },
      env,
    )
    expect(cbRes.status).toBe(302)
    expect(cbRes.headers.get('location')).toBe('/')

    const sessionCookie = extractCookie(cbRes.headers.get('set-cookie'), SESSION_COOKIE)
    expect(sessionCookie).toBeTruthy()
  })

  it('rejects the callback when the CSRF guard cookie does not match', async () => {
    const env = buildTestEnv()
    const app = buildApp(fakeFetch({}))

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
    const app = buildApp(fakeFetch({
      'https://oauth2.googleapis.com/token': () => new Response('error', { status: 503 }),
    }))

    const startRes = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      env,
    )
    const state = new URL(startRes.headers.get('location') ?? '').searchParams.get('state')!
    const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

    const res = await app.request(
      `/api/auth/google/callback?code=test&state=${state}`,
      { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` } },
      env,
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'token_exchange_failed' })
  })
})
