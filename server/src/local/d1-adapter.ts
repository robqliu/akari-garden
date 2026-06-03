import BetterSqlite3 from 'better-sqlite3'
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

// Applies any pending migrations to the SQLite database.
//
// SQLite's PRAGMA user_version is used as a migration counter: it starts at 0 on
// a new database and is incremented after each migration file is applied. On
// startup this reads the current version, slices the sorted migration file list
// from that index, and applies only the remainder. A fresh database runs all
// migrations; an existing database skips the ones it has already seen.
//
// In production, D1 does something similar via wrangler d1 migrations apply,
// which records applied migrations in a d1_migrations table.
function applyMigrations(sqlite: BetterSqlite3.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let version = sqlite.pragma('user_version', { simple: true }) as number

  for (const file of files.slice(version)) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf-8'))
    version++
    sqlite.pragma(`user_version = ${version}`)
    console.log(`[dev] Applied migration: ${file}`)
  }
}

/**
 * @remarks Not thread-safe: do not share an instance across worker threads.
 */
export function createSqliteD1(path: string = ':memory:'): D1Database {
  const sqlite = new BetterSqlite3(path)
  applyMigrations(sqlite)

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
