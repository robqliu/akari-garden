# AGENTS.md

## Project overview

**akari-garden** is a hobby app for managing a small personal garden.

## Stack

**pnpm workspace monorepo** (Node.js v22+):

- `/server` — Hono + TypeScript, deployed as a Cloudflare Worker (port 3000 locally)
- `/web` — React + TypeScript via Vite (port 5173 locally; proxies `/health` and `/api` to the backend)

CI is defined in `.github/workflows/ci.yml`. Deployment workflows are in `cloudflare.yml` and `cleanup-pages-previews.yml`.

## Dev setup

See `server/SETUP.md` for environment setup (Google OAuth credentials, `.env`, session signing key). Start the server before
the web dev server.

## Key commands

Run from repo root using `--filter`, or `cd` into the package.

| Task  | Server                                       | Web                                       |
|-------|----------------------------------------------|-------------------------------------------|
| Dev   | `pnpm --filter @akari-garden/server dev`     | `pnpm --filter @akari-garden/web dev`     |
| Lint  | `pnpm --filter @akari-garden/server lint`    | `pnpm --filter @akari-garden/web lint`    |
| Test  | `pnpm --filter @akari-garden/server test`    | —                                         |
| Build | `pnpm --filter @akari-garden/server build`   | `pnpm --filter @akari-garden/web build`   |

Server uses `tsx watch` for hot reload — file saves restart the server automatically. Tests use Vitest and exercise Hono
routes via `app.request()`.

### Notes

- Node.js v22+ via nvm. No special version switching needed.
- The root `package.json` has `pnpm.onlyBuiltDependencies: ["esbuild"]`. pnpm blocks install scripts by default; this
  whitelists esbuild so it can download its platform binary (which `tsx` depends on).

## Git workflow

**PRs** state the branch's goal clearly in the title/description.

**Commits** are a principled partition of the work toward that goal. The bar for a good commit: does the repo make sense
after this commit, or is it left in a broken/half-wired state? Is this easy to review on its own — not a pile of unconnected
changes, but also not so granular it's noise?

During review, ephemeral "address feedback" commits are fine. They must be squashed before merge into `main`.

**Commit messages** explain design decisions, not just what changed. The *why* belongs here: tradeoffs made, alternatives
rejected, constraints that shaped the approach.

### Architecture docs

For significant design decisions, prefer a dedicated architecture doc over a long commit message or inline comments.
Location: `docs/arch/`. These docs are effectively immutable — they describe the state of the world at the time they were
written. Typos or factual errors relative to the original implementation can be fixed in place. Subsequent architectural
changes get a *new* doc that links back to the previous one if relevant. Code can reference these docs by path to avoid
oversized class/file comments and to sidestep the question of which file "owns" the explanation.

If a decision is too small for a standalone doc, the commit message is the right home.

## Coding standards

### General

Adhere to Clean Code principles. Design top-down: start from the shape of the feature, then fill in implementation. Classes
and modules should make sense in isolation — avoid vague names like `utils` or `helpers` unless truly nothing better fits.
Methods should be short; extract named sub-methods so the calling code reads like a description of what it does.

A comment on a single confusing line explaining *why* it's written that way is fine. A comment block explaining *what* a
chunk of code does is usually a sign it should be extracted into a named method instead.

### TypeScript

Prefer type safety over convenience. Avoid `any`. For values that may be absent:

- In public APIs and return types, prefer explicit union types (`T | null` or `T | undefined`) over implicit optionality
  — be explicit about which one and be consistent.
- In private methods where the context makes absence obvious, a looser approach is acceptable (analogous to `@Nullable`
  on private Java methods — don't over-engineer internal plumbing).

### Tests

Tests should guard against meaningful behavioral regressions, not re-assert implementation details. A test that mirrors
the code line-for-line is just maintenance burden with no safety value.

Ask: what behavior does this test protect? If the answer is "the code does X" rather than "the feature does Y," reconsider.

If a test requires mocking out many dependencies, that's a signal you're probably at the wrong abstraction level — consider
moving up to an integration or route-level test instead. Low-level unit tests are appropriate when the logic is
algorithmically complex enough that testing it through a higher-level interface would obscure the cases being covered.

Server tests run against real Hono routes via `app.request()` — this is the preferred level for API behavior.
