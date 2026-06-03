import { describe, expect, it } from 'vitest'

import { LocalAppFixture, SESSION_COOKIE } from '../local/app-fixture.js'
import { mockGoogleApi } from './mock-google-api.js'

function mockTaskListApi(overrides: Partial<Record<string, () => Response>> = {}): typeof fetch {
  return mockGoogleApi({
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists': () =>
      Response.json({ id: 'new-list-id' }),
    ...overrides,
  })
}

describe('GET /api/task-list', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi())
    const res = await fixture.request('/api/task-list')
    expect(res.status).toBe(401)
  })

  it('returns null when no task list is linked', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/task-list', {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    })
    expect(await res.json()).toEqual({ id: null })
  })

  it('reflects the task list id after creation', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi())
    const session = await fixture.signIn()
    const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }

    await fixture.request('/api/task-list', { method: 'POST', headers, body: '{}' })

    const res = await fixture.request('/api/task-list', { headers })
    expect(await res.json()).toEqual({ id: 'new-list-id' })
  })
})

describe('POST /api/task-list', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi())
    const res = await fixture.request('/api/task-list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })

  it('creates a task list and returns its id', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/task-list', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'My Garden' }),
    })
    expect(await res.json()).toEqual({ id: 'new-list-id' })
  })

  it('returns 502 when Google is unavailable', async () => {
    const fixture = new LocalAppFixture(mockTaskListApi({
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists': () =>
        new Response('error', { status: 503 }),
    }))
    const session = await fixture.signIn()
    const res = await fixture.request('/api/task-list', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: 'google_unavailable' })
  })
})
