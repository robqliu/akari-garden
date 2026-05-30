# Operations

The deploy workflow is in `.github/workflows/cloudflare.yml`. Each step has inline comments explaining what it does and why. This document covers manual recovery steps for when things go wrong.

## If the server gets stuck disabled

If a deploy fails and the server is not re-enabled automatically (e.g. the CI job itself is killed), re-enable it manually:

```sh
cd server
wrangler kv key put --binding CONFIG_KV disable_server "0"
```

The site resumes serving immediately.

## If a migration fails

Wrangler wraps each migration file in a transaction. A failure rolls back the entire file — there is no partial application. Unlike most databases, SQLite (which D1 is built on) supports transactional DDL. Do not add explicit `BEGIN TRANSACTION` to migration files — wrangler handles this internally and explicit transaction syntax errors on remote D1.

A failed migration stays as "Not Applied" in wrangler's `d1_migrations` tracking table, so the next deploy will detect it as pending and retry it automatically. Fix the SQL, push, and the normal deploy sequence handles the rest.

To manually apply migrations outside of a deploy:
```sh
cd server
wrangler d1 migrations apply akari-garden-db --remote
```

## Checking status

**Which migrations have been applied to prod:**
```sh
wrangler d1 execute akari-garden-db --remote --command "SELECT * FROM d1_migrations ORDER BY applied_at"
```

**Whether the server is currently disabled:**
```sh
cd server
wrangler kv key get --binding CONFIG_KV disable_server
```
Returns `"1"` if disabled, `"0"` if enabled.

## Manually triggering a deploy

Go to the `Deploy to Cloudflare` workflow in GitHub Actions and use **Run workflow** on `main`.

## CONFIG_KV

`CONFIG_KV` is a Cloudflare KV namespace used for runtime configuration readable by the Worker without a code deploy. Because Workers are stateless, there is no other mechanism to affect all running instances without deploying new code.

- **Namespace ID:** `e4072ad9a4064ca2badeb10a813fee24`
- **Current keys:**
  - `disable_server` — `"1"` while deploying schema changes; `"0"` otherwise

## D1 database

- **Database name:** `akari-garden-db`
- **Database ID:** `0139736a-a1f7-4c23-9d74-ea854c3b26e5`
- **Migration files:** `server/migrations/` — filenames must sort in application order

Run an arbitrary query against prod:
```sh
wrangler d1 execute akari-garden-db --remote --command "SELECT COUNT(*) FROM notes"
```

## Local dev database

The dev server uses a local SQLite file at `server/.dev.sqlite`. If the schema is out of date after pulling a branch with new migrations, delete it and restart:

```sh
pnpm --filter @akari-garden/server dev:clean
pnpm --filter @akari-garden/server dev
```
