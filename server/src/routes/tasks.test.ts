import { describe, expect, it } from 'vitest'

import { LocalAppFixture, SESSION_COOKIE } from '../local/app-fixture.js'
import { mockGoogleApi } from './mock-google-api.js'

const TASK_LIST_ID = 'test-list-id'
const GOOGLE_TASKS_URL = `https://tasks.googleapis.com/tasks/v1/lists/${TASK_LIST_ID}/tasks`
const GOOGLE_TASK_1_URL = `${GOOGLE_TASKS_URL}/task-1`
const GOOGLE_TASK_LIST_URL = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists'

const TASK_DUE = '2026-05-31'

const MOCK_TASKS = [
  { id: 'task-1', title: 'Water tomatoes', status: 'needsAction', due: `${TASK_DUE}T00:00:00.000Z` },
  { id: 'task-2', title: 'Check for pests', status: 'completed', due: `${TASK_DUE}T00:00:00.000Z` },
  { id: 'task-3', title: 'No date task', status: 'needsAction' },
]

type Override = Response | ((_url: string, init?: RequestInit) => Response)

function mockSetupApis(overrides: Record<string, Override> = {}): typeof fetch {
  const normalize = (v: Override) => typeof v === 'function' ? v : () => v
  return mockGoogleApi({
    [GOOGLE_TASK_LIST_URL]: () => Response.json({ id: TASK_LIST_ID }),
    [GOOGLE_TASK_1_URL]: () =>
      Response.json({ id: 'task-1', title: 'Water tomatoes', status: 'completed', due: `${TASK_DUE}T00:00:00.000Z` }),
    [GOOGLE_TASKS_URL]: (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Response.json(
          { id: 'task-new', title: 'Plant seeds', status: 'needsAction', due: '2026-06-01T00:00:00.000Z' },
          { status: 201 },
        )
      }
      return Response.json({ items: MOCK_TASKS })
    },
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, normalize(v)])),
  })
}

function authHeaders(session: string) {
  return { cookie: `${SESSION_COOKIE}=${session}`, 'content-type': 'application/json' }
}

async function setupFixture(overrides: Record<string, Override> = {}) {
  const fixture = new LocalAppFixture(mockSetupApis(overrides))
  const session = await fixture.signIn()
  await fixture.request('/api/task-list', { method: 'POST', headers: authHeaders(session), body: '{}' })
  return {
    fixture,
    session,
    getTasks: (query = '') =>
      fixture.request(`/api/tasks${query}`, { headers: { cookie: `${SESSION_COOKIE}=${session}` } }),
    postTask: (body: object) =>
      fixture.request('/api/tasks', { method: 'POST', headers: authHeaders(session), body: JSON.stringify(body) }),
    patchTask: (taskId: string, body: object) =>
      fixture.request(`/api/tasks/${taskId}`, { method: 'PATCH', headers: authHeaders(session), body: JSON.stringify(body) }),
  }
}

describe('GET /api/tasks', () => {
  it('returns 401 without a session', async () => {
    const { fixture } = await setupFixture()
    expect((await fixture.request('/api/tasks')).status).toBe(401)
  })

  it('returns empty list when task list is not set up', async () => {
    const fixture = new LocalAppFixture(mockSetupApis())
    const session = await fixture.signIn()
    const res = await fixture.request('/api/tasks', { headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(await res.json()).toEqual({ tasks: [] })
  })

  it('returns tasks with due dates, filtering out tasks without due dates', async () => {
    const { getTasks } = await setupFixture()
    const res = await getTasks('?dueMin=2026-05-31')
    expect(res.status).toBe(200)
    expect((await res.json() as { tasks: unknown[] }).tasks).toEqual([
      { id: 'task-1', title: 'Water tomatoes', status: 'needsAction', due: TASK_DUE },
      { id: 'task-2', title: 'Check for pests', status: 'completed', due: TASK_DUE },
    ])
  })

  it('returns 500 when Google returns a bad request error', async () => {
    const { getTasks } = await setupFixture({ [GOOGLE_TASKS_URL]: new Response('invalid argument', { status: 400 }) })
    expect((await getTasks()).status).toBe(500)
  })

  it('returns 502 when Google Tasks is unavailable', async () => {
    const { getTasks } = await setupFixture({ [GOOGLE_TASKS_URL]: new Response('error', { status: 503 }) })
    expect((await getTasks()).status).toBe(502)
  })
})

describe('POST /api/tasks', () => {
  it('returns 401 without a session', async () => {
    const { fixture } = await setupFixture()
    const res = await fixture.request('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Plant seeds' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when title is missing', async () => {
    const { postTask } = await setupFixture()
    expect((await postTask({ due: '2026-06-01' })).status).toBe(400)
  })

  it('creates task and returns 201', async () => {
    const { postTask } = await setupFixture()
    const res = await postTask({ title: 'Plant seeds', due: '2026-06-01' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      task: { id: 'task-new', title: 'Plant seeds', status: 'needsAction', due: '2026-06-01' },
    })
  })
})

describe('PATCH /api/tasks/:taskId', () => {
  it('returns 401 without a session', async () => {
    const { fixture } = await setupFixture()
    const res = await fixture.request('/api/tasks/task-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status', async () => {
    const { patchTask } = await setupFixture()
    expect((await patchTask('task-1', { status: 'invalid' })).status).toBe(400)
  })

  it('updates task status and returns updated task', async () => {
    const { patchTask } = await setupFixture()
    const res = await patchTask('task-1', { status: 'completed' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      task: { id: 'task-1', title: 'Water tomatoes', status: 'completed', due: TASK_DUE },
    })
  })

  it('returns 502 when Google Tasks is unavailable', async () => {
    const { patchTask } = await setupFixture({ [GOOGLE_TASK_1_URL]: new Response('error', { status: 503 }) })
    expect((await patchTask('task-1', { status: 'completed' })).status).toBe(502)
  })
})
