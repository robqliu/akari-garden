import { describe, expect, it } from 'vitest'

import { LocalAppFixture, CSRF_COOKIE, SESSION_COOKIE, extractCookie } from '../local/app-fixture.js'
import { mockGoogleApiTokenFailure } from './mock-google-api.js'

describe('OAuth flow: /start -> /callback', () => {
  it('exchanges the code, stores the refresh token, and sets a session cookie', async () => {
    const fixture = new LocalAppFixture()
    await fixture.signIn()
  })

  it('rejects the callback when the CSRF guard cookie does not match', async () => {
    const fixture = new LocalAppFixture()
    const res = await fixture.request(
      '/api/auth/google/callback?code=x&state=tampered',
      { headers: { cookie: `${CSRF_COOKIE}=different` } },
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'state_mismatch' })
  })

  it('returns 502 when the Google token exchange fails', async () => {
    const fixture = new LocalAppFixture(mockGoogleApiTokenFailure(503))

    const startRes = await fixture.request('/api/auth/google/start', { redirect: 'manual' })
    expect(startRes.headers.get('location')).toBeTruthy()
    const csrfGuard = new URL(startRes.headers.get('location')!).searchParams.get('state')!
    const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

    const res = await fixture.request(
      `/api/auth/google/callback?code=test&state=${csrfGuard}`,
      { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` } },
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'token_exchange_failed' })
  })
})

describe('GET /api/auth/me', () => {
  it('returns hasGoogleAccess: true when signed in', async () => {
    const fixture = new LocalAppFixture()
    const session = await fixture.signIn()

    const res = await fixture.request(
      '/api/auth/me',
      { headers: { cookie: `${SESSION_COOKIE}=${session}` } },
    )
    expect(await res.json()).toEqual({ hasGoogleAccess: true })
  })

  it('returns hasGoogleAccess: false without a session', async () => {
    const fixture = new LocalAppFixture()
    const res = await fixture.request('/api/auth/me')
    expect(await res.json()).toEqual({ hasGoogleAccess: false })
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session so /me reports no access', async () => {
    const fixture = new LocalAppFixture()
    const session = await fixture.signIn()

    const logoutRes = await fixture.request(
      '/api/auth/logout',
      { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${session}` } },
    )
    expect(await logoutRes.json()).toEqual({ ok: true })

    const meRes = await fixture.request(
      '/api/auth/me',
      { headers: { cookie: `${SESSION_COOKIE}=${session}` } },
    )
    expect(await meRes.json()).toEqual({ hasGoogleAccess: false })
  })

  it('returns ok even without a session (idempotent)', async () => {
    const fixture = new LocalAppFixture()
    const res = await fixture.request('/api/auth/logout', { method: 'POST' })
    expect(await res.json()).toEqual({ ok: true })
  })
})
