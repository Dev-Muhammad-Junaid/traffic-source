# Internal traffic exclusion (reporting)

**Raw data is kept.** Ingest (`/api/collect`) is unchanged. Exclusion is a reporting filter only.

## Rules
A session is **internal** when any of:
1. `sessions.country = 'PK'` (Pakistan — BankSheet founder/ops)
2. `sessions.id = 'smokesid1'` (literal smoke-test session id)
3. `sessions.id = 'muutdr4n98011b6g3'` (2026-10-05 browser smoke)
4. `sessions.id LIKE 'smoketest%'` (curl/ops smoke prefix)
5. `sessions.referrer` or `sessions.referrer_domain` contains `127.0.0.1` or `localhost`

**Future smoke tests must use a session id starting `smoketest` or `smokesid`.**

## How it is applied
- **Dashboard APIs** (`overview`, `events`, `geo`): `src/lib/session-filters.js` → `wantsExcludeInternal` / `buildInternalExclusion`.
  - Query `exclude_internal=1` forces exclusion.
  - Query `exclude_internal=0` includes internal rows.
  - **Default for `site_id=3` (BankSheet / getbanksheet.com): ON.**
  - Other sites: OFF unless `exclude_internal=1`.
- **D1 views** (after migration `0008 + 0009 (`0009_exclude_smoke_session_ids.sql`)`):
  - `v_sessions_external`
  - `v_events_external`
  - `v_page_views_external`

## Ad-hoc SQL (Monday briefs)
```sql
-- External-only events for site 3
SELECT e.*
FROM events e
INNER JOIN sessions s ON s.id = e.session_id
WHERE e.site_id = 3
  AND COALESCE(s.country, '') != 'PK'
  AND s.id != 'smokesid1'
  AND s.id != 'muutdr4n98011b6g3'
  AND s.id NOT LIKE 'smoketest%'
  AND COALESCE(s.referrer, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(s.referrer, '') NOT LIKE '%localhost%'
  AND COALESCE(s.referrer_domain, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(s.referrer_domain, '') NOT LIKE '%localhost%';
```

Or `SELECT * FROM v_events_external WHERE site_id = 3` once the view migration has run.
