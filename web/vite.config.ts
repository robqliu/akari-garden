import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // `server` only applies to the local dev server (`pnpm dev`). It's
  // ignored during `pnpm build`, which produces static files for
  // Cloudflare Pages. https://vite.dev/config/server-options
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
})
