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
  it('redirects to the Google OAuth authorize endpoint', async () => {
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
  })

  // The state cookie / state param invariant is the entire CSRF
  // defense: the callback rejects requests where the two don't agree.
  // Worth pinning so a refactor can't quietly break it.
  it('uses the same state value in the URL and the cookie', async () => {
    const app = buildApp()
    const res = await app.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      TEST_ENV,
    )

    const stateInUrl = new URL(res.headers.get('location') ?? '').searchParams.get('state')
    const stateInCookie = extractCookie(res.headers.get('set-cookie'), 'ag_oauth_state')

    expect(stateInUrl).toBeTruthy()
    expect(stateInUrl).toBe(stateInCookie)
  })
})
