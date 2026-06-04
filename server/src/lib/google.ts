import type { Context } from 'hono'

import type { AppEnv, Bindings } from './env.js'
import { AppErrors, GoogleErrors, errorResponse } from './errors.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function handleGoogleError(res: Response, operation: string, c: Context<AppEnv>): Promise<Response> {
  const googleBody = await res.text()
  if (res.status >= 400 && res.status < 500) {
    return errorResponse(c, AppErrors.INTERNAL_ERROR, { operation, googleStatus: res.status, googleBody })
  }
  return errorResponse(c, GoogleErrors.API_UNAVAILABLE, { operation, googleStatus: res.status, googleBody })
}

export async function refreshAccessToken(
  refreshToken: string,
  env: Bindings,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error(`Google /token refresh failed: ${res.status}`, await res.text())
    return null
  }
  return ((await res.json()) as { access_token: string }).access_token
}
