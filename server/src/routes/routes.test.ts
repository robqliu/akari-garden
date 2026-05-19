import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it } from 'vitest'

import { createMemoryKV } from '../dev/memory-kv.js'
import type { AppEnv, Bindings } from '../lib/env.js'
import { buildAuthRouter } from './auth.js'
import { buildCalendarRouter } from './calendar.js'

// Integration test: builds the same app as production but with a
// stubbed fetch standing in for Google. Exercises the user-visible
// flows the FE will rely on:
//   * happy path: start -> Google -> callback -> /me -> /events
//   * state CSRF: callback with wrong state is rejected
//   * Google down during code exchange: 502
//   * refresh token revoked: /events returns 401 reauth_required

// Build a fake Google by routing on URL. Each test installs its own
// because the responses depend on the scenario.
type Route = (url: string, init?: RequestInit) => Promise<Response> | Response
function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(url, init)
    }
    throw new Error(`fakeFetch: no route for ${url}`)
  }) as typeof fetch
}

// Minimal JWT-shaped id_token with a given sub. No signature — our
// decoder doesn't verify (see comment in google.ts).
function fakeIdToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ sub }))
  return `${header}.${payload}.`
}

function buildEnv(): Bindings {
  return {
    USERS_KV: createMemoryKV(),
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SIGNING_KEY: 'test-signing-key',
    PUBLIC_API_URL: 'http://localhost:3000',
  }
}

function buildApp(stubFetch: typeof fetch) {
  const app = new Hono<AppEnv>()
  app.use('*', cors())
  app.route('/api/auth', buildAuthRouter(stubFetch))
  app.route('/api/calendar', buildCalendarRouter(stubFetch))
  return app
}

// Extracts the named cookie value from a Set-Cookie header.
function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  // Hono's Node adapter joins multiple Set-Cookie headers with ', ' so
  // we have to be tolerant of that.
  for (const part of setCookie.split(/,(?=\s*[^ ]+=)/)) {
    const [pair] = part.trim().split(';')
    const [k, ...rest] = pair.split('=')
    if (k.trim() === name) return rest.join('=')
  }
  return null
}

describe('Google Calendar integration', () => {
  it('happy path: start -> callback -> /me -> /events', async () => {
    const stub = fakeFetch({
      'https://oauth2.googleapis.com/token': async (_url, init) => {
        const body = new URLSearchParams(init?.body as string)
        if (body.get('grant_type') === 'authorization_code') {
          return new Response(
            JSON.stringify({
              access_token: 'access-1',
              refresh_token: 'refresh-1',
              expires_in: 3600,
              id_token: fakeIdToken('google-user-123'),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ access_token: 'access-2', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
      'https://www.googleapis.com/calendar/v3/calendars': async (url) => {
        if (url.includes('/events')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'evt-1',
                  summary: 'Water tomatoes',
                  start: { dateTime: '2026-05-20T09:00:00Z' },
                  end: { dateTime: '2026-05-20T09:15:00Z' },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        // calendar create
        return new Response(JSON.stringify({ id: 'cal-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const env = buildEnv()
    const app = buildApp(stub)

    // 1. Start the flow. Expect a redirect to Google and an agos cookie.
    const startRes = await app.request('/api/auth/google/start', { redirect: 'manual' }, env)
    expect(startRes.status).toBe(302)
    const location = startRes.headers.get('location') ?? ''
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/)
    const stateCookie = extractCookie(startRes.headers.get('set-cookie'), 'agos')
    expect(stateCookie).toBeTruthy()
    const stateParam = new URL(location).searchParams.get('state')
    expect(stateParam).toBe(stateCookie)

    // 2. Replay the state on the callback. Should set the session cookie.
    const cbRes = await app.request(
      `/api/auth/google/callback?code=fake-code&state=${stateParam}`,
      { headers: { cookie: `agos=${stateCookie}` }, redirect: 'manual' },
      env,
    )
    expect(cbRes.status).toBe(302)
    const sessionCookie = extractCookie(cbRes.headers.get('set-cookie'), 'agss')
    expect(sessionCookie).toBeTruthy()

    // 3. /me reports authenticated and returns the calendar id.
    const meRes = await app.request(
      '/api/auth/me',
      { headers: { cookie: `agss=${sessionCookie}` } },
      env,
    )
    expect(await meRes.json()).toEqual({ authenticated: true, calendarId: 'cal-1' })

    // 4. /events returns the stubbed events list.
    const evRes = await app.request(
      '/api/calendar/events',
      { headers: { cookie: `agss=${sessionCookie}` } },
      env,
    )
    expect(evRes.status).toBe(200)
    const payload = (await evRes.json()) as { events: { id: string; summary: string }[] }
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0]).toMatchObject({ id: 'evt-1', summary: 'Water tomatoes' })
  })

  it('callback with mismatched state is rejected', async () => {
    const stub = fakeFetch({}) // no Google calls expected
    const env = buildEnv()
    const app = buildApp(stub)

    const res = await app.request(
      '/api/auth/google/callback?code=x&state=tampered',
      { headers: { cookie: 'agos=different-value' } },
      env,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'state_mismatch' })
  })

  it('returns 502 when Google /token returns 5xx', async () => {
    const stub = fakeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response('upstream exploded', { status: 503 }),
    })
    const env = buildEnv()
    const app = buildApp(stub)

    const startRes = await app.request('/api/auth/google/start', { redirect: 'manual' }, env)
    const state = new URL(startRes.headers.get('location') ?? '').searchParams.get('state')!
    const stateCookie = extractCookie(startRes.headers.get('set-cookie'), 'agos')!

    const res = await app.request(
      `/api/auth/google/callback?code=fake&state=${state}`,
      { headers: { cookie: `agos=${stateCookie}` } },
      env,
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'token_exchange_failed' })
  })

  it('/events returns 401 reauth_required when refresh token is dead', async () => {
    // Seed a user record directly (skip the OAuth dance for brevity)
    // and have Google's /token return 400 invalid_grant on refresh.
    const env = buildEnv()
    const stub = fakeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    })
    const app = buildApp(stub)

    // Mint a session by going through start + a happy-path callback
    // with a one-off stub that succeeds, then swap in the failing stub
    // for the refresh.
    const happy = fakeFetch({
      'https://oauth2.googleapis.com/token': () =>
        new Response(
          JSON.stringify({
            access_token: 'a',
            refresh_token: 'doomed-refresh',
            expires_in: 3600,
            id_token: fakeIdToken('u-1'),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      'https://www.googleapis.com/calendar/v3/calendars': () =>
        new Response(JSON.stringify({ id: 'cal-x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    })
    const setupApp = buildApp(happy)
    const startRes = await setupApp.request(
      '/api/auth/google/start',
      { redirect: 'manual' },
      env,
    )
    const state = new URL(startRes.headers.get('location') ?? '').searchParams.get('state')!
    const stateCookie = extractCookie(startRes.headers.get('set-cookie'), 'agos')!
    const cbRes = await setupApp.request(
      `/api/auth/google/callback?code=fake&state=${state}`,
      { headers: { cookie: `agos=${stateCookie}` }, redirect: 'manual' },
      env,
    )
    const sessionCookie = extractCookie(cbRes.headers.get('set-cookie'), 'agss')!

    // Now hit /events with the failing-refresh stub.
    const res = await app.request(
      '/api/calendar/events',
      { headers: { cookie: `agss=${sessionCookie}` } },
      env,
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'reauth_required' })
  })
})
