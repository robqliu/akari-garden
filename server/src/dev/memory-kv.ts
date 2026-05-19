import type { KVNamespace } from '@cloudflare/workers-types'

// A minimal KVNamespace stand-in for local dev (and tests). Only
// implements get/put/delete with the string-overload signatures we
// actually use. Anything beyond that throws so we catch accidental
// reliance on real-KV-only features early.
export function createMemoryKV(): KVNamespace {
  const store = new Map<string, string>()

  const unsupported = (name: string) => () => {
    throw new Error(`memory-kv: ${name} is not implemented`)
  }

  return {
    get: (async (
      key: string,
      options?: 'text' | 'json' | { type?: 'text' | 'json' },
    ) => {
      const raw = store.get(key) ?? null
      if (raw === null) return null
      const type =
        typeof options === 'string' ? options : options?.type ?? 'text'
      if (type === 'json') {
        try {
          return JSON.parse(raw)
        } catch {
          return null
        }
      }
      return raw
    }) as KVNamespace['get'],
    put: (async (key: string, value: string) => {
      store.set(key, value)
    }) as KVNamespace['put'],
    delete: (async (key: string) => {
      store.delete(key)
    }) as KVNamespace['delete'],
    list: unsupported('list') as unknown as KVNamespace['list'],
    getWithMetadata: unsupported('getWithMetadata') as unknown as KVNamespace['getWithMetadata'],
  }
}
