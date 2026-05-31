const WORKER_URL = 'https://akari-garden-api.robqliu.workers.dev'

export async function onRequest(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url)
  const target = new URL(url.pathname + url.search, WORKER_URL)
  return fetch(target, context.request)
}
