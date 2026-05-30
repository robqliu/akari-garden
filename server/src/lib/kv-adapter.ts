import type { KVNamespace } from '@cloudflare/workers-types'

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
