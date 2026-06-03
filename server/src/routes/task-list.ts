import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import { putUser } from '../lib/db.js'
import { requireAuth } from '../lib/auth.js'
import { AppErrors, GoogleErrors, errorResponse } from '../lib/errors.js'
import { refreshAccessToken } from '../lib/google.js'

const GOOGLE_TASK_LISTS_URL = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists'

export function buildTaskListRouter(fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use(requireAuth())

  router.get('/', async (c) => {
    const { user } = c.get('auth')
    return c.json({ id: user.taskListId ?? null })
  })

  router.post('/', async (c) => {
    const { user, userId } = c.get('auth')
    const body = await c.req.json<{ name?: string }>()
    const name = body.name?.trim() || 'Akari Garden'

    const accessToken = await refreshAccessToken(user.refreshToken, c.env, fetchImpl)
    if (!accessToken) return errorResponse(c, AppErrors.REAUTH_REQUIRED, { userId })

    const taskList = await createGoogleTaskList(accessToken, name, fetchImpl)
    if (!taskList) return errorResponse(c, GoogleErrors.TASK_LIST_CREATE_FAILED, { userId })

    user.taskListId = taskList.id
    await putUser(c.env, userId, user)

    return c.json({ id: taskList.id })
  })

  return router
}

async function createGoogleTaskList(
  accessToken: string,
  name: string,
  fetchImpl: typeof fetch,
): Promise<{ id: string } | null> {
  const res = await fetchImpl(GOOGLE_TASK_LISTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: name }),
  })
  if (!res.ok) {
    console.error(`Google task list create failed: ${res.status}`, await res.text())
    return null
  }
  return { id: ((await res.json()) as { id: string }).id }
}
