import { getDb } from './db';
import {
  getSiteLink,
  getUserConnection,
  getDecryptedRefreshToken,
  refreshAccessToken,
  querySearchAnalytics,
  isGscConfigured,
} from './gsc';

const SQL_UPSERT_QUERY = `
  INSERT INTO gsc_daily (site_id, date, query, page, clicks, impressions, ctr, position)
  VALUES (?, ?, ?, '', ?, ?, ?, ?)
  ON CONFLICT(site_id, date, query, page) DO UPDATE SET
    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
`;
const SQL_UPSERT_PAGE = `
  INSERT INTO gsc_daily_pages (site_id, date, page, clicks, impressions, ctr, position)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(site_id, date, page) DO UPDATE SET
    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
`;
const SQL_UPSERT_TOTAL = `
  INSERT INTO gsc_daily_totals (site_id, date, clicks, impressions, ctr, position)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(site_id, date) DO UPDATE SET
    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
`;
const SQL_UPSERT_COUNTRY = `
  INSERT INTO gsc_daily_countries (site_id, date, country, clicks, impressions, ctr, position)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(site_id, date, country) DO UPDATE SET
    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
`;
const SQL_UPSERT_DEVICE = `
  INSERT INTO gsc_daily_devices (site_id, date, device, clicks, impressions, ctr, position)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(site_id, date, device) DO UPDATE SET
    clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
`;

// Google Search Console data lags 2-3 days behind real time.
const GSC_LAG_DAYS = 2;
// How far back a backfill reaches. Rows older than this are pruned after each sync.
const RETENTION_DAYS = 90;
// A sync that has been marked 'syncing' for longer than this is treated as dead,
// not in-flight. Without this a crashed run would block the site forever.
const STALE_SYNC_MINUTES = 20;

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function daysBetween(isoA, isoB) {
  return Math.round((Date.parse(isoA + 'T00:00:00Z') - Date.parse(isoB + 'T00:00:00Z')) / 86400000);
}

/**
 * Newest day we actually hold rows for, or null if the site has no data at all.
 */
async function newestStoredDate(db, siteId) {
  const row = await db
    .prepare('SELECT MAX(date) AS d FROM gsc_daily_totals WHERE site_id = ?')
    .get(siteId);
  return row?.d || null;
}

/**
 * Decide the window to fetch. An incremental sync only re-fetches the last few
 * days, but if stored data has fallen behind (a missed cron, a failed run, a
 * newly linked property) we widen the window to cover the gap. Without this a
 * single missed window leaves a hole that never heals.
 */
export async function resolveSyncWindow(db, siteId, { backfill = false } = {}) {
  const endDate = fmtDate(daysAgo(GSC_LAG_DAYS));
  if (backfill) {
    return { startDate: fmtDate(daysAgo(RETENTION_DAYS + 2)), endDate, mode: 'backfill' };
  }

  const newest = await newestStoredDate(db, siteId);
  if (!newest) {
    return { startDate: fmtDate(daysAgo(RETENTION_DAYS + 2)), endDate, mode: 'backfill' };
  }

  // Re-fetch from the day before our newest row: GSC revises recent days.
  const gap = daysBetween(endDate, newest);
  if (gap > RETENTION_DAYS) {
    return { startDate: fmtDate(daysAgo(RETENTION_DAYS + 2)), endDate, mode: 'backfill' };
  }
  const lookback = Math.min(Math.max(gap + 1, 3), RETENTION_DAYS + 2);
  return { startDate: fmtDate(daysAgo(GSC_LAG_DAYS + lookback)), endDate, mode: gap > 3 ? 'gap-fill' : 'incremental' };
}

/**
 * Sync a single site. `backfill` forces the full retention window; otherwise the
 * window is derived from what is already stored (see resolveSyncWindow).
 */
export async function syncSite(siteId, { backfill = false } = {}) {
  const db = await getDb();
  const link = await getSiteLink(siteId);
  if (!link) return { skipped: true };

  const site = await db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId);
  if (!site) return { skipped: true };

  const userConn = await getUserConnection(site.user_id);
  if (!userConn) {
    await db.prepare("UPDATE gsc_site_links SET status='error', last_error=? WHERE site_id=?").run('User Google account not connected', siteId);
    return { error: 'no user connection' };
  }

  const fail = async (message) => {
    await db
      .prepare("UPDATE gsc_site_links SET status='error', last_error=? WHERE site_id=?")
      .run(String(message).slice(0, 500), siteId);
    return { error: message };
  };

  const { startDate, endDate, mode } = await resolveSyncWindow(db, siteId, { backfill });

  await db
    .prepare("UPDATE gsc_site_links SET status='syncing', last_error=NULL, sync_started_at=datetime('now') WHERE site_id=?")
    .run(siteId);

  let accessToken;
  try {
    accessToken = await refreshAccessToken(getDecryptedRefreshToken(userConn));
  } catch (err) {
    return fail(err.message);
  }

  let queryRows, pageRows, totalRows, countryRows, deviceRows;
  try {
    [queryRows, pageRows, totalRows, countryRows, deviceRows] = await Promise.all([
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['date', 'query'], rowLimit: 25000 }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['date', 'page'], rowLimit: 25000 }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['date'], rowLimit: 1000 }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['date', 'country'], rowLimit: 25000 }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['date', 'device'], rowLimit: 5000 }),
    ]);
  } catch (err) {
    return fail(err.message);
  }

  // Collect every write up front and send it through db.batch(). On D1 each
  // prepare().run() is a separate round trip, so a backfill issued one row at a
  // time blows past the per-invocation subrequest limit and the run dies
  // half-written with the link stuck on 'syncing'. Batching keeps a 90-day
  // backfill to a few dozen round trips.
  const statements = [];
  const push = (sql, keys, r, arity) => {
    if (keys.length !== arity || keys.some((k) => !k)) return;
    statements.push({ sql, params: [siteId, ...keys, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0] });
  };

  for (const r of queryRows) push(SQL_UPSERT_QUERY, r.keys || [], r, 2);
  for (const r of pageRows) push(SQL_UPSERT_PAGE, r.keys || [], r, 2);
  for (const r of totalRows) push(SQL_UPSERT_TOTAL, r.keys || [], r, 1);
  for (const r of countryRows) push(SQL_UPSERT_COUNTRY, r.keys || [], r, 2);
  for (const r of deviceRows) push(SQL_UPSERT_DEVICE, r.keys || [], r, 2);

  try {
    await db.batch(statements);

    await db.batch([
      { sql: `DELETE FROM gsc_daily WHERE site_id = ? AND date < date('now','-${RETENTION_DAYS} days')`, params: [siteId] },
      { sql: `DELETE FROM gsc_daily_pages WHERE site_id = ? AND date < date('now','-${RETENTION_DAYS} days')`, params: [siteId] },
      { sql: `DELETE FROM gsc_daily_totals WHERE site_id = ? AND date < date('now','-${RETENTION_DAYS} days')`, params: [siteId] },
      { sql: `DELETE FROM gsc_daily_countries WHERE site_id = ? AND date < date('now','-${RETENTION_DAYS} days')`, params: [siteId] },
      { sql: `DELETE FROM gsc_daily_devices WHERE site_id = ? AND date < date('now','-${RETENTION_DAYS} days')`, params: [siteId] },
    ]);

    await computeTrends(siteId);
  } catch (err) {
    return fail(err.message);
  }

  await db.prepare("UPDATE gsc_site_links SET status='active', last_sync_at=datetime('now'), last_error=NULL WHERE site_id=?").run(siteId);

  return { mode, startDate, endDate, rows: statements.length, queries: queryRows.length, pages: pageRows.length, days: totalRows.length };
}

export async function computeTrends(siteId) {
  const db = await getDb();
  // current 28d window: dates >= today-30 and <= today-2
  // previous 28d window: dates >= today-58 and <= today-30
  const aggregate = await db.prepare(`
    SELECT query,
      SUM(CASE WHEN date >= date('now','-30 days') THEN clicks ELSE 0 END) AS clicks_28d,
      SUM(CASE WHEN date < date('now','-30 days') AND date >= date('now','-58 days') THEN clicks ELSE 0 END) AS clicks_prev_28d,
      SUM(CASE WHEN date >= date('now','-30 days') THEN impressions ELSE 0 END) AS imps_28d,
      SUM(CASE WHEN date < date('now','-30 days') AND date >= date('now','-58 days') THEN impressions ELSE 0 END) AS imps_prev_28d,
      AVG(CASE WHEN date >= date('now','-30 days') THEN position ELSE NULL END) AS pos_28d,
      AVG(CASE WHEN date < date('now','-30 days') AND date >= date('now','-58 days') THEN position ELSE NULL END) AS pos_prev_28d
    FROM gsc_daily
    WHERE site_id = ?
    GROUP BY query
  `).all(siteId);

  const insertSql = `
    INSERT INTO gsc_trends (site_id, query, clicks_28d, clicks_prev_28d, delta_clicks,
      impressions_28d, impressions_prev_28d, position_28d, position_prev_28d, delta_position, ctr_28d, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;

  const statements = [{ sql: 'DELETE FROM gsc_trends WHERE site_id = ?', params: [siteId] }];

  for (const r of aggregate) {
    const clicks28 = r.clicks_28d || 0;
    const clicksPrev = r.clicks_prev_28d || 0;
    const imps28 = r.imps_28d || 0;
    const impsPrev = r.imps_prev_28d || 0;
    const pos28 = r.pos_28d || 0;
    const posPrev = r.pos_prev_28d || 0;
    const deltaClicks = clicks28 - clicksPrev;
    // Position: lower is better, so delta is prev - current (positive = improved)
    const deltaPosition = posPrev && pos28 ? posPrev - pos28 : 0;
    const ctr = imps28 > 0 ? clicks28 / imps28 : 0;

    let status;
    if (clicksPrev === 0 && clicks28 > 0) status = 'new';
    else if (clicks28 === 0 && clicksPrev > 0) status = 'lost';
    else if (deltaClicks > 0 || deltaPosition > 0.5) status = 'growing';
    else if (deltaClicks < 0 || deltaPosition < -0.5) status = 'declining';
    else status = 'stable';

    statements.push({
      sql: insertSql,
      params: [siteId, r.query, clicks28, clicksPrev, deltaClicks, imps28, impsPrev, pos28, posPrev, deltaPosition, ctr, status],
    });
  }

  await db.batch(statements);
}

/**
 * Sync every linked site whose data has gone stale. Called by the Cloudflare
 * cron trigger (see worker-entry.js) and by the Node instrumentation loop.
 */
export async function syncAllConnections({ maxAgeHours = 12, force = false } = {}) {
  if (!(await isGscConfigured())) return { skipped: 'not configured' };
  const db = await getDb();
  const conns = await db
    .prepare('SELECT site_id, last_sync_at, status, sync_started_at FROM gsc_site_links')
    .all();
  const results = [];
  const skipped = [];

  for (const c of conns) {
    if (!force) {
      // A run that is genuinely in flight should not be started twice. One that
      // died mid-write leaves status='syncing' forever, so only respect the flag
      // while it is fresh.
      if (c.status === 'syncing' && c.sync_started_at) {
        const startedMs = Date.now() - new Date(c.sync_started_at + 'Z').getTime();
        if (startedMs < STALE_SYNC_MINUTES * 60 * 1000) {
          skipped.push({ siteId: c.site_id, reason: 'in progress' });
          continue;
        }
      }
      if (c.last_sync_at && c.status !== 'error') {
        const last = new Date(c.last_sync_at + 'Z').getTime();
        if (Date.now() - last < maxAgeHours * 60 * 60 * 1000) {
          skipped.push({ siteId: c.site_id, reason: 'fresh' });
          continue;
        }
      }
    }
    try {
      const r = await syncSite(c.site_id);
      results.push({ siteId: c.site_id, ...r });
    } catch (err) {
      results.push({ siteId: c.site_id, error: err.message });
    }
  }
  return { synced: results.length, results, skipped };
}
