# Notes — cursor pagination

## Cursor vs offset pagination

We use cursor pagination rather than offset (`LIMIT n OFFSET k`). Offset breaks under
concurrent inserts — if a note is added between page 1 and page 2, every row shifts and the
client either skips a note or sees a duplicate. For this app that's unlikely to matter in
practice, but cursor pagination is no harder to implement once you have the WHERE clause, so
it's the right default.

## Cursor design

The cursor encodes `(createdAt, id)` as a `|`-delimited string, base64-encoded.

**Why both fields?**
Notes are sorted by `created_at DESC, id ASC`. `created_at` has millisecond precision, so
two notes created within the same millisecond have the same primary sort key. Without `id`
as a tiebreaker the pagination boundary would be ambiguous.

**Why base64?**
Keeps the token opaque — callers must treat it as an arbitrary string, not something to
construct themselves. This lets us change the internal format later without a breaking API
change.
