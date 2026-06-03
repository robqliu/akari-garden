import type { Bindings } from './env.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function handleGoogleError(res: Response, operation: string): Promise<Response> {
  const text = await res.text()
  if (res.status >= 400 && res.status < 500) {
    console.error(`Google ${operation}: unexpected ${res.status}:`, text)
    return Response.json({ error: 'internal_error' }, { status: 500 })
  }
  console.error(`Google ${operation}: unavailable (${res.status}):`, text)
  return Response.json({ error: 'google_unavailable' }, { status: 502 })
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
