# Migrations

D1 reference: [Cloudflare D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## How it works

D1 tracks applied migrations in an internal `d1_migrations` table. When you run
`wrangler d1 migrations apply`, it checks that table and runs any files that
haven't been applied yet, in filename order. It never re-runs a file it has
already applied.

In local dev and tests, the better-sqlite3 adapter (`src/lib/d1-adapter.ts`)
reads all `.sql` files from this directory in filename order and applies them
on startup, so new migrations are picked up automatically.

## Adding a migration

Name files with a zero-padded sequence number: `0002_add_notes.sql`,
`0003_add_photos.sql`, etc. D1 applies them in lexicographic order.

**Never edit a migration that has already been applied** — locally or in prod.
D1 identifies migrations by filename, not content. Editing an applied file means
the change silently never runs. Add a new file instead.

## SQLite ALTER TABLE limitations

SQLite's `ALTER TABLE` is much more limited than Postgres or MySQL:

- **Adding a column**: fine — `ALTER TABLE foo ADD COLUMN bar TEXT`
- **Dropping a column**: supported in SQLite 3.35+ (D1 runs a recent version, so OK)
- **Renaming a column**: supported in SQLite 3.25+
- **Changing a column's type or constraints**: not supported at all

For unsupported changes (e.g. adding a NOT NULL constraint to an existing
column, reordering columns), the standard workaround is:

```sql
CREATE TABLE foo_new (...);
INSERT INTO foo_new SELECT ... FROM foo;
DROP TABLE foo;
ALTER TABLE foo_new RENAME TO foo;
```

This is safe to do in a migration file. Just make sure to recreate any indexes.

## Rollbacks

D1 has no built-in rollback. If a migration fails partway through, you'll need
to inspect the database state and fix it manually. To reduce risk:

- Prefer additive changes (new tables, new nullable columns) over destructive ones
- Test against a local copy before applying `--remote`
- Keep migrations small and focused
