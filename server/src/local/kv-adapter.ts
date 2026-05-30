import type { KVNamespace } from '@cloudflare/workers-types'

// In-memory KV adapter for local dev and tests, analogous to d1-adapter.ts
// for D1. Lives in lib/ rather than a test directory because dev-server.ts
// also uses it (not just the test fixture).
export function createMemoryKV(): KVNamespace {
  const store = new Map<string, string>()

  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
    list: notImplemented('list'),
    getWithMetadata: notImplemented('getWithMetadata'),
  } as unknown as KVNamespace
}

function notImplemented(name: string): () => never {
  return () => { throw new Error(`KV adapter: ${name}() not implemented`) }
}
