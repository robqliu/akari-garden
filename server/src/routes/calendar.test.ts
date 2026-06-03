import { describe, expect, it } from 'vitest'

import { LocalAppFixture, SESSION_COOKIE } from '../local/app-fixture.js'
import { mockGoogleApi } from './mock-google-api.js'

function mockCalendarApi(overrides: Partial<Record<string, () => Response>> = {}): typeof fetch {
  return mockGoogleApi({
    'https://www.googleapis.com/calendar/v3/calendars': () =>
      Response.json({ id: 'new-cal-id' }),
    ...overrides,
  })
}

describe('GET /api/calendar', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const res = await fixture.request('/api/calendar')
    expect(res.status).toBe(401)
  })

  it('returns null when no calendar is linked', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/calendar', {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    })
    expect(await res.json()).toEqual({ id: null })
  })

  it('reflects the calendar id after creation', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }

    await fixture.request('/api/calendar', { method: 'POST', headers, body: '{}' })

    const res = await fixture.request('/api/calendar', { headers })
    expect(await res.json()).toEqual({ id: 'new-cal-id' })
  })
})

describe('POST /api/calendar', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const res = await fixture.request('/api/calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })

  it('creates a calendar and returns its id', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/calendar', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'My Garden' }),
    })
    expect(await res.json()).toEqual({ id: 'new-cal-id' })
  })

  it('persists the calendar so GET can retrieve it', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }
    await fixture.request('/api/calendar', { method: 'POST', headers, body: '{}' })
    const res = await fixture.request('/api/calendar', { headers })
    expect(await res.json()).toEqual({ id: 'new-cal-id' })
  })

  it('returns 502 when Google is unavailable', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi({
      'https://www.googleapis.com/calendar/v3/calendars': () =>
        new Response('error', { status: 503 }),
    }))
    const session = await fixture.signIn()
    const res = await fixture.request('/api/calendar', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'google_unavailable' })
  })
})
