-- Visitor IP as seen by Cloudflare. Filled on the next request after this migration.
-- Mirrors Migration 15 in src/lib/migrations.js.

ALTER TABLE sessions ADD COLUMN ip TEXT;
