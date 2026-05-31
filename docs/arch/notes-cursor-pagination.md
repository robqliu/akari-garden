# Notes — cursor pagination

## Why cursor pagination over offset pagination

Offset pagination (`LIMIT n OFFSET k`) is simple but breaks under concurrent inserts: if a
note is added between page 1 and page 2, every row shifts and the client either skips a note
or sees a duplicate. For a notes feed where new entries are added frequently, that's a poor
user experience. Cursor pagination anchors to a specific position in the result set and is
stable under inserts.

## Cursor design

The cursor encodes `(createdAt, id)` — the two fields that fully identify a position in the
sort order — as a `|`-delimited string, base64-encoded.

**Why both fields?**
Notes are sorted by `created_at DESC, id ASC`. `created_at` has millisecond precision, so
two notes created within the same millisecond have the same primary sort key. Without `id`
as a tiebreaker the pagination boundary would be ambiguous. Including `id` makes the cursor
exact.

**Why base64?**
The encoding keeps the token opaque. Clients must treat it as an arbitrary string and pass
it back verbatim — they should not parse, construct, or modify it. This gives us freedom to
change the internal format later (different fields, different separator, encryption) without
a breaking API change.

## Next-page detection

The query fetches `PAGE_SIZE + 1` rows rather than `PAGE_SIZE`. If the result set contains
more than `PAGE_SIZE` rows we know a next page exists; we return only the first `PAGE_SIZE`
rows and compute a cursor from the last one. This avoids a separate `COUNT(*)` query.

## The WHERE clause

```sql
WHERE (created_at < ?) OR (created_at = ? AND id > ?)
```

This resumes after the cursor row: "all rows that come after the cursor in the sort order."
- `created_at < ?` — any row older than the cursor row
- `created_at = ? AND id > ?` — rows with the same timestamp but a lexicographically larger
  id (because the secondary sort is `id ASC`)
