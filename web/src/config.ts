// In dev, API_URL is empty so requests like fetch('/api/auth/me') go
// to the same origin as the page. Vite's dev server proxies those
// paths to the local backend at localhost:3000.
//
// In production, the frontend (Pages) and API (Workers) are on
// different origins, so we need the full URL.
export const API_URL = import.meta.env.DEV
  ? ''
  : 'https://akari-garden-api.robqliu.workers.dev'
