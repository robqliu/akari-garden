// Minimal Google OAuth + Calendar API client. We only call four
// endpoints; pulling in `googleapis` (the official SDK) for that would
// add ~5MB of code and a stack of transitive deps that don't even run
// on Workers.

export const GOOGLE_OAUTH_SCOPE = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ')

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CALENDARS_URL = 'https://www.googleapis.com/calendar/v3/calendars'
const EVENTS_URL = (calId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`

export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPE,
    // offline + consent are how Google returns a refresh_token. Without
    // both, repeat sign-ins of the same user yield only an access_token.
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
    include_granted_scopes: 'true',
  })
  return `${AUTH_URL}?${params.toString()}`
}

// Shape of the JSON Google returns from /token on a successful code
// exchange. We only consume the fields we need.
export type TokenExchangeResult = {
  access_token: string
  refresh_token: string
  expires_in: number
  id_token: string
}

export type GoogleError = {
  status: number
  body: string
}

// Allow injecting a custom fetch in tests. Default is the global.
type Fetch = typeof fetch

export async function exchangeCodeForTokens(
  opts: {
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
  },
  fetchImpl: Fetch = fetch,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    throw googleError(res.status, await res.text())
  }
  return (await res.json()) as TokenExchangeResult
}

export async function refreshAccessToken(
  opts: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: Fetch = fetch,
): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    throw googleError(res.status, await res.text())
  }
  return (await res.json()) as { access_token: string; expires_in: number }
}

export async function revokeToken(
  refreshToken: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  // Google's /revoke returns 200 on success and 400 if the token is
  // already invalid/expired. Treat both as "fine, the token is gone".
  await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
}

export async function createCalendar(
  opts: { accessToken: string; summary: string },
  fetchImpl: Fetch = fetch,
): Promise<{ id: string }> {
  const res = await fetchImpl(CALENDARS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ summary: opts.summary }),
  })
  if (!res.ok) {
    throw googleError(res.status, await res.text())
  }
  const data = (await res.json()) as { id: string }
  return { id: data.id }
}

export type CalendarEvent = {
  id: string
  summary?: string
  description?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

export async function listEvents(
  opts: { accessToken: string; calendarId: string; timeMin: string; timeMax: string },
  fetchImpl: Fetch = fetch,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetchImpl(`${EVENTS_URL(opts.calendarId)}?${params.toString()}`, {
    headers: { authorization: `Bearer ${opts.accessToken}` },
  })
  if (!res.ok) {
    throw googleError(res.status, await res.text())
  }
  const data = (await res.json()) as { items?: CalendarEvent[] }
  return data.items ?? []
}

// Decodes the ID token payload (the middle segment of the JWT). We do
// NOT verify the JWT signature here because the token came directly
// from Google over TLS in response to our authenticated request — the
// transport is the trust boundary, not the signature. Verification
// would require fetching Google's JWKS, which is overkill for this
// flow but worth adding if we ever accept ID tokens via the client.
export function decodeIdTokenSub(idToken: string): string | null {
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')
    const decoded = JSON.parse(atob(padded)) as { sub?: string }
    return decoded.sub ?? null
  } catch {
    return null
  }
}

function googleError(status: number, body: string): Error & GoogleError {
  const err = new Error(`Google API ${status}`) as Error & GoogleError
  err.status = status
  err.body = body
  return err
}

export function isGoogleError(err: unknown): err is Error & GoogleError {
  return err instanceof Error && typeof (err as { status?: unknown }).status === 'number'
}
