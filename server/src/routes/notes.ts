import { Hono } from 'hono'

import type { AppEnv } from '../lib/env.js'
import { getAuthenticatedUserWithId } from '../lib/db.js'

const PAGE_SIZE = 20

export type NoteDto = {
  id: string
  text: string
  crops: number[]
  createdAt: string
}

type GetNotesResponse = {
  notes: NoteDto[]
  nextCursor: string | null
}

type CreateNoteRequest = {
  text?: unknown
  crops?: unknown
}

export function buildNotesRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>()

  router.use('/notes', async (c, next) => {
    const auth = await getAuthenticatedUserWithId(c)
    if (!auth) return c.json({ error: 'not_authenticated' }, 401)
    c.set('auth', auth)
    await next()
  })

  router.get('/notes', async (c) => {
    const { userId } = c.get('auth')
    const cropParam = c.req.query('crop')
    const cursorParam = c.req.query('cursor')

    const cropId = cropParam !== undefined ? parseInt(cropParam, 10) : null
    if (cropId !== null && (isNaN(cropId) || cropId <= 0)) {
      return c.json({ error: 'validation_failed', detail: 'invalid crop id' }, 400)
    }

    const cursor = decodeCursor(cursorParam ?? null)

    const noteRows = await fetchNotePage(c.env.DB, userId, cropId, cursor)
    const noteIds = noteRows.map((r) => r.id)

    const cropRows = noteIds.length > 0 ? await fetchCropsForNotes(c.env.DB, noteIds) : []

    const cropsByNoteId = groupCropsByNoteId(cropRows)
    const notes: NoteDto[] = noteRows.map((r) => ({
      id: r.id,
      text: r.text,
      crops: cropsByNoteId[r.id] ?? [],
      createdAt: r.created_at,
    }))

    const nextCursor =
      noteRows.length === PAGE_SIZE
        ? encodeCursor(noteRows[noteRows.length - 1].created_at, noteRows[noteRows.length - 1].id)
        : null

    return c.json<GetNotesResponse>({ notes, nextCursor })
  })

  router.post('/notes', async (c) => {
    const { userId } = c.get('auth')
    const body = await c.req.json<CreateNoteRequest>()

    const validation = validateCreateNote(body)
    if (validation.error) return c.json({ error: 'validation_failed', detail: validation.error }, 400)
    const { text, crops } = validation

    const validCrops = await fetchValidCropIds(c.env.DB, crops)
    const invalidCrop = crops.find((id) => !validCrops.has(id))
    if (invalidCrop !== undefined) {
      return c.json({ error: 'validation_failed', detail: `unknown crop: ${invalidCrop}` }, 400)
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO notes (id, text, created_by, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, text, userId, createdAt),
      ...crops.map((cropId) =>
        c.env.DB.prepare('INSERT INTO note_crops (note_id, crop_id) VALUES (?, ?)').bind(id, cropId),
      ),
    ])

    return c.json<NoteDto>({ id, text, crops, createdAt }, 201)
  })

  return router
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type NoteRow = { id: string; text: string; created_at: string }
type CropRow = { note_id: string; crop_id: number }
type Cursor = { createdAt: string; id: string }

async function fetchNotePage(
  db: AppEnv['Bindings']['DB'],
  userId: string,
  cropId: number | null,
  cursor: Cursor | null,
): Promise<NoteRow[]> {
  const cursorCreatedAt = cursor?.createdAt ?? '9999-12-31T23:59:59.999Z'
  const cursorId = cursor?.id ?? '￿'

  if (cropId !== null) {
    return (
      await db
        .prepare(
          `SELECT n.id, n.text, n.created_at FROM notes n
           WHERE n.created_by = ?
             AND (n.created_at < ? OR (n.created_at = ? AND n.id > ?))
             AND n.id IN (SELECT note_id FROM note_crops WHERE crop_id = ?)
           ORDER BY n.created_at DESC, n.id ASC
           LIMIT ?`,
        )
        .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, cropId, PAGE_SIZE)
        .all<NoteRow>()
    ).results
  }

  return (
    await db
      .prepare(
        `SELECT id, text, created_at FROM notes
         WHERE created_by = ?
           AND (created_at < ? OR (created_at = ? AND id > ?))
         ORDER BY created_at DESC, id ASC
         LIMIT ?`,
      )
      .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, PAGE_SIZE)
      .all<NoteRow>()
  ).results
}

async function fetchCropsForNotes(
  db: AppEnv['Bindings']['DB'],
  noteIds: string[],
): Promise<CropRow[]> {
  const placeholders = noteIds.map(() => '?').join(', ')
  return (
    await db
      .prepare(`SELECT note_id, crop_id FROM note_crops WHERE note_id IN (${placeholders})`)
      .bind(...noteIds)
      .all<CropRow>()
  ).results
}

async function fetchValidCropIds(
  db: AppEnv['Bindings']['DB'],
  cropIds: number[],
): Promise<Set<number>> {
  const placeholders = cropIds.map(() => '?').join(', ')
  const rows = (
    await db
      .prepare(`SELECT id FROM crops WHERE id IN (${placeholders})`)
      .bind(...cropIds)
      .all<{ id: number }>()
  ).results
  return new Set(rows.map((r) => r.id))
}

function groupCropsByNoteId(rows: CropRow[]): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const row of rows) {
    ;(map[row.note_id] ??= []).push(row.crop_id)
  }
  return map
}

// ── Cursor encoding ───────────────────────────────────────────────────────────

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

// ── Validation ────────────────────────────────────────────────────────────────

function validateCreateNote(body: CreateNoteRequest):
  | { text: string; crops: number[]; error?: undefined }
  | { error: string } {
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    return { error: 'text is required' }
  }
  if (!Array.isArray(body.crops) || body.crops.length === 0) {
    return { error: 'crops must be a non-empty array' }
  }
  if (body.crops.some((c) => typeof c !== 'number' || !Number.isInteger(c) || c <= 0)) {
    return { error: 'each crop must be a positive integer' }
  }
  return { text: body.text.trim(), crops: body.crops as number[] }
}
