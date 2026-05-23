import { describe, it, expect } from 'vitest'
import { buildApp } from './app.js'
import type { Bindings } from './lib/env.js'

const TEST_ENV: Partial<Bindings> = {
  PUBLIC_WEB_URL: 'http://localhost:5173',
}

describe('Health check', () => {
  it('GET /health returns ok', async () => {
    const app = buildApp()
    const res = await app.request('/health', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})
