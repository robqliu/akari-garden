import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import { requireAuth } from '../lib/auth.js'
import { refreshAccessToken, handleGoogleError } from '../lib/google.js'

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

function toTaskItem(t: GoogleTask): TaskItem {
  return { id: t.id, title: t.title, status: t.status, due: t.due?.slice(0, 10) ?? '' }
}

export function buildTasksRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const googleFetch = (url: string, accessToken: string, method = 'GET', body?: object) =>
    fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
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
    if (dueMin) params.set('dueMin', `${dueMin}T00:00:00.000Z`)
    if (dueMax) params.set('dueMax', `${dueMax}T00:00:00.000Z`)
    if (showCompleted) params.set('showCompleted', showCompleted)

    const res = await googleFetch(`${GOOGLE_TASKS_BASE}/${user.taskListId}/tasks?${params}`, accessToken)
    if (res.status === 404) {
      console.error(`Google Tasks: task list ${user.taskListId} not found (deleted externally?)`)
      return c.json({ error: 'task_list_not_found' }, 404)
    }
    if (!res.ok) return handleGoogleError(res, 'Tasks list')

    const data = (await res.json()) as { items?: GoogleTask[] }
    const rawItems = data.items ?? []
    const tasks = rawItems.filter((t): t is GoogleTask & { due: string } => t.due != null).map(toTaskItem)
    if (tasks.length === 0 && rawItems.length > 0) {
      console.warn(`Google Tasks list: ${rawItems.length} item(s) returned but none have due dates`)
    }

    return c.json({ tasks })
  })

  // Not yet wired to the frontend UI — currently used by the dev seed script.
  router.post('/', async (c) => {
    const { user } = c.get('auth')
    if (!user.taskListId) return c.json({ error: 'no_task_list' }, 500)

    const body = await c.req.json<{ title?: unknown; due?: unknown }>()
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: 'invalid_title' }, 400)
    }
    const title = body.title.trim()
    if (body.due !== undefined && (typeof body.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due))) {
      return c.json({ error: 'invalid_due' }, 400)
    }
    const due = typeof body.due === 'string' ? body.due : undefined

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return c.json({ error: 'reauth_required' }, 401)

    const googleTask: Record<string, string> = { title }
    if (due) googleTask.due = `${due}T00:00:00.000Z`

    const res = await googleFetch(`${GOOGLE_TASKS_BASE}/${user.taskListId}/tasks`, accessToken, 'POST', googleTask)
    if (!res.ok) return handleGoogleError(res, 'Tasks create')

    return c.json({ task: toTaskItem((await res.json()) as GoogleTask) }, 201)
  })

  router.patch('/:taskId', async (c) => {
    const { user } = c.get('auth')
    if (!user.taskListId) return c.json({ error: 'no_task_list' }, 500)

    const taskId = c.req.param('taskId')
    const body = await c.req.json<{ status?: unknown }>()
    if (body.status !== 'needsAction' && body.status !== 'completed') {
      return c.json({ error: 'invalid_status' }, 400)
    }

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return c.json({ error: 'reauth_required' }, 401)

    const res = await googleFetch(
      `${GOOGLE_TASKS_BASE}/${user.taskListId}/tasks/${taskId}`,
      accessToken, 'PATCH', { status: body.status },
    )
    if (!res.ok) return handleGoogleError(res, 'Tasks patch')

    return c.json({ task: toTaskItem((await res.json()) as GoogleTask) })
  })

  return router
}
