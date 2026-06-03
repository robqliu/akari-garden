import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import { requireAuth } from '../lib/auth.js'
import { refreshAccessToken } from '../lib/google.js'

const GOOGLE_TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1/lists'

export type TaskStatus = 'needsAction' | 'completed'

export type TaskItem = {
  id: string
  title: string
  status: TaskStatus
  due: string // YYYY-MM-DD
}

type GoogleTask = {
  id: string
  title: string
  status: TaskStatus
  due?: string
}

async function handleGoogleError(res: Response, operation: string): Promise<Response> {
  const text = await res.text()
  if (res.status >= 400 && res.status < 500) {
    console.error(`Google Tasks ${operation}: unexpected ${res.status}:`, text)
    return Response.json({ error: 'internal_error' }, { status: 500 })
  }
  console.error(`Google Tasks ${operation}: unavailable (${res.status}):`, text)
  return Response.json({ error: 'google_unavailable' }, { status: 502 })
}

export function buildTasksRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use(requireAuth())

  router.get('/', async (c) => {
    const { user } = c.get('auth')
    if (!user.taskListId) return c.json({ tasks: [] })

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return c.json({ error: 'reauth_required' }, 401)

    const params = new URLSearchParams({ showHidden: 'true', maxResults: '100' })
    const dueMin = c.req.query('dueMin')
    const dueMax = c.req.query('dueMax')
    const showCompleted = c.req.query('showCompleted')
    if (dueMin) params.set('dueMin', dueMin)
    if (dueMax) params.set('dueMax', dueMax)
    if (showCompleted) params.set('showCompleted', showCompleted)

    const res = await fetchImpl(`${GOOGLE_TASKS_BASE}/${user.taskListId}/tasks?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 404) {
      console.error(`Google Tasks: task list ${user.taskListId} not found (deleted externally?)`)
      return c.json({ error: 'task_list_not_found' }, 404)
    }
    if (!res.ok) return handleGoogleError(res, 'list')

    const data = (await res.json()) as { items?: GoogleTask[] }
    const tasks: TaskItem[] = (data.items ?? [])
      .filter((t): t is GoogleTask & { due: string } => t.due != null)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.due.slice(0, 10) }))

    return c.json({ tasks })
  })

  router.patch('/:taskId', async (c) => {
    const { user } = c.get('auth')
    if (!user.taskListId) return c.json({ error: 'no_task_list' }, 400)

    const taskId = c.req.param('taskId')
    const body = await c.req.json<{ status?: unknown }>()

    if (body.status !== 'needsAction' && body.status !== 'completed') {
      return c.json({ error: 'invalid_status' }, 400)
    }
    const status = body.status as TaskStatus

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return c.json({ error: 'reauth_required' }, 401)

    const res = await fetchImpl(`${GOOGLE_TASKS_BASE}/${user.taskListId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) return handleGoogleError(res, 'patch')

    const task = (await res.json()) as GoogleTask
    return c.json({
      task: { id: task.id, title: task.title, status: task.status, due: task.due?.slice(0, 10) ?? '' },
    })
  })

  return router
}
