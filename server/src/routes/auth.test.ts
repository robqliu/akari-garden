import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import type { Bindings } from '../lib/env.js'

const TEST_ENV: Bindings = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  SESSION_SIGNING_KEY: 'test-signing-key',
  PUBLIC_API_URL: 'http://localhost:3000',
}

function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const match = setCookie.match(new RegExp(`(?:^|, )${name}=([^;]+)`))
  return match ? match[1] : null
}

describe('GET /api/auth/google/start', () => {
  it('redirects to Google with the right OAuth parameters', async () => {
    const app = buildApp()
    const res = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      TEST_ENV,
    )

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location') ?? '')
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )

    const params = location.searchParams
    expect(params.get('client_id')).toBe('test-client-id')
    expect(params.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/google/callback',
    )
    expect(params.get('response_type')).toBe('code')
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')

    const scope = params.get('scope') ?? ''
    expect(scope).toContain('openid')
    expect(scope).toContain('userinfo.email')
    expect(scope).toContain('calendar.app.created')
  })

  it('sets a state cookie whose value matches the state query param', async () => {
    const app = buildApp()
    const res = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      TEST_ENV,
    )

    const location = new URL(res.headers.get('location') ?? '')
    const stateInUrl = location.searchParams.get('state')
    const stateInCookie = extractCookie(
      res.headers.get('set-cookie'),
      'ag_oauth_state',
    )

    expect(stateInUrl).toBeTruthy()
    expect(stateInUrl).toBe(stateInCookie)
  })

  it('marks the state cookie HttpOnly and SameSite=Lax', async () => {
    const app = buildApp()
    const res = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      TEST_ENV,
    )

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
  })
})
