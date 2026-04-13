const migrations = [
  // Migration 1: Core schema
  (db) => {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, domain)
      );

      CREATE TABLE sessions (
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

      CREATE TABLE page_views (
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

      CREATE TABLE conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        session_id TEXT,
        visitor_id TEXT,
        stripe_event_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        stripe_customer_email TEXT,
        payment_intent_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'usd',
        status TEXT NOT NULL,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        referrer_domain TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE daily_stats (
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

      CREATE INDEX idx_sessions_site_started ON sessions(site_id, started_at);
      CREATE INDEX idx_sessions_visitor ON sessions(visitor_id);
      CREATE INDEX idx_sessions_referrer ON sessions(site_id, referrer_domain);
      CREATE INDEX idx_sessions_utm ON sessions(site_id, utm_source, utm_medium, utm_campaign);
      CREATE INDEX idx_sessions_country ON sessions(site_id, country);
      CREATE INDEX idx_sessions_browser ON sessions(site_id, browser);
      CREATE INDEX idx_sessions_os ON sessions(site_id, os);

      CREATE INDEX idx_page_views_site_time ON page_views(site_id, timestamp);
      CREATE INDEX idx_page_views_session ON page_views(session_id);
      CREATE INDEX idx_page_views_pathname ON page_views(site_id, pathname);

      CREATE INDEX idx_conversions_site ON conversions(site_id, created_at);
      CREATE INDEX idx_conversions_visitor ON conversions(visitor_id);
      CREATE INDEX idx_conversions_session ON conversions(session_id);

      CREATE INDEX idx_daily_stats_site_date ON daily_stats(site_id, date);
    `);
  },
  // Migration 2: Per-site Stripe keys
  (db) => {
    db.exec(`
      ALTER TABLE sites ADD COLUMN stripe_secret_key TEXT;
      ALTER TABLE sites ADD COLUMN stripe_webhook_secret TEXT;
    `);
  },
  // Migration 3: Index for realtime active users query
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_site_last_activity ON sessions(site_id, last_activity);
    `);
  },
  // Migration 4: Affiliate tracking
  (db) => {
    db.exec(`
      CREATE TABLE affiliates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        commission_rate REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE(site_id, slug)
      );

      CREATE TABLE affiliate_visits (
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

      ALTER TABLE conversions ADD COLUMN affiliate_id INTEGER REFERENCES affiliates(id);

      CREATE INDEX idx_affiliates_site ON affiliates(site_id);
      CREATE INDEX idx_affiliates_slug ON affiliates(site_id, slug);
      CREATE INDEX idx_affiliate_visits_affiliate ON affiliate_visits(affiliate_id);
      CREATE INDEX idx_affiliate_visits_site ON affiliate_visits(site_id, landed_at);
      CREATE INDEX idx_affiliate_visits_visitor ON affiliate_visits(visitor_id);
      CREATE INDEX idx_conversions_affiliate ON conversions(affiliate_id);
    `);
  },
  // Migration 5: Affiliate share tokens for public dashboards
  (db) => {
    db.exec(`
      ALTER TABLE affiliates ADD COLUMN share_token TEXT;
      CREATE UNIQUE INDEX idx_affiliates_share_token ON affiliates(share_token);
    `);
  },
  // Migration 6: Google Search Console integration
  (db) => {
    db.exec(`
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE gsc_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL UNIQUE,
        google_email TEXT,
        refresh_token TEXT NOT NULL,
        gsc_property TEXT,
        status TEXT DEFAULT 'pending',
        last_sync_at TEXT,
        last_error TEXT,
        connected_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE gsc_daily (
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

      CREATE TABLE gsc_trends (
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

      CREATE INDEX idx_gsc_daily_site_date ON gsc_daily(site_id, date);
      CREATE INDEX idx_gsc_daily_site_query ON gsc_daily(site_id, query);
      CREATE INDEX idx_gsc_trends_site_status ON gsc_trends(site_id, status);
    `);
  },
  // Migration 7: Move GSC OAuth to user-level; add per-site property links
  (db) => {
    db.exec(`
      DROP TABLE IF EXISTS gsc_connections;

      CREATE TABLE gsc_connections (
        user_id INTEGER PRIMARY KEY,
        google_email TEXT,
        refresh_token TEXT NOT NULL,
        connected_at TEXT DEFAULT (datetime('now')),
        last_error TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE gsc_site_links (
        site_id INTEGER PRIMARY KEY,
        gsc_property TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        last_sync_at TEXT,
        last_error TEXT,
        linked_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );
    `);
  },
  // Migration 8: Separate page-level + totals tables (avoid anonymized-query undercount)
  (db) => {
    db.exec(`
      CREATE TABLE gsc_daily_pages (
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
      CREATE INDEX idx_gsc_pages_site_date ON gsc_daily_pages(site_id, date);

      CREATE TABLE gsc_daily_totals (
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
      CREATE INDEX idx_gsc_totals_site_date ON gsc_daily_totals(site_id, date);
    `);
  },
  // Migration 9: Countries + devices breakdowns
  (db) => {
    db.exec(`
      CREATE TABLE gsc_daily_countries (
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
      CREATE INDEX idx_gsc_countries_site_date ON gsc_daily_countries(site_id, date);

      CREATE TABLE gsc_daily_devices (
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
      CREATE INDEX idx_gsc_devices_site_date ON gsc_daily_devices(site_id, date);
    `);
  },
  // Migration 10: Backup history
  (db) => {
    db.exec(`
      CREATE TABLE backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        storage_provider TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        error TEXT
      );
    `);
  },
  // Migration 11: Public sharing for sites
  (db) => {
    db.exec(`
      ALTER TABLE sites ADD COLUMN is_public INTEGER DEFAULT 0;
      ALTER TABLE sites ADD COLUMN public_slug TEXT;
      CREATE UNIQUE INDEX idx_sites_public_slug ON sites(public_slug);
    `);
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = db.prepare('SELECT id FROM _migrations ORDER BY id').all();
  const appliedIds = new Set(applied.map((r) => r.id));

  for (let i = 0; i < migrations.length; i++) {
    if (!appliedIds.has(i + 1)) {
      migrations[i](db);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(i + 1);
    }
  }
}
