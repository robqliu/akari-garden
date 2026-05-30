# Operations

## Deployments

Deployments to production happen automatically when a PR merges to `main`, via the `deploy_api` job in `.github/workflows/cloudflare.yml`. The steps run in this order:

1. **Check for pending migrations** — runs `wrangler d1 migrations list` and checks whether any migration files in `server/migrations/` have not yet been applied to the production D1 database.
2. **Disable server** *(only if migrations are pending)* — sets `CONFIG_KV/disable_server = "1"`. The Worker checks this key on every request and returns 503 while it is set. Code-only deploys skip this step and have zero downtime.
3. **Apply D1 migrations** *(only if migrations are pending)* — runs `wrangler d1 migrations apply akari-garden-db --remote`. Wrangler tracks which files have been applied in a `d1_migrations` table inside D1 and only runs new ones.
4. **Deploy Worker** — uploads the new Worker code to Cloudflare via `wrangler deploy`.
5. **Re-enable server** *(only if migrations were pending)* — sets `CONFIG_KV/disable_server = "0"`. Runs even if a previous step failed (`if: always()`), so the site does not stay down indefinitely after a broken deploy.

If step 3 fails, step 4 is skipped — the old Worker code keeps running against the old schema, which is safe. If step 4 fails, the server is still re-enabled in step 5, leaving the old Worker running (safe for additive migrations).

### Checking deployment status

**Which migrations have been applied to prod:**
```sh
wrangler d1 execute akari-garden-db --remote --command "SELECT * FROM d1_migrations ORDER BY applied_at"
```

**Whether the server is currently disabled:**
```sh
wrangler kv key get --binding CONFIG_KV disable_server
```
Returns `"1"` if disabled, `"0"` if enabled.

### If the server gets stuck disabled

If a deploy fails partway and the server is not re-enabled automatically (e.g. the CI job itself is killed), re-enable it manually:

```sh
cd server
wrangler kv key put --binding CONFIG_KV disable_server "0"
```

The site will resume serving immediately.

### If a migration fails

Wrangler only marks a migration as applied when it completes successfully. A failed migration stays as "Not Applied" in the `d1_migrations` tracking table, so the next deploy will detect it as pending, disable the server, and retry it.

Wrangler wraps each migration file in a transaction automatically, so a failure rolls back the entire file — there is no partial application. Unlike most databases, SQLite (which D1 is built on) supports transactional DDL, which is what makes this possible. Do not add explicit `BEGIN TRANSACTION` to migration files — wrangler handles this internally and explicit transaction syntax will error on remote D1.

To manually apply a migration after fixing it:
```sh
cd server
wrangler d1 migrations apply akari-garden-db --remote
```

If you need to apply a specific file without going through wrangler's tracking (use carefully — bypasses the tracking table):
```sh
wrangler d1 execute akari-garden-db --remote --file=server/migrations/0002_notes.sql
```

### Manually triggering a deploy

Go to the `Deploy to Cloudflare` workflow in GitHub Actions and use **Run workflow** on `main`.

## CONFIG_KV

`CONFIG_KV` is a Cloudflare KV namespace used for runtime configuration that needs to be readable by the Worker without a code deploy. Because Cloudflare Workers are stateless and have no persistent process, there is no other way to "turn off" the server without deploying new code — `disable_server` is our mechanism for forcing downtime when schema changes require it.

- **Namespace ID:** `e4072ad9a4064ca2badeb10a813fee24`
- **Current keys:**
  - `disable_server` — `"1"` while deploying schema changes; `"0"` otherwise

To read or write keys directly:
```sh
cd server
wrangler kv key get  --binding CONFIG_KV <key>
wrangler kv key put  --binding CONFIG_KV <key> <value>
```

## D1 database

- **Database name:** `akari-garden-db`
- **Database ID:** `0139736a-a1f7-4c23-9d74-ea854c3b26e5`
- **Migration files:** `server/migrations/` — filenames must sort in the order they should be applied

Run an arbitrary query against prod:
```sh
wrangler d1 execute akari-garden-db --remote --command "SELECT COUNT(*) FROM notes"
```

## Local dev database

The dev server uses a local SQLite file at `server/.dev.sqlite`. If the schema is out of date (e.g. after pulling a branch with new migrations), delete it and restart the server:

```sh
pnpm --filter @akari-garden/server dev:reset
pnpm --filter @akari-garden/server dev
```
