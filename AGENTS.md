# AGENTS.md

## Cursor Cloud specific instructions

This is a **pnpm workspace monorepo** for a garden management app (akari-garden).

### Project structure

- `/server` — Hono + TypeScript backend API
- Frontend package will be added in a future PR

### Key commands (server)

| Task | Command |
|------|---------|
| Install all deps | `pnpm install` (from repo root) |
| Dev server | `pnpm --filter @akari-garden/server dev` (port 3000, with hot reload via tsx) |
| Lint | `pnpm --filter @akari-garden/server lint` |
| Test | `pnpm --filter @akari-garden/server test` |
| Build | `pnpm --filter @akari-garden/server build` |

Or `cd server` and run `pnpm dev`, `pnpm lint`, `pnpm test`, `pnpm build` directly.

### Notes

- Node.js v22+ via nvm. No special version switching needed.
- `tsx watch` provides hot reload during development — file saves restart the server automatically.
- Tests use **Vitest** and test Hono routes directly via `app.request()` (no HTTP server needed for tests).
- The notes API currently uses an in-memory store. Firestore integration is planned but requires a Firebase project and credentials.
- The `pnpm.onlyBuiltDependencies` field in the root `package.json` allows esbuild's install script (required by tsx).
