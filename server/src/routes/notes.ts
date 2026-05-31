import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { z } from 'zod'

import type { AppEnv } from '../lib/env.js'
import { requireAuth } from '../lib/auth.js'

const PAGE_SIZE = 20
const MAX_TEXT_LENGTH = 1000

const createNoteSchema = z.object({
  text: z.string().trim().min(1, 'text is required').max(MAX_TEXT_LENGTH, `text must be ${MAX_TEXT_LENGTH} characters or fewer`),
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

      const validCropIds = await db.fetchValidCropIds(c.env.DB, crops)
      const invalidCrop = crops.find((id) => !validCropIds.has(id))
      if (invalidCrop !== undefined) {
        const validList = [...validCropIds].sort().join(', ')
        return c.json({ error: 'validation_failed', detail: `invalid crop id: ${invalidCrop} (valid ids: ${validList})` }, 400)
      }

      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      await db.insertNote(c.env.DB, { id, text, userId, createdAt, crops })
      return c.json<NoteResponse>({ id, text, crops, createdAt }, 201)
    },
  )

  return router
}

// ── Notes page loader ─────────────────────────────────────────────────────────

async function loadNotePage(
  dbConn: AppEnv['Bindings']['DB'],
  userId: string,
  cropId: number | null,
  cursor: Cursor | null,
): Promise<GetNotesResponse> {
  const rows = await db.fetchNotePage(dbConn, userId, cropId, cursor)

  const hasMore = rows.length > PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const noteIds = pageRows.map((r) => r.id)

  const cropRows = noteIds.length > 0 ? await db.fetchCropsForNotes(dbConn, noteIds) : []
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

// ── DB layer ──────────────────────────────────────────────────────────────────

type NoteRow = { id: string; text: string; created_at: string }
type CropRow = { note_id: string; crop_id: number }
type Cursor = { createdAt: string; id: string }

type NewNote = { id: string; text: string; userId: string; createdAt: string; crops: number[] }

type NotesDb = {
  insertNote(dbConn: AppEnv['Bindings']['DB'], note: NewNote): Promise<void>
  fetchNotePage(dbConn: AppEnv['Bindings']['DB'], userId: string, cropId: number | null, cursor: Cursor | null): Promise<NoteRow[]>
  fetchCropsForNotes(dbConn: AppEnv['Bindings']['DB'], noteIds: string[]): Promise<CropRow[]>
  fetchValidCropIds(dbConn: AppEnv['Bindings']['DB'], cropIds: number[]): Promise<Set<number>>
}

const db: NotesDb = {
  async insertNote(dbConn, { id, text, userId, createdAt, crops }) {
    await dbConn.batch([
      dbConn.prepare('INSERT INTO notes (id, text, created_by, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, text, userId, createdAt),
      ...crops.map((cropId) =>
        dbConn.prepare('INSERT INTO note_crops (note_id, crop_id) VALUES (?, ?)').bind(id, cropId),
      ),
    ])
  },

  // Fetches PAGE_SIZE + 1 rows so the caller can detect whether a next page
  // exists without a separate COUNT query.
  async fetchNotePage(
    dbConn: AppEnv['Bindings']['DB'],
    userId: string,
    cropId: number | null,
    cursor: Cursor | null,
  ): Promise<NoteRow[]> {
    const cursorCreatedAt = cursor?.createdAt ?? '9999-12-31T23:59:59.999Z'
    const cursorId = cursor?.id ?? '￿'

    if (cropId !== null) {
      return (
        await dbConn
          .prepare(
            `SELECT n.id, n.text, n.created_at FROM notes n
             WHERE n.created_by = ?
               AND (n.created_at < ? OR (n.created_at = ? AND n.id > ?))
               AND n.id IN (SELECT note_id FROM note_crops WHERE crop_id = ?)
             ORDER BY n.created_at DESC, n.id ASC
             LIMIT ?`,
          )
          .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, cropId, PAGE_SIZE + 1)
          .all<NoteRow>()
      ).results
    }

    return (
      await dbConn
        .prepare(
          `SELECT id, text, created_at FROM notes
           WHERE created_by = ?
             AND (created_at < ? OR (created_at = ? AND id > ?))
           ORDER BY created_at DESC, id ASC
           LIMIT ?`,
        )
        .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, PAGE_SIZE + 1)
        .all<NoteRow>()
    ).results
  },

  async fetchCropsForNotes(
    dbConn: AppEnv['Bindings']['DB'],
    noteIds: string[],
  ): Promise<CropRow[]> {
    const placeholders = noteIds.map(() => '?').join(', ')
    return (
      await dbConn
        .prepare(`SELECT note_id, crop_id FROM note_crops WHERE note_id IN (${placeholders})`)
        .bind(...noteIds)
        .all<CropRow>()
    ).results
  },

  // TODO: cache the full crops set at startup — it's immutable without a migration,
  // so there's no reason to query on every POST.
  async fetchValidCropIds(
    dbConn: AppEnv['Bindings']['DB'],
    cropIds: number[],
  ): Promise<Set<number>> {
    const placeholders = cropIds.map(() => '?').join(', ')
    const rows = (
      await dbConn
        .prepare(`SELECT id FROM crops WHERE id IN (${placeholders})`)
        .bind(...cropIds)
        .all<{ id: number }>()
    ).results
    return new Set(rows.map((r) => r.id))
  },
}

function groupCropsByNoteId(rows: CropRow[]): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const row of rows) {
    ;(map[row.note_id] ??= []).push(row.crop_id)
  }
  return map
}

// ── Cursor encoding ───────────────────────────────────────────────────────────
//
// Cursor is a base64-encoded (createdAt, id) pair. createdAt is the primary
// sort key; id breaks ties for notes created in the same millisecond. base64
// keeps the token opaque — callers must treat it as an arbitrary string, not
// something to construct themselves. See docs/arch/notes-cursor-pagination.md.

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`)
}

function decodeCursor(token: string | null): Cursor | null {
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
