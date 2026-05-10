# AGENTS.md

## Cursor Cloud specific instructions

This is a **pnpm workspace monorepo** for a garden management app (akari-garden).

### Project structure

- `/server` — Hono + TypeScript backend API (port 3000)
- `/web` — React + TypeScript frontend via Vite (port 5173)

### Key commands

Run from repo root using `--filter`, or `cd` into the package and run directly.

| Task | Server | Web |
|------|--------|-----|
| Dev | `pnpm --filter @akari-garden/server dev` | `pnpm --filter @akari-garden/web dev` |
| Lint | `pnpm --filter @akari-garden/server lint` | `pnpm --filter @akari-garden/web lint` |
| Test | `pnpm --filter @akari-garden/server test` | — |
| Build | `pnpm --filter @akari-garden/server build` | `pnpm --filter @akari-garden/web build` |

### Notes

- Node.js v22+ via nvm. No special version switching needed.
- **Server**: `tsx watch` provides hot reload — file saves restart the server automatically. Tests use Vitest and test Hono routes via `app.request()`.
- **Web**: Vite dev server proxies `/health` and `/api` to the backend at `localhost:3000`. Start the backend first.
- The `pnpm.onlyBuiltDependencies` field in the root `package.json` allows esbuild's install script (required by tsx).
