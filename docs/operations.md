# Operations

The deploy workflow is in `.github/workflows/cloudflare.yml`. Each step has inline comments explaining what it
does and why. This document covers manual recovery steps for when things go wrong.

## If the server gets stuck disabled

If the CI job is killed mid-deploy (not just a step failure — `always()` handles that), re-enable manually:

```sh
cd server
wrangler kv key put --binding CONFIG_KV disable_server "0"
```

The site resumes serving immediately.

## If a migration fails

Wrangler wraps each migration file in a transaction. A failure rolls back the entire file — there is no partial
application. Unlike most databases, SQLite (which D1 is built on)
[supports transactional DDL](https://developers.cloudflare.com/d1/reference/migrations/). Do not add explicit
`BEGIN TRANSACTION` to migration files — wrangler handles this internally and explicit transaction syntax errors
on remote D1.

A failed migration stays as "Not Applied" in wrangler's `d1_migrations` tracking table, so the next deploy will
detect it as pending and retry it automatically. Fix the SQL, push, and the normal deploy sequence handles the
rest.

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

## Manually triggering a deploy

Go to the `Deploy to Cloudflare` workflow in GitHub Actions and use **Run workflow** on `main`.

## CONFIG_KV

`CONFIG_KV` is a Cloudflare KV namespace used for runtime configuration readable by the Worker without a code
deploy. Because Workers are stateless, there is no other mechanism to affect all running instances without
deploying new code.

- **Namespace ID:** `e4072ad9a4064ca2badeb10a813fee24`
- **Current keys:**
  - `disable_server` — `"1"` while deploying; `"0"` otherwise

To read or write keys directly:

```sh
cd server
wrangler kv key get --binding CONFIG_KV <key>
wrangler kv key put --binding CONFIG_KV <key> <value>
```

### Zero-downtime deploys

Every deploy currently disables the server briefly (typically a few seconds). To skip this for code-only
deploys, you would need to detect whether any migrations are actually pending and condition the disable/enable
steps on that. The reliable way to do this is to query the `d1_migrations` tracking table and diff against the
files on disk, rather than parsing wrangler's human-readable output:

```bash
APPLIED=$(wrangler d1 execute akari-garden-db --remote \
  --command "SELECT name FROM d1_migrations" --json \
  | jq -r '.[0].results[].name')
FILES=$(ls migrations/*.sql | xargs -n1 basename)
PENDING=$(comm -23 <(echo "$FILES" | sort) <(echo "$APPLIED" | sort) | wc -l)
```

`jq` is available on GitHub Actions runners by default.

## D1 database

- **Database name:** `akari-garden-db`
- **Database ID:** `0139736a-a1f7-4c23-9d74-ea854c3b26e5`
- **Migration files:** `server/migrations/` — filenames must sort in application order

Run an arbitrary query against prod:

```sh
wrangler d1 execute akari-garden-db --remote --command "SELECT COUNT(*) FROM notes"
```

## Local dev database

The dev server uses a local SQLite file at `server/.dev.sqlite`. If the schema is out of date after pulling a
branch with new migrations, delete it and restart:

```sh
pnpm --filter @akari-garden/server dev:clean
pnpm --filter @akari-garden/server dev
```
