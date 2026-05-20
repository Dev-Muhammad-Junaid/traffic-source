-- Traffic Source — consolidated schema for Cloudflare D1

CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  is_public INTEGER DEFAULT 0,
  public_slug TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  site_id INTEGER NOT NULL,
  visitor_id TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  last_activity TEXT DEFAULT (datetime('now')),
  entry_page TEXT,
  exit_page TEXT,
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  country TEXT,
  city TEXT,
  continent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device_type TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  page_count INTEGER DEFAULT 1,
  is_bounce INTEGER DEFAULT 1,
  duration INTEGER DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  pathname TEXT NOT NULL,
  hostname TEXT,
  querystring TEXT,
  referrer TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  avg_duration REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date)
);

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  commission_rate REAL DEFAULT 0,
  share_token TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, slug)
);

CREATE TABLE IF NOT EXISTS affiliate_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  site_id INTEGER NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  landing_page TEXT,
  landed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  session_id TEXT,
  visitor_id TEXT,
  stripe_event_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_customer_email TEXT,
  payment_intent_id TEXT,
  affiliate_id INTEGER,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer_domain TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gsc_connections (
  user_id INTEGER PRIMARY KEY,
  google_email TEXT,
  refresh_token TEXT NOT NULL,
  connected_at TEXT DEFAULT (datetime('now')),
  last_error TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gsc_site_links (
  site_id INTEGER PRIMARY KEY,
  gsc_property TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  last_sync_at TEXT,
  last_error TEXT,
  linked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gsc_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  query TEXT NOT NULL,
  page TEXT,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date, query, page)
);

CREATE TABLE IF NOT EXISTS gsc_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  clicks_28d INTEGER DEFAULT 0,
  clicks_prev_28d INTEGER DEFAULT 0,
  delta_clicks INTEGER DEFAULT 0,
  impressions_28d INTEGER DEFAULT 0,
  impressions_prev_28d INTEGER DEFAULT 0,
  position_28d REAL DEFAULT 0,
  position_prev_28d REAL DEFAULT 0,
  delta_position REAL DEFAULT 0,
  ctr_28d REAL DEFAULT 0,
  status TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, query)
);

CREATE TABLE IF NOT EXISTS gsc_daily_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date, page)
);

CREATE TABLE IF NOT EXISTS gsc_daily_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date)
);

CREATE TABLE IF NOT EXISTS gsc_daily_countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  country TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date, country)
);

CREATE TABLE IF NOT EXISTS gsc_daily_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  position REAL DEFAULT 0,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, date, device)
);

CREATE TABLE IF NOT EXISTS backup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  storage_provider TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_site_started ON sessions(site_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_referrer ON sessions(site_id, referrer_domain);
CREATE INDEX IF NOT EXISTS idx_sessions_utm ON sessions(site_id, utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_sessions_country ON sessions(site_id, country);
CREATE INDEX IF NOT EXISTS idx_sessions_browser ON sessions(site_id, browser);
CREATE INDEX IF NOT EXISTS idx_sessions_os ON sessions(site_id, os);
CREATE INDEX IF NOT EXISTS idx_sessions_site_last_activity ON sessions(site_id, last_activity);

CREATE INDEX IF NOT EXISTS idx_page_views_site_time ON page_views(site_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_pathname ON page_views(site_id, pathname);

CREATE INDEX IF NOT EXISTS idx_conversions_site ON conversions(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversions_visitor ON conversions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_conversions_session ON conversions(session_id);
CREATE INDEX IF NOT EXISTS idx_conversions_affiliate ON conversions(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_daily_stats_site_date ON daily_stats(site_id, date);

CREATE INDEX IF NOT EXISTS idx_affiliates_site ON affiliates(site_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_slug ON affiliates(site_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_share_token ON affiliates(share_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_public_slug ON sites(public_slug);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_affiliate ON affiliate_visits(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_visits_site ON affiliate_visits(site_id, landed_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_visits_visitor ON affiliate_visits(visitor_id);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_site_date ON gsc_daily(site_id, date);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_site_query ON gsc_daily(site_id, query);
CREATE INDEX IF NOT EXISTS idx_gsc_trends_site_status ON gsc_trends(site_id, status);
CREATE INDEX IF NOT EXISTS idx_gsc_pages_site_date ON gsc_daily_pages(site_id, date);
CREATE INDEX IF NOT EXISTS idx_gsc_totals_site_date ON gsc_daily_totals(site_id, date);
CREATE INDEX IF NOT EXISTS idx_gsc_countries_site_date ON gsc_daily_countries(site_id, date);
CREATE INDEX IF NOT EXISTS idx_gsc_devices_site_date ON gsc_daily_devices(site_id, date);

INSERT OR IGNORE INTO _migrations (id) VALUES (1);
