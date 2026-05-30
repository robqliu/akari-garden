import BetterSqlite3 from 'better-sqlite3'
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

function loadSchema(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).join('\n')
}

/**
 * @remarks Not thread-safe: do not share an instance across worker threads.
 */
export function createSqliteD1(path: string = ':memory:'): D1Database {
  const sqlite = new BetterSqlite3(path)
  sqlite.exec(loadSchema())

  let poisoned = false
  function assertHealthy() {
    if (poisoned) throw new Error('D1 adapter is poisoned: a prior batch() failed mid-flight')
  }

  return {
    prepare(sql: string) {
      assertHealthy()
      let boundValues: unknown[] = []

      const prepared = {
        bind(...values: unknown[]) {
          boundValues = values
          return prepared
        },
        async first<T = unknown>(): Promise<T | null> {
          return (sqlite.prepare(sql).get(boundValues) as T) ?? null
        },
        // run() is for writes (INSERT/UPDATE/DELETE). D1 always returns empty results
        // from run() — use all() if you need rows back.
        async run() {
          sqlite.prepare(sql).run(boundValues)
          return { success: true, results: [], meta: {} }
        },
        async all<T = unknown>() {
          return { results: sqlite.prepare(sql).all(boundValues) as T[], success: true, meta: {} }
        },
      }
      return prepared as unknown as D1PreparedStatement
    },
    async exec(sql: string) {
      assertHealthy()
      sqlite.exec(sql)
      // count is the number of SQL statements executed; duration is wall-clock ms.
      // Both are informational and unused by our callers, so we don't bother computing them.
      return { count: 0, duration: 0 }
    },
    // Real D1 batch() is atomic — a statement failure rolls back all prior statements.
    // This adapter is NOT atomic; prior statements commit even if a later one throws.
    // On failure we poison the adapter so subsequent operations fail fast rather than
    // silently operating on a partially-written database.
    async batch(statements: D1PreparedStatement[]) {
      assertHealthy()
      const results = []
      try {
        for (const stmt of statements) {
          results.push(await stmt.run())
        }
      } catch (err) {
        poisoned = true
        throw err
      }
      return results
    },
    async dump() {
      throw new Error('dump not supported in local adapter')
    },
  } as unknown as D1Database
}
