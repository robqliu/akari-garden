import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import type { AppEnv } from '../lib/env.js'
import { requireAuth } from '../lib/auth.js'
import { AppErrors, errorResponse } from '../lib/errors.js'
import { refreshAccessToken, handleGoogleError } from '../lib/google.js'

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

const GOOGLE_TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1/lists'

export function buildTasksRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const googleFetch = (taskListId: string, path: string, method: string, body: object | undefined, accessToken: string) =>
    fetchImpl(`${GOOGLE_TASKS_BASE}/${taskListId}/${path}`, {
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
    const { user, userId } = c.get('auth')
    if (!user.taskListId) return c.json({ tasks: [] })

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId })

    const params = new URLSearchParams({ showHidden: 'true', maxResults: '100' })
    const dueMin = c.req.query('dueMin')
    const dueMax = c.req.query('dueMax')
    const showCompleted = c.req.query('showCompleted')
    if (dueMin) params.set('dueMin', `${dueMin}T00:00:00.000Z`)
    if (dueMax) params.set('dueMax', `${dueMax}T00:00:00.000Z`)
    if (showCompleted) params.set('showCompleted', showCompleted)

    const res = await googleFetch(user.taskListId, `tasks?${params}`, 'GET', undefined, accessToken)
    if (res.status === 404) {
      return errorResponse(c, AppErrors.TASK_LIST_NOT_FOUND, { userId, taskListId: user.taskListId })
    }
    if (!res.ok) return handleGoogleError(res, 'Tasks list')

    const data = (await res.json()) as { items?: GoogleTask[] }
    const rawItems = data.items ?? []
    // Tasks created directly via Google (outside this app) may have no due date.
    // We filter them out here — the FE only handles dated tasks.
    const tasks = rawItems.filter((t): t is GoogleTask & { due: string } => t.due != null).map(toTaskItem)
    if (tasks.length < rawItems.length) {
      console.warn(`Google Tasks list: ${rawItems.length - tasks.length} item(s) have no due date and were excluded`)
    }

    return c.json({ tasks })
  })

  router.post(
    '/',
    zValidator('json', z.object({
      title: z.string().min(1),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })),
    async (c) => {
      const { user, userId } = c.get('auth')
      if (!user.taskListId) {
        return errorResponse(c, AppErrors.NO_TASK_LIST, { userId })
      }

      const { title, due } = c.req.valid('json')
      const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
      if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId })

      const res = await googleFetch(user.taskListId, 'tasks', 'POST', { title, due: `${due}T00:00:00.000Z` }, accessToken)
      if (!res.ok) return handleGoogleError(res, 'Tasks create')

      return c.json({ task: toTaskItem((await res.json()) as GoogleTask) }, 201)
    },
  )

  router.patch(
    '/:taskId',
    zValidator('json', z.object({
      title: z.string().min(1).optional(),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['needsAction', 'completed']).optional(),
    }).refine(
      (obj) => obj.title !== undefined || obj.due !== undefined || obj.status !== undefined,
      { message: 'at least one of title, due, or status is required' },
    )),
    async (c) => {
      const { user, userId } = c.get('auth')
      if (!user.taskListId) {
        return errorResponse(c, AppErrors.NO_TASK_LIST, { userId })
      }

      const taskId = c.req.param('taskId')
      const { title, due, status } = c.req.valid('json')
      const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
      if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId, taskId })

      const googlePatch: Record<string, string> = {}
      if (title !== undefined) googlePatch.title = title
      if (due !== undefined) googlePatch.due = `${due}T00:00:00.000Z`
      if (status !== undefined) googlePatch.status = status

      const res = await googleFetch(user.taskListId, `tasks/${taskId}`, 'PATCH', googlePatch, accessToken)
      if (!res.ok) return handleGoogleError(res, 'Tasks patch')

      return c.json({ task: toTaskItem((await res.json()) as GoogleTask) })
    },
  )

  router.delete('/:taskId', async (c) => {
    const { user, userId } = c.get('auth')
    if (!user.taskListId) {
      return errorResponse(c, AppErrors.NO_TASK_LIST, { userId })
    }

    const taskId = c.req.param('taskId')
    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId, taskId })

    const res = await googleFetch(user.taskListId, `tasks/${taskId}`, 'DELETE', undefined, accessToken)
    if (!res.ok) return handleGoogleError(res, 'Tasks delete')

    return c.body(null, 204)
  })

  return router
}
