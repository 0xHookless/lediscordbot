CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  on_duty INTEGER NOT NULL DEFAULT 0,
  signature INTEGER NOT NULL DEFAULT 0,
  muted TEXT NOT NULL DEFAULT '[]',
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS read_state (
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  last_read_id TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS dm_channels (
  channel_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  last_message_at INTEGER NOT NULL
);

-- Which staff member sent each bot message from the console.
CREATE TABLE IF NOT EXISTS sent_by (
  message_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue (
  message_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  claimed_by TEXT,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS queue_open ON queue (resolved_at, created_at);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  run_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  message_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled (status, run_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  content TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log (at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
