import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { AppEnv, Bindings } from './env.js'
import {
  clearSession,
  getSessionId,
  newSessionId,
  setSessionId,
  touchSession,
} from './session.js'

function fakeEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    USERS_KV: {} as Bindings['USERS_KV'],
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SIGNING_KEY: 'test-signing-key-please-rotate',
    PUBLIC_API_URL: 'http://localhost:3000',
    ...overrides,
  }
}

function buildApp() {
  const app = new Hono<AppEnv>()
  app.get('/set/:id', async (c) => {
    await setSessionId(c, c.req.param('id'))
    return c.text('ok')
  })
  app.get('/read', async (c) => {
    const id = await getSessionId(c)
    return c.json({ id })
  })
  app.get('/touch', async (c) => {
    const id = await getSessionId(c)
    if (id) await touchSession(c, id)
    return c.json({ id })
  })
  app.get('/clear', (c) => {
    clearSession(c)
    return c.text('cleared')
  })
  return app
}

// Extracts the value of the agss cookie from a Set-Cookie header so we
// can replay it on a follow-up request.
function setCookieToCookieHeader(setCookie: string | null): string {
  if (!setCookie) throw new Error('expected Set-Cookie header')
  const first = setCookie.split(';')[0]
  return first
}

describe('session cookie helpers', () => {
  it('newSessionId returns 64 hex chars (32 bytes)', () => {
    const id = newSessionId()
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(new Set([newSessionId(), newSessionId(), newSessionId()]).size).toBe(3)
  })

  it('setSessionId writes a signed cookie that getSessionId can read', async () => {
    const app = buildApp()
    const env = fakeEnv()

    const setRes = await app.request('/set/sess-abc', {}, env)
    expect(setRes.status).toBe(200)
    const cookieHeader = setCookieToCookieHeader(setRes.headers.get('set-cookie'))

    const readRes = await app.request('/read', { headers: { cookie: cookieHeader } }, env)
    expect(await readRes.json()).toEqual({ id: 'sess-abc' })
  })

  it('cookie sets Secure on non-local hosts and skips it on localhost', async () => {
    const app = buildApp()
    const env = fakeEnv()

    const localRes = await app.request('http://localhost:3000/set/x', {}, env)
    expect(localRes.headers.get('set-cookie')).not.toMatch(/Secure/i)

    const prodRes = await app.request('https://api.example.com/set/x', {}, env)
    expect(prodRes.headers.get('set-cookie')).toMatch(/Secure/i)
  })

  it('cookie has HttpOnly and SameSite=Lax', async () => {
    const app = buildApp()
    const res = await app.request('/set/x', {}, fakeEnv())
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
  })

  it('getSessionId returns null when the signature key is rotated', async () => {
    const app = buildApp()
    const setRes = await app.request('/set/sess-abc', {}, fakeEnv())
    const cookieHeader = setCookieToCookieHeader(setRes.headers.get('set-cookie'))

    const rotated = fakeEnv({ SESSION_SIGNING_KEY: 'different-key' })
    const readRes = await app.request('/read', { headers: { cookie: cookieHeader } }, rotated)
    expect(await readRes.json()).toEqual({ id: null })
  })

  it('getSessionId returns null when no cookie is set', async () => {
    const app = buildApp()
    const res = await app.request('/read', {}, fakeEnv())
    expect(await res.json()).toEqual({ id: null })
  })

  it('touchSession re-sets the cookie with a fresh max-age', async () => {
    const app = buildApp()
    const env = fakeEnv()
    const setRes = await app.request('/set/sess-abc', {}, env)
    const cookieHeader = setCookieToCookieHeader(setRes.headers.get('set-cookie'))

    const touchRes = await app.request('/touch', { headers: { cookie: cookieHeader } }, env)
    expect(await touchRes.json()).toEqual({ id: 'sess-abc' })
    expect(touchRes.headers.get('set-cookie')).toMatch(/Max-Age=/i)
  })

  it('clearSession instructs the browser to delete the cookie', async () => {
    const app = buildApp()
    const res = await app.request('/clear', {}, fakeEnv())
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/Max-Age=0/i)
  })
})
