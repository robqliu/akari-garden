import { expect } from 'vitest'
import type { KVNamespace } from '@cloudflare/workers-types'

import { buildApp } from './app.js'
import type { Bindings } from './lib/env.js'
import { mockGoogleApi } from './routes/mock-google-api.js'

export const CSRF_COOKIE = 'ag_csrf_guard'
export const SESSION_COOKIE = 'ag_session'

export function extractCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null
  const match = setCookie.match(new RegExp(`(?:^|, )${name}=([^;]+)`))
  return match ? match[1] : null
}

class MemoryKV {
  private store = new Map<string, string>()

  get = (async (key: string) => this.store.get(key) ?? null) as KVNamespace['get']
  put = (async (key: string, value: string) => { this.store.set(key, value) }) as KVNamespace['put']
  delete = (async (key: string) => { this.store.delete(key) }) as KVNamespace['delete']
  list = (() => { throw new Error('MemoryKV: list not implemented') }) as unknown as KVNamespace['list']
  getWithMetadata = (() => { throw new Error('MemoryKV: getWithMetadata not implemented') }) as unknown as KVNamespace['getWithMetadata']
}

export class LocalAppFixture {
  readonly env: Bindings
  readonly app: ReturnType<typeof buildApp>

  constructor(fetchMock: typeof fetch = mockGoogleApi()) {
    this.env = {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      SESSION_SIGNING_KEY: 'test-signing-key',
      PUBLIC_API_URL: 'http://localhost:3000',
      PUBLIC_WEB_URL: 'http://localhost:5173',
      USERS_KV: new MemoryKV() as unknown as KVNamespace,
    }
    this.app = buildApp(fetchMock)
  }

  request(path: string, init?: RequestInit) {
    return this.app.request(path, init, this.env)
  }

  async signIn(): Promise<string> {
    const startRes = await this.request('/api/auth/google/start', { redirect: 'manual' })
    expect(startRes.headers.get('location')).toBeTruthy()
    const csrfGuard = new URL(startRes.headers.get('location')!).searchParams.get('state')!
    const csrfCookie = extractCookie(startRes.headers.get('set-cookie'), CSRF_COOKIE)!

    const cbRes = await this.request(
      `/api/auth/google/callback?code=test-code&state=${csrfGuard}`,
      { headers: { cookie: `${CSRF_COOKIE}=${csrfCookie}` }, redirect: 'manual' },
    )
    expect(cbRes.status).toBe(302)
    const sessionCookie = extractCookie(cbRes.headers.get('set-cookie'), SESSION_COOKIE)
    expect(sessionCookie).toBeTruthy()
    return sessionCookie!
  }
}
