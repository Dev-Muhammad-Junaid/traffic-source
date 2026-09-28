-- Bing Webmaster search performance, stored per linked site.
-- Mirrors Migration 14 in src/lib/migrations.js.

CREATE TABLE IF NOT EXISTS bing_site_links (
  site_id INTEGER PRIMARY KEY,
  bing_url TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  last_sync_at TEXT,
  last_error TEXT,
  sync_started_at TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bing_daily (
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  PRIMARY KEY (site_id, date)
);

CREATE TABLE IF NOT EXISTS bing_queries (
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  avg_click_position REAL,
  avg_impression_position REAL,
  PRIMARY KEY (site_id, date, query)
);

CREATE TABLE IF NOT EXISTS bing_pages (
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  avg_click_position REAL,
  avg_impression_position REAL,
  PRIMARY KEY (site_id, date, page)
);

CREATE TABLE IF NOT EXISTS bing_crawl (
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  crawled_pages INTEGER DEFAULT 0,
  crawl_errors INTEGER DEFAULT 0,
  in_index INTEGER DEFAULT 0,
  in_links INTEGER DEFAULT 0,
  code_2xx INTEGER DEFAULT 0,
  code_4xx INTEGER DEFAULT 0,
  code_5xx INTEGER DEFAULT 0,
  blocked_robots INTEGER DEFAULT 0,
  PRIMARY KEY (site_id, date)
);

CREATE INDEX IF NOT EXISTS idx_bing_queries_site_date ON bing_queries(site_id, date);
CREATE INDEX IF NOT EXISTS idx_bing_pages_site_date ON bing_pages(site_id, date);
