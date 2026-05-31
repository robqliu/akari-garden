CREATE TABLE crops (id INTEGER PRIMARY KEY);
INSERT INTO crops (id) VALUES (1),(2),(3),(4),(5),(6);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE note_crops (
  note_id TEXT    NOT NULL REFERENCES notes(id),
  crop_id INTEGER NOT NULL REFERENCES crops(id),
  PRIMARY KEY (note_id, crop_id)
);

CREATE INDEX idx_note_crops_crop ON note_crops(crop_id, note_id);
CREATE INDEX idx_notes_created ON notes(created_by, created_at);
