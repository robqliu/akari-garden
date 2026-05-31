const WORKER_URL = 'https://akari-garden-api.robqliu.workers.dev'

export async function onRequest(context: { request: Request }): Promise<Response> {
  const target = new URL('/health', WORKER_URL)
  return fetch(target, context.request)
}
