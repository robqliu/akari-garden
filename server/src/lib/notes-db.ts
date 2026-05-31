import type { AppEnv } from './env.js'

export type DbConn = AppEnv['Bindings']['DB']

export type NoteRow = { id: string; text: string; created_at: string }
export type CropRow = { note_id: string; crop_id: number }
export type NoteCursor = { createdAt: string; id: string }

export type NewNote = {
  id: string
  text: string
  userId: string
  createdAt: string
  crops: number[]
}

export const notesDb = {
  async insertNote(dbConn: DbConn, { id, text, userId, createdAt, crops }: NewNote): Promise<void> {
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
    dbConn: DbConn,
    userId: string,
    cropId: number | null,
    cursor: NoteCursor | null,
    pageSize: number,
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
          .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, cropId, pageSize + 1)
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
        .bind(userId, cursorCreatedAt, cursorCreatedAt, cursorId, pageSize + 1)
        .all<NoteRow>()
    ).results
  },

  async fetchCropsForNotes(dbConn: DbConn, noteIds: string[]): Promise<CropRow[]> {
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
  async fetchValidCropIds(dbConn: DbConn, cropIds: number[]): Promise<Set<number>> {
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

export function groupCropsByNoteId(rows: CropRow[]): Record<string, number[]> {
  const map: Record<string, number[]> = {}
  for (const row of rows) {
    ;(map[row.note_id] ??= []).push(row.crop_id)
  }
  return map
}
