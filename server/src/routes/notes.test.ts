import { describe, it, expect, beforeEach } from 'vitest'
import { LocalAppFixture } from '../local-app-fixture.js'

describe('GET /api/notes', () => {
  let fixture: LocalAppFixture
  let session: string

  beforeEach(async () => {
    fixture = new LocalAppFixture()
    session = await fixture.signIn()
  })

  it('returns 401 without a session', async () => {
    const res = await fixture.request('/api/notes')
    expect(res.status).toBe(401)
  })

  it('returns empty list when no notes exist', async () => {
    const res = await fixture.request('/api/notes', { headers: { cookie: `ag_session=${session}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as { notes: unknown[]; nextCursor: null }
    expect(body.notes).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('returns created notes newest-first', async () => {
    await createNote(fixture, session, 'first note', [1])
    await createNote(fixture, session, 'second note', [2])

    const res = await fixture.request('/api/notes', { headers: { cookie: `ag_session=${session}` } })
    const body = await res.json() as { notes: Array<{ text: string }> }
    expect(body.notes.map((n) => n.text)).toEqual(['second note', 'first note'])
  })

  it('filters by crop', async () => {
    await createNote(fixture, session, 'carrot note', [1])
    await createNote(fixture, session, 'tomato note', [4])
    await createNote(fixture, session, 'mixed note', [1, 4])

    const res = await fixture.request('/api/notes?crop=1', { headers: { cookie: `ag_session=${session}` } })
    const body = await res.json() as { notes: Array<{ text: string }> }
    expect(body.notes.map((n) => n.text)).toEqual(['mixed note', 'carrot note'])
  })

  it('returns all crops for a note, not just the filtered crop', async () => {
    await createNote(fixture, session, 'multi-crop note', [1, 2, 4])

    const res = await fixture.request('/api/notes?crop=1', { headers: { cookie: `ag_session=${session}` } })
    const body = await res.json() as { notes: Array<{ crops: number[] }> }
    expect(body.notes[0].crops.sort()).toEqual([1, 2, 4])
  })

  it('returns 400 for an invalid crop param', async () => {
    const res = await fixture.request('/api/notes?crop=abc', { headers: { cookie: `ag_session=${session}` } })
    expect(res.status).toBe(400)
  })

  it('paginates results', async () => {
    // Create 21 notes so we get one full page + one overflow
    for (let i = 0; i < 21; i++) {
      await createNote(fixture, session, `note ${i}`, [1])
    }

    const page1Res = await fixture.request('/api/notes', { headers: { cookie: `ag_session=${session}` } })
    const page1 = await page1Res.json() as { notes: unknown[]; nextCursor: string }
    expect(page1.notes).toHaveLength(20)
    expect(page1.nextCursor).not.toBeNull()

    const page2Res = await fixture.request(
      `/api/notes?cursor=${page1.nextCursor}`,
      { headers: { cookie: `ag_session=${session}` } },
    )
    const page2 = await page2Res.json() as { notes: unknown[]; nextCursor: null }
    expect(page2.notes).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()
  })
})

describe('POST /api/notes', () => {
  let fixture: LocalAppFixture
  let session: string

  beforeEach(async () => {
    fixture = new LocalAppFixture()
    session = await fixture.signIn()
  })

  it('returns 401 without a session', async () => {
    const res = await fixture.request('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello', crops: [1] }),
    })
    expect(res.status).toBe(401)
  })

  it('creates a note and returns it', async () => {
    const res = await createNote(fixture, session, 'watered the carrots', [1, 2])
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; text: string; crops: number[]; createdAt: string }
    expect(body.text).toBe('watered the carrots')
    expect(body.crops.sort()).toEqual([1, 2])
    expect(body.id).toBeTruthy()
    expect(body.createdAt).toBeTruthy()
  })

  it('rejects empty text', async () => {
    const res = await createNote(fixture, session, '   ', [1])
    expect(res.status).toBe(400)
  })

  it('rejects empty crops array', async () => {
    const res = await createNote(fixture, session, 'some text', [])
    expect(res.status).toBe(400)
  })

  it('rejects unknown crop ids', async () => {
    const res = await createNote(fixture, session, 'some text', [999])
    expect(res.status).toBe(400)
  })

  it('created note appears in GET /api/notes', async () => {
    await createNote(fixture, session, 'test note', [3])
    const res = await fixture.request('/api/notes', { headers: { cookie: `ag_session=${session}` } })
    const body = await res.json() as { notes: Array<{ text: string }> }
    expect(body.notes[0].text).toBe('test note')
  })
})

function createNote(fixture: LocalAppFixture, session: string, text: string, crops: number[]) {
  return fixture.request('/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `ag_session=${session}` },
    body: JSON.stringify({ text, crops }),
  })
}
