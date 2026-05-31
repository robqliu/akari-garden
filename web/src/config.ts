// API requests use relative paths in both dev and prod. In dev, Vite
// proxies /api and /health to localhost:3000. In prod, Cloudflare Pages
// proxies them to the Worker via web/public/_redirects.
export const API_URL = ''
