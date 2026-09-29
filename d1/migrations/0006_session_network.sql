-- Public network facts Cloudflare already attaches to the request.
-- Mirrors Migration 16 in src/lib/migrations.js.

ALTER TABLE sessions ADD COLUMN region TEXT;
ALTER TABLE sessions ADD COLUMN timezone TEXT;
ALTER TABLE sessions ADD COLUMN isp TEXT;
ALTER TABLE sessions ADD COLUMN asn TEXT;
