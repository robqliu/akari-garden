import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AppEnv } from './env.js'

type AppError = { status: ContentfulStatusCode; clientError: string; logMessage: string }

export const GoogleErrors = {
  CALENDAR_CREATE_FAILED: { status: 502, clientError: 'google_unavailable',     logMessage: 'Google calendar create failed' },
  ID_TOKEN_INVALID:       { status: 502, clientError: 'invalid_id_token',        logMessage: 'OAuth ID token missing sub claim' },
  TASK_LIST_CREATE_FAILED:{ status: 502, clientError: 'google_unavailable',     logMessage: 'Google task list create failed' },
  TOKEN_EXCHANGE_FAILED:  { status: 502, clientError: 'token_exchange_failed',   logMessage: 'OAuth token exchange failed' },
} as const satisfies Record<string, AppError>

export const AppErrors = {
  MISSING_CODE:        { status: 400, clientError: 'missing_code',           logMessage: 'OAuth callback missing code param' },
  NO_TASK_LIST:        { status: 500, clientError: 'no_task_list',           logMessage: 'task list not configured' },
  REAUTH_REQUIRED:     { status: 401, clientError: 'reauth_required',        logMessage: 'token refresh failed' },
  TASK_LIST_NOT_FOUND: { status: 404, clientError: 'task_list_not_found',    logMessage: 'task list not found (deleted externally?)' },
} as const satisfies Record<string, AppError>

export function errorResponse(
  c: Context<AppEnv>,
  error: AppError,
  logContext?: Record<string, unknown>,
): Response {
  console.error(error.logMessage, ...(logContext !== undefined ? [logContext] : []))
  return c.json({ error: error.clientError }, error.status)
}
