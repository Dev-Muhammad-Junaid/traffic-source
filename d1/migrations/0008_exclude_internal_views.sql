-- Reporting views that hide BankSheet internal/QA traffic while keeping raw tables intact.
-- Rules: country PK, session id smokesid1, localhost/127.0.0.1 referrers.
-- Dashboard APIs apply the same rules via session-filters.js (default ON for site_id=3).

CREATE VIEW IF NOT EXISTS v_sessions_external AS
SELECT *
FROM sessions
WHERE COALESCE(country, '') != 'PK'
  AND id != 'smokesid1'
  AND COALESCE(referrer, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(referrer, '') NOT LIKE '%localhost%'
  AND COALESCE(referrer_domain, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(referrer_domain, '') NOT LIKE '%localhost%';

CREATE VIEW IF NOT EXISTS v_events_external AS
SELECT e.*
FROM events e
INNER JOIN v_sessions_external s ON s.id = e.session_id;

CREATE VIEW IF NOT EXISTS v_page_views_external AS
SELECT pv.*
FROM page_views pv
INNER JOIN v_sessions_external s ON s.id = pv.session_id;
