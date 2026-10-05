-- Extend external reporting views: also drop today's browser smoke + smoketest% prefix.
-- Raw sessions/events/page_views unchanged. Replaces definitions from 0008.

DROP VIEW IF EXISTS v_events_external;
DROP VIEW IF EXISTS v_page_views_external;
DROP VIEW IF EXISTS v_sessions_external;

CREATE VIEW v_sessions_external AS
SELECT *
FROM sessions
WHERE COALESCE(country, '') != 'PK'
  AND id != 'smokesid1'
  AND id != 'muutdr4n98011b6g3'
  AND id NOT LIKE 'smoketest%'
  AND COALESCE(referrer, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(referrer, '') NOT LIKE '%localhost%'
  AND COALESCE(referrer_domain, '') NOT LIKE '%127.0.0.1%'
  AND COALESCE(referrer_domain, '') NOT LIKE '%localhost%';

CREATE VIEW v_events_external AS
SELECT e.*
FROM events e
INNER JOIN v_sessions_external s ON s.id = e.session_id;

CREATE VIEW v_page_views_external AS
SELECT pv.*
FROM page_views pv
INNER JOIN v_sessions_external s ON s.id = pv.session_id;
