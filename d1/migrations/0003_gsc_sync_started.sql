-- 0003_gsc_sync_started.sql — make interrupted GSC syncs recoverable
--
-- gsc_site_links.status was set to 'syncing' at the start of a run and back to
-- 'active' at the end. If the run died in between (Workers subrequest limits
-- during a large backfill, a cancelled waitUntil task) the row stayed on
-- 'syncing' permanently, and every later sync skipped the site as "already in
-- progress". Recording when the run started lets a stale flag time out.
--
-- Mirrors Migration 13 in src/lib/migrations.js so the SQLite (VPS/local) path
-- and the Cloudflare D1 path stay schema-identical.

ALTER TABLE gsc_site_links ADD COLUMN sync_started_at TEXT;

UPDATE gsc_site_links
SET status = 'error',
    last_error = 'Interrupted sync reset by migration'
WHERE status = 'syncing';
