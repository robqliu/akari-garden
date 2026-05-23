type RouteHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

function fakeIdToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ sub }))
  return `${header}.${payload}.`
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function buildFakeFetch(routes: Record<string, RouteHandler>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveUrl(input)
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return handler(url, init)
    }
    throw new Error(`fakeFetch: no route for ${url}`)
  }) as typeof fetch
}

// Stubs Google's OAuth and revocation endpoints with successful
// responses. Use overrides to replace individual endpoints.
export function mockGoogleApi(overrides: Partial<Record<string, RouteHandler>> = {}): typeof fetch {
  return buildFakeFetch({
    'https://oauth2.googleapis.com/token': () =>
      Response.json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: fakeIdToken('google-user-123'),
      }),
    'https://oauth2.googleapis.com/revoke': () => new Response(null, { status: 200 }),
    ...overrides,
  })
}

export function mockGoogleApiTokenFailure(status: number): typeof fetch {
  return mockGoogleApi({
    'https://oauth2.googleapis.com/token': () => new Response('error', { status }),
  })
}
