import { describe, it, expect, beforeEach } from 'vitest'
import { app } from './app.js'

describe('Health check', () => {
  it('GET /health returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('Notes API', () => {
  beforeEach(async () => {
    const res = await app.request('/api/notes')
    const notes = await res.json()
    for (const note of notes) {
      await app.request(`/api/notes/${note.id}`, { method: 'DELETE' })
    }
  })

  it('GET /api/notes returns empty array initially', async () => {
    const res = await app.request('/api/notes')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /api/notes creates a note', async () => {
    const res = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Watered the tomatoes', category: 'watering' }),
    })
    expect(res.status).toBe(201)
    const note = await res.json()
    expect(note.text).toBe('Watered the tomatoes')
    expect(note.category).toBe('watering')
    expect(note.id).toBeDefined()
    expect(note.createdAt).toBeDefined()
  })

  it('GET /api/notes/:id returns a specific note', async () => {
    const createRes = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Planted basil' }),
    })
    const created = await createRes.json()

    const res = await app.request(`/api/notes/${created.id}`)
    expect(res.status).toBe(200)
    expect((await res.json()).text).toBe('Planted basil')
  })

  it('GET /api/notes/:id returns 404 for missing note', async () => {
    const res = await app.request('/api/notes/nonexistent')
    expect(res.status).toBe(404)
  })

  it('DELETE /api/notes/:id removes a note', async () => {
    const createRes = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Temp note' }),
    })
    const created = await createRes.json()

    const deleteRes = await app.request(`/api/notes/${created.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const getRes = await app.request(`/api/notes/${created.id}`)
    expect(getRes.status).toBe(404)
  })

  it('POST /api/notes validates input', async () => {
    const res = await app.request('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    })
    expect(res.status).toBe(400)
  })
})
