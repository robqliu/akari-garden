import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'

import type { AppEnv } from '../lib/env.js'
import { requireAuth } from '../lib/auth.js'
import { notesDb, groupCropsByNoteId } from '../lib/notes-db.js'
import type { DbConn, NoteCursor, NoteRow } from '../lib/notes-db.js'

const PAGE_SIZE = 20
const MAX_TEXT_LENGTH = 1000

const createNoteSchema = z.object({
  text: z.string()
    .trim()
    .min(1, 'text is required')
    .max(MAX_TEXT_LENGTH, `text must be ${MAX_TEXT_LENGTH} characters or fewer`),
  crops: z.array(z.number().int().positive()).min(1, 'crops must be a non-empty array'),
})

export type NoteResponse = {
  id: string
  text: string
  crops: number[]
  createdAt: string  // ISO 8601 — JSON has no Date type, formatting is the caller's responsibility
}

type GetNotesResponse = {
  notes: NoteResponse[]
  nextCursor: string | null
}

export function buildNotesRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use('/notes', requireAuth())

  router.get('/notes', async (c) => {
    const { userId } = c.get('auth')
    const cropParam = c.req.query('crop')
    const cursorParam = c.req.query('cursor')

    const cropId = cropParam !== undefined ? parseInt(cropParam, 10) : null
    if (cropId !== null && (isNaN(cropId) || cropId <= 0)) {
      return c.json({ error: 'validation_failed', detail: 'invalid crop id' }, 400)
    }

    const cursor = decodeCursor(cursorParam ?? null)
    const notes = await loadNotePage(c.env.DB, userId, cropId, cursor)
    return c.json<GetNotesResponse>(notes)
  })

  router.post(
    '/notes',
    sValidator('json', createNoteSchema, (result, c) => {
      if (!result.success) {
        const detail = result.error[0]?.message ?? 'invalid request'
        return c.json({ error: 'validation_failed', detail }, 400)
      }
    }),
    async (c) => {
      const { userId } = c.get('auth')
      const { text, crops } = c.req.valid('json')

      const validCropIds = await notesDb.fetchValidCropIds(c.env.DB, crops)
      const invalidCrop = crops.find((id) => !validCropIds.has(id))
      if (invalidCrop !== undefined) {
        const validList = [...validCropIds].sort().join(', ')
        return c.json({ error: 'validation_failed', detail: `invalid crop id: ${invalidCrop} (valid ids: ${validList})` }, 400)
      }

      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      await notesDb.insertNote(c.env.DB, { id, text, userId, createdAt, crops })
      return c.json<NoteResponse>({ id, text, crops, createdAt }, 201)
    },
  )

  return router
}

async function loadNotePage(
  dbConn: DbConn,
  userId: string,
  cropId: number | null,
  cursor: NoteCursor | null,
): Promise<GetNotesResponse> {
  const rows = await notesDb.fetchNotePage(dbConn, userId, cropId, cursor, PAGE_SIZE)

  const hasMore = rows.length > PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const noteIds = pageRows.map((r) => r.id)

  const cropRows = noteIds.length > 0 ? await notesDb.fetchCropsForNotes(dbConn, noteIds) : []
  const cropsByNoteId = groupCropsByNoteId(cropRows)

  const notes: NoteResponse[] = pageRows.map((r) => ({
    id: r.id,
    text: r.text,
    crops: cropsByNoteId[r.id] ?? [],
    createdAt: r.created_at,
  }))

  const nextCursor = computeNextCursor(hasMore, pageRows)
  return { notes, nextCursor }
}

function computeNextCursor(hasMore: boolean, pageRows: NoteRow[]): string | null {
  if (!hasMore || pageRows.length === 0) return null
  const last = pageRows[pageRows.length - 1]
  return encodeCursor(last.created_at, last.id)
}

// Cursor is a base64-encoded (createdAt, id) pair. createdAt is the primary
// sort key; id breaks ties for notes created in the same millisecond. base64
// keeps the token opaque — callers must treat it as an arbitrary string, not
// something to construct themselves. See docs/arch/notes-cursor-pagination.md.

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`)
}

function decodeCursor(token: string | null): NoteCursor | null {
  if (!token) return null
  try {
    const decoded = atob(token)
    const sep = decoded.indexOf('|')
    if (sep === -1) return null
    return { createdAt: decoded.slice(0, sep), id: decoded.slice(sep + 1) }
  } catch {
    return null
  }
}
