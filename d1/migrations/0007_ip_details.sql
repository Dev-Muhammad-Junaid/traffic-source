-- Cached public network facts for a visitor IP. Looked up once, then reused.
-- Mirrors Migration 17 in src/lib/migrations.js.

CREATE TABLE IF NOT EXISTS ip_details (
  ip TEXT PRIMARY KEY,
  country TEXT,
  region TEXT,
  city TEXT,
  timezone TEXT,
  isp TEXT,
  org TEXT,
  asn TEXT,
  mobile INTEGER DEFAULT 0,
  proxy INTEGER DEFAULT 0,
  hosting INTEGER DEFAULT 0,
  looked_up_at TEXT DEFAULT (datetime('now'))
);
