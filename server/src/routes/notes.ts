import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const createNoteSchema = z.object({
  text: z.string().min(1),
  category: z.enum(['watering', 'planting', 'measurement', 'observation', 'other']).default('other'),
})

export interface Note {
  id: string
  text: string
  category: string
  createdAt: string
}

const store = new Map<string, Note>()

const notes = new Hono()

notes.get('/', (c) => {
  return c.json(Array.from(store.values()))
})

notes.get('/:id', (c) => {
  const note = store.get(c.req.param('id'))
  if (!note) return c.json({ error: 'Not found' }, 404)
  return c.json(note)
})

notes.post('/', zValidator('json', createNoteSchema), (c) => {
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const note: Note = {
    id,
    text: body.text,
    category: body.category,
    createdAt: new Date().toISOString(),
  }
  store.set(id, note)
  return c.json(note, 201)
})

notes.delete('/:id', (c) => {
  const id = c.req.param('id')
  if (!store.has(id)) return c.json({ error: 'Not found' }, 404)
  store.delete(id)
  return c.json({ success: true })
})

export { notes }
