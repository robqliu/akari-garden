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

describe('GET /api/calendar/registered', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const res = await fixture.request('/api/calendar/registered')
    expect(res.status).toBe(401)
  })

  it('returns null when no calendar is linked', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const res = await fixture.request(
      '/api/calendar/registered',
      { headers: { cookie: `${SESSION_COOKIE}=${session}` } },
    )
    expect(await res.json()).toEqual({ calendar: null })
  })

  it('reflects a calendar after it is created', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }

    await fixture.request('/api/calendar/create', { method: 'POST', headers, body: '{}' })

    const res = await fixture.request('/api/calendar/registered', { headers })
    expect(await res.json()).toEqual({ calendar: { id: 'new-cal-id' } })
  })
})

describe('POST /api/calendar/create', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const res = await fixture.request(
      '/api/calendar/create',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    )
    expect(res.status).toBe(401)
  })

  it('creates a calendar and returns its id', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const res = await fixture.request(
      '/api/calendar/create',
      {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'My Garden' }),
      },
    )
    expect(await res.json()).toEqual({ calendar: { id: 'new-cal-id' } })
  })

  it('persists the calendar id so /registered reflects it', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi())
    const session = await fixture.signIn()
    const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }

    await fixture.request('/api/calendar/create', { method: 'POST', headers, body: '{}' })

    const res = await fixture.request('/api/calendar/registered', { headers })
    expect(await res.json()).toEqual({ calendar: { id: 'new-cal-id' } })
  })

  it('returns 502 when Google is unavailable', async () => {
    const fixture = new LocalAppFixture(mockCalendarApi({
      'https://www.googleapis.com/calendar/v3/calendars': () =>
        new Response('error', { status: 503 }),
    }))
    const session = await fixture.signIn()
    const res = await fixture.request(
      '/api/calendar/create',
      {
        method: 'POST',
        headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
        body: '{}',
      },
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'google_unavailable' })
  })
})
