import { describe, expect, it } from 'vitest'

import { LocalAppFixture, SESSION_COOKIE } from '../local/app-fixture.js'
import { mockGoogleApi } from './mock-google-api.js'

const TASK_LIST_ID = 'test-list-id'

const MOCK_TASKS = [
  { id: 'task-1', title: 'Water tomatoes', status: 'needsAction', due: '2026-05-31T00:00:00.000Z' },
  { id: 'task-2', title: 'Check for pests', status: 'completed', due: '2026-05-31T00:00:00.000Z' },
  { id: 'task-3', title: 'No date task', status: 'needsAction' },
]

function mockSetupApis(overrides: Partial<Record<string, () => Response>> = {}): typeof fetch {
  return mockGoogleApi({
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists': () =>
      Response.json({ id: TASK_LIST_ID }),
    [`https://tasks.googleapis.com/tasks/v1/lists/${TASK_LIST_ID}/tasks/task-1`]: () =>
      Response.json({ id: 'task-1', title: 'Water tomatoes', status: 'completed', due: '2026-05-31T00:00:00.000Z' }),
    [`https://tasks.googleapis.com/tasks/v1/lists/${TASK_LIST_ID}/tasks`]: () =>
      Response.json({ items: MOCK_TASKS }),
    ...overrides,
  })
}

async function signInAndSetup(fixture: LocalAppFixture): Promise<string> {
  const session = await fixture.signIn()
  const headers = { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }
  await fixture.request('/api/task-list', { method: 'POST', headers, body: '{}' })
  return session
}

describe('GET /api/tasks', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const res = await fixture.request('/api/tasks')
    expect(res.status).toBe(401)
  })

  it('returns empty list when task list is not set up', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/tasks', {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    })
    expect(await res.json()).toEqual({ tasks: [] })
  })

  it('returns tasks with due dates, filtering out tasks without due dates', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const session = await signInAndSetup(fixture)
    const res = await fixture.request('/api/tasks?dueMin=2026-05-31T00:00:00.000Z', {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { tasks: unknown[] }
    expect(body.tasks).toEqual([
      { id: 'task-1', title: 'Water tomatoes', status: 'needsAction', due: '2026-05-31' },
      { id: 'task-2', title: 'Check for pests', status: 'completed', due: '2026-05-31' },
    ])
  })

  it('returns 502 when Google Tasks is unavailable', async () => {
    const fixture = new LocalAppFixture(mockSetupApis({
      [`https://tasks.googleapis.com/tasks/v1/lists/${TASK_LIST_ID}/tasks`]: () =>
        new Response('error', { status: 503 }),
    }))
    const session = await signInAndSetup(fixture)
    const res = await fixture.request('/api/tasks', {
      headers: { cookie: `${SESSION_COOKIE}=${session}` },
    })
    expect(res.status).toBe(502)
  })
})

describe('PATCH /api/tasks/:taskId', () => {
  it('returns 401 without a session', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const res = await fixture.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const session = await signInAndSetup(fixture)
    const res = await fixture.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'invalid' }),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_status' })
  })

  it('updates task status and returns updated task', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const session = await signInAndSetup(fixture)
    const res = await fixture.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      task: { id: 'task-1', title: 'Water tomatoes', status: 'completed', due: '2026-05-31' },
    })
  })

  it('returns 502 when Google Tasks is unavailable', async () => {
    const fixture = new LocalAppFixture(mockSetupApis({
      [`https://tasks.googleapis.com/tasks/v1/lists/${TASK_LIST_ID}/tasks/task-1`]: () =>
        new Response('error', { status: 503 }),
    }))
    const session = await signInAndSetup(fixture)
    const res = await fixture.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(res.status).toBe(502)
  })
})
