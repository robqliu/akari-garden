import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { AppEnv } from './env.js'

type AppError = {
  status: ContentfulStatusCode
  clientError: string
  logMessage: string
  logLevel?: 'warn' | 'error'
}

export const GoogleErrors = {
  API_UNAVAILABLE:         { status: 502, clientError: 'google_unavailable',   logMessage: 'Google API unavailable' },
  CALENDAR_CREATE_FAILED:  { status: 502, clientError: 'google_unavailable',   logMessage: 'Google unavailable: calendar create failed' },
  ID_TOKEN_INVALID:        { status: 502, clientError: 'invalid_id_token',      logMessage: 'OAuth ID token missing sub claim' },
  OAUTH_CODE_MISSING:      { status: 400, clientError: 'missing_code',          logMessage: 'OAuth callback missing authorization code' },
  TASK_LIST_CREATE_FAILED: { status: 502, clientError: 'google_unavailable',   logMessage: 'Google unavailable: task list create failed' },
  TASK_LIST_NOT_FOUND:     { status: 404, clientError: 'task_list_not_found',  logMessage: 'Google task list not found (deleted externally?)' },
  TOKEN_EXCHANGE_FAILED:   { status: 502, clientError: 'token_exchange_failed', logMessage: 'OAuth token exchange failed' },
} as const satisfies Record<string, AppError>

export const AppErrors = {
  INTERNAL_ERROR:  { status: 500, clientError: 'internal_error', logMessage: 'Unhandled error' },
  MAINTENANCE:     { status: 503, clientError: 'maintenance',    logMessage: 'Server is in maintenance mode', logLevel: 'warn' as const },
  NO_TASK_LIST:    { status: 500, clientError: 'no_task_list',   logMessage: 'task list not configured' },
  REAUTH_REQUIRED: { status: 401, clientError: 'reauth_required', logMessage: 'token refresh failed' },
} as const satisfies Record<string, AppError>

export function errorResponse(
  c: Context<AppEnv>,
  error: AppError,
  logContext?: Record<string, unknown>,
): Response {
  const args = logContext !== undefined ? [logContext] : []
  if ((error.logLevel ?? 'error') === 'warn') console.warn(error.logMessage, ...args)
  else console.error(error.logMessage, ...args)
  return c.json({ error: error.clientError }, error.status)
}
