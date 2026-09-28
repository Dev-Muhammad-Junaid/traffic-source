import { getDb } from './db';
import { bingGet, getBingApiKey, hostOf, listBingSites, parseBingDate } from './bing';

const STALE_SYNC_MINUTES = 20;

async function replaceRows(db, table, siteId, statements) {
  const wipe = { sql: `DELETE FROM ${table} WHERE site_id = ?`, params: [siteId] };
  const all = [wipe, ...statements];
  if (db.batch) {
    await db.batch(all);
    return;
  }
  for (const statement of all) {
    await db.prepare(statement.sql).run(...statement.params);
  }
}

export async function autoLinkSites(userId) {
  const db = await getDb();
  const sites = userId
    ? await db.prepare('SELECT id, domain FROM sites WHERE user_id = ?').all(userId)
    : await db.prepare('SELECT id, domain FROM sites').all();
  const bingSites = (await listBingSites()).filter((site) => site.IsVerified);
  const linked = [];
  for (const site of sites) {
    const host = hostOf(site.domain);
    const match = bingSites.find((row) => hostOf(row.Url) === host);
    if (!match) continue;
    await db.prepare(`
      INSERT INTO bing_site_links (site_id, bing_url, status, last_error)
      VALUES (?, ?, 'active', NULL)
      ON CONFLICT(site_id) DO UPDATE SET bing_url = excluded.bing_url, last_error = NULL
    `).run(site.id, match.Url);
    linked.push({ id: site.id, domain: site.domain, bingUrl: match.Url });
  }
  return linked;
}

export async function syncBingSite(siteId) {
  const db = await getDb();
  const link = await db.prepare('SELECT * FROM bing_site_links WHERE site_id = ?').get(siteId);
  if (!link) return { skipped: true, reason: 'not linked' };
  if (!(await getBingApiKey())) return { skipped: true, reason: 'no api key' };

  await db.prepare(
    "UPDATE bing_site_links SET status = 'syncing', last_error = NULL, sync_started_at = datetime('now') WHERE site_id = ?"
  ).run(siteId);

  const fail = async (message) => {
    await db.prepare(
      "UPDATE bing_site_links SET status = 'error', last_error = ? WHERE site_id = ?"
    ).run(String(message).slice(0, 500), siteId);
    return { error: message };
  };

  let traffic, queries, pages, crawl;
  try {
    traffic = await bingGet('GetRankAndTrafficStats', { siteUrl: link.bing_url });
    queries = await bingGet('GetQueryStats', { siteUrl: link.bing_url });
    pages = await bingGet('GetPageStats', { siteUrl: link.bing_url });
    crawl = await bingGet('GetCrawlStats', { siteUrl: link.bing_url });
  } catch (err) {
    return fail(err.message);
  }

  await replaceRows(db, 'bing_daily', siteId, traffic.map((row) => ({
    sql: `INSERT INTO bing_daily (site_id, date, clicks, impressions) VALUES (?, ?, ?, ?)
          ON CONFLICT(site_id, date) DO UPDATE SET clicks = excluded.clicks, impressions = excluded.impressions`,
    params: [siteId, parseBingDate(row.Date), row.Clicks || 0, row.Impressions || 0],
  })));

  await replaceRows(db, 'bing_queries', siteId, queries.filter((row) => row.Query).map((row) => ({
    sql: `INSERT INTO bing_queries (site_id, date, query, clicks, impressions, avg_click_position, avg_impression_position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date, query) DO UPDATE SET
            clicks = excluded.clicks, impressions = excluded.impressions,
            avg_click_position = excluded.avg_click_position,
            avg_impression_position = excluded.avg_impression_position`,
    params: [
      siteId, parseBingDate(row.Date), String(row.Query).slice(0, 500),
      row.Clicks || 0, row.Impressions || 0,
      row.AvgClickPosition ?? null, row.AvgImpressionPosition ?? null,
    ],
  })));

  await replaceRows(db, 'bing_pages', siteId, pages.filter((row) => row.Query).map((row) => ({
    sql: `INSERT INTO bing_pages (site_id, date, page, clicks, impressions, avg_click_position, avg_impression_position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date, page) DO UPDATE SET
            clicks = excluded.clicks, impressions = excluded.impressions,
            avg_click_position = excluded.avg_click_position,
            avg_impression_position = excluded.avg_impression_position`,
    params: [
      siteId, parseBingDate(row.Date), String(row.Query).slice(0, 1000),
      row.Clicks || 0, row.Impressions || 0,
      row.AvgClickPosition ?? null, row.AvgImpressionPosition ?? null,
    ],
  })));

  await replaceRows(db, 'bing_crawl', siteId, crawl.map((row) => ({
    sql: `INSERT INTO bing_crawl (
            site_id, date, crawled_pages, crawl_errors, in_index, in_links,
            code_2xx, code_4xx, code_5xx, blocked_robots
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id, date) DO UPDATE SET
            crawled_pages = excluded.crawled_pages, crawl_errors = excluded.crawl_errors,
            in_index = excluded.in_index, in_links = excluded.in_links,
            code_2xx = excluded.code_2xx, code_4xx = excluded.code_4xx,
            code_5xx = excluded.code_5xx, blocked_robots = excluded.blocked_robots`,
    params: [
      siteId, parseBingDate(row.Date),
      row.CrawledPages || 0, row.CrawlErrors || 0, row.InIndex || 0, row.InLinks || 0,
      row.Code2xx || 0, row.Code4xx || 0, row.Code5xx || 0, row.BlockedByRobotsTxt || 0,
    ],
  })));

  await db.prepare(
    "UPDATE bing_site_links SET status = 'active', last_sync_at = datetime('now'), last_error = NULL WHERE site_id = ?"
  ).run(siteId);

  return {
    ok: true,
    traffic: traffic.length,
    queries: queries.length,
    pages: pages.length,
    crawl: crawl.length,
  };
}

export async function syncAllBing({ maxAgeHours = 20, force = false, userId = null } = {}) {
  if (!(await getBingApiKey())) return { skipped: 'not configured' };
  await autoLinkSites(userId);
  const db = await getDb();
  const links = userId
    ? await db.prepare(
      `SELECT l.site_id, l.last_sync_at, l.status, l.sync_started_at
       FROM bing_site_links l INNER JOIN sites s ON s.id = l.site_id WHERE s.user_id = ?`
    ).all(userId)
    : await db.prepare('SELECT site_id, last_sync_at, status, sync_started_at FROM bing_site_links').all();

  const results = [];
  const skipped = [];
  for (const link of links) {
    if (link.status === 'syncing' && link.sync_started_at) {
      const started = Date.now() - new Date(link.sync_started_at.replace(' ', 'T') + 'Z').getTime();
      if (started < STALE_SYNC_MINUTES * 60 * 1000) {
        skipped.push({ siteId: link.site_id, reason: 'in progress' });
        continue;
      }
    }
    if (!force && link.last_sync_at && link.status !== 'error') {
      const last = new Date(link.last_sync_at.replace(' ', 'T') + 'Z').getTime();
      if (Date.now() - last < maxAgeHours * 60 * 60 * 1000) {
        skipped.push({ siteId: link.site_id, reason: 'fresh' });
        continue;
      }
    }
    try {
      results.push({ siteId: link.site_id, ...(await syncBingSite(link.site_id)) });
    } catch (err) {
      results.push({ siteId: link.site_id, error: err.message });
    }
  }
  return { synced: results.length, results, skipped };
}
