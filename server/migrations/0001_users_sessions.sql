CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  calendar_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
