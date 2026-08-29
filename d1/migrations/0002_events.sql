-- 0002_events.sql — custom event tracking
--
-- Adds a first-class events table so sites can record arbitrary named
-- interactions (button clicks, signups, plan selections) alongside pageviews.
-- Events deliberately do NOT feed daily_stats.page_views or clear a session's
-- bounce flag, so adding event tracking never distorts existing metrics.

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pathname TEXT,
  props TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_site_time ON events(site_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_site_name ON events(site_id, name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(site_id, visitor_id);
