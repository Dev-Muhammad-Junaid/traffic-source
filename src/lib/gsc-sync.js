import { getDb } from './db';
import {
  getSiteLink,
  getUserConnection,
  getDecryptedRefreshToken,
  refreshAccessToken,
  querySearchAnalytics,
  isGscConfigured,
} from './gsc';

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/**
 * Sync a single site. If `backfill` is true, fetches the full 90-day window;
 * otherwise fetches just yesterday's data (incremental).
 */
export async function syncSite(siteId, { backfill = false } = {}) {
  const db = getDb();
  const link = getSiteLink(siteId);
  if (!link) return { skipped: true };

  const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId);
  if (!site) return { skipped: true };

  const userConn = getUserConnection(site.user_id);
  if (!userConn) {
    db.prepare("UPDATE gsc_site_links SET status='error', last_error=? WHERE site_id=?").run('User Google account not connected', siteId);
    return { error: 'no user connection' };
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(getDecryptedRefreshToken(userConn));
  } catch (err) {
    db.prepare("UPDATE gsc_site_links SET status='error', last_error=? WHERE site_id=?").run(err.message, siteId);
    return { error: err.message };
  }

  // GSC data lags ~2-3 days
  const endDate = fmtDate(daysAgo(2));
  const startDate = backfill ? fmtDate(daysAgo(92)) : fmtDate(daysAgo(3));

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
    db.prepare("UPDATE gsc_site_links SET status='error', last_error=? WHERE site_id=?").run(err.message, siteId);
    return { error: err.message };
  }

  const upsertQuery = db.prepare(`
    INSERT INTO gsc_daily (site_id, date, query, page, clicks, impressions, ctr, position)
    VALUES (?, ?, ?, '', ?, ?, ?, ?)
    ON CONFLICT(site_id, date, query, page) DO UPDATE SET
      clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
  `);
  const upsertPage = db.prepare(`
    INSERT INTO gsc_daily_pages (site_id, date, page, clicks, impressions, ctr, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, date, page) DO UPDATE SET
      clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
  `);
  const upsertTotal = db.prepare(`
    INSERT INTO gsc_daily_totals (site_id, date, clicks, impressions, ctr, position)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, date) DO UPDATE SET
      clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
  `);
  const upsertCountry = db.prepare(`
    INSERT INTO gsc_daily_countries (site_id, date, country, clicks, impressions, ctr, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, date, country) DO UPDATE SET
      clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
  `);
  const upsertDevice = db.prepare(`
    INSERT INTO gsc_daily_devices (site_id, date, device, clicks, impressions, ctr, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, date, device) DO UPDATE SET
      clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position
  `);

  const tx = db.transaction(() => {
    for (const r of queryRows) {
      const [date, query] = r.keys || [];
      if (!date || !query) continue;
      upsertQuery.run(siteId, date, query, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
    }
    for (const r of pageRows) {
      const [date, page] = r.keys || [];
      if (!date || !page) continue;
      upsertPage.run(siteId, date, page, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
    }
    for (const r of totalRows) {
      const [date] = r.keys || [];
      if (!date) continue;
      upsertTotal.run(siteId, date, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
    }
    for (const r of countryRows) {
      const [date, country] = r.keys || [];
      if (!date || !country) continue;
      upsertCountry.run(siteId, date, country, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
    }
    for (const r of deviceRows) {
      const [date, device] = r.keys || [];
      if (!date || !device) continue;
      upsertDevice.run(siteId, date, device, r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0);
    }
  });
  tx();

  // 90-day prune
  db.prepare("DELETE FROM gsc_daily WHERE site_id = ? AND date < date('now','-90 days')").run(siteId);
  db.prepare("DELETE FROM gsc_daily_pages WHERE site_id = ? AND date < date('now','-90 days')").run(siteId);
  db.prepare("DELETE FROM gsc_daily_totals WHERE site_id = ? AND date < date('now','-90 days')").run(siteId);
  db.prepare("DELETE FROM gsc_daily_countries WHERE site_id = ? AND date < date('now','-90 days')").run(siteId);
  db.prepare("DELETE FROM gsc_daily_devices WHERE site_id = ? AND date < date('now','-90 days')").run(siteId);

  // Recompute trends
  computeTrends(siteId);

  db.prepare("UPDATE gsc_site_links SET status='active', last_sync_at=datetime('now'), last_error=NULL WHERE site_id=?").run(siteId);

  return { queries: queryRows.length, pages: pageRows.length, days: totalRows.length };
}

export function computeTrends(siteId) {
  const db = getDb();
  // current 28d window: dates >= today-30 and <= today-2
  // previous 28d window: dates >= today-58 and <= today-30
  const aggregate = db.prepare(`
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

  db.prepare('DELETE FROM gsc_trends WHERE site_id = ?').run(siteId);

  const insert = db.prepare(`
    INSERT INTO gsc_trends (site_id, query, clicks_28d, clicks_prev_28d, delta_clicks,
      impressions_28d, impressions_prev_28d, position_28d, position_prev_28d, delta_position, ctr_28d, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
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

      insert.run(siteId, r.query, clicks28, clicksPrev, deltaClicks, imps28, impsPrev, pos28, posPrev, deltaPosition, ctr, status);
    }
  });
  tx(aggregate);
}

export async function syncAllConnections() {
  if (!isGscConfigured()) return { skipped: 'not configured' };
  const db = getDb();
  const conns = db.prepare("SELECT site_id, last_sync_at FROM gsc_site_links").all();
  const results = [];
  for (const c of conns) {
    // Only sync if last_sync_at is null or older than 12 hours
    if (c.last_sync_at) {
      const last = new Date(c.last_sync_at + 'Z').getTime();
      if (Date.now() - last < 12 * 60 * 60 * 1000) continue;
    }
    try {
      const r = await syncSite(c.site_id, { backfill: !c.last_sync_at });
      results.push({ siteId: c.site_id, ...r });
    } catch (err) {
      results.push({ siteId: c.site_id, error: err.message });
    }
  }
  return { synced: results.length, results };
}
