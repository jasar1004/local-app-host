CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  subscription TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE reminders (
  device_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  reminder_id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  fire_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, app_id, reminder_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX reminders_due_idx ON reminders(fire_at);
