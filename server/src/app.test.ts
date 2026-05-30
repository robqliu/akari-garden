import { describe, it, expect } from 'vitest'
import { buildApp } from './app.js'
import { createMemoryKV } from './lib/kv-adapter.js'
import type { Bindings } from './lib/env.js'

const TEST_ENV: Partial<Bindings> = {
  PUBLIC_WEB_URL: 'http://localhost:5173',
  CONFIG_KV: createMemoryKV(),
}

describe('Health check', () => {
  it('GET /health returns ok', async () => {
    const app = buildApp()
    const res = await app.request('/health', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('Maintenance mode', () => {
  it('returns 503 on all routes when disable_server is set to 1', async () => {
    const configKv = createMemoryKV()
    await configKv.put('disable_server', '1')
    const env: Partial<Bindings> = { PUBLIC_WEB_URL: 'http://localhost:5173', CONFIG_KV: configKv }
    const app = buildApp()

    const health = await app.request('/health', {}, env)
    expect(health.status).toBe(503)

    const notes = await app.request('/api/notes', {}, env)
    expect(notes.status).toBe(503)
  })

  it('serves normally when disable_server is set to 0', async () => {
    const configKv = createMemoryKV()
    await configKv.put('disable_server', '0')
    const env: Partial<Bindings> = { PUBLIC_WEB_URL: 'http://localhost:5173', CONFIG_KV: configKv }
    const app = buildApp()
    const res = await app.request('/health', {}, env)
    expect(res.status).toBe(200)
  })
})
