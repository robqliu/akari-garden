import BetterSqlite3 from 'better-sqlite3'
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

function loadSchema(): string {
  return readFileSync(join(MIGRATIONS_DIR, '0001_users_sessions.sql'), 'utf-8')
}

export function createSqliteD1(path: string = ':memory:'): D1Database {
  const sqlite = new BetterSqlite3(path)
  sqlite.exec(loadSchema())

  return {
    prepare(sql: string) {
      let boundValues: unknown[] = []

      const prepared = {
        bind(...values: unknown[]) {
          boundValues = values
          return prepared
        },
        async first<T = unknown>(): Promise<T | null> {
          return (sqlite.prepare(sql).get(boundValues) as T) ?? null
        },
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
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = []
      for (const stmt of statements) {
        results.push(await stmt.run())
      }
      return results
    },
    async dump() {
      throw new Error('dump not supported in local polyfill')
    },
  } as unknown as D1Database
}
