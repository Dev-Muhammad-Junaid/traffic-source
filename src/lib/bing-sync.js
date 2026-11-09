import { getDb } from './db';
import { bingGet, explainBingError, getBingApiKey, hostOf, listBingSites, parseBingDate } from './bing';

const STALE_SYNC_MINUTES = 20;
const BETWEEN_CALLS_MS = 1500;
const BETWEEN_SITES_MS = 2000;
// One site used to be able to outlive ctx.waitUntil (~30s after the response)
// and die while status was still 'syncing'. Keep the whole site inside that
// window, including the write that records success or the error.
export const SITE_SYNC_BUDGET_MS = 26000;
// Manual Sync now and Settings → sync run in waitUntil. The daily cron does not.
export const BACKGROUND_RUN_BUDGET_MS = 25000;
// Scheduled handlers are killed at 15 minutes of wall time.
export const CRON_RUN_BUDGET_MS = 13 * 60 * 1000;
const MIN_SITE_START_MS = 8000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    // Do not clear last_error here. GetUserSites can succeed and a later stats
    // call can still be throttled, and this loop stops on the first throttle.
    // Wiping the message first hides the failure on every site this run does
    // not reach. syncBingSite clears last_error only after a full save.
    await db.prepare(`
      INSERT INTO bing_site_links (site_id, bing_url, status, last_error)
      VALUES (?, ?, 'active', NULL)
      ON CONFLICT(site_id) DO UPDATE SET bing_url = excluded.bing_url
    `).run(site.id, match.Url);
    linked.push({ id: site.id, domain: site.domain, bingUrl: match.Url });
  }
  return linked;
}

const NO_KEY_MESSAGE = 'Bing Webmaster API key is not configured';

/** Mark linked sites failed so a broken sync is visible instead of going quiet. */
async function recordLinkError(db, message, userId = null) {
  const text = explainBingError(message);
  try {
    if (userId) {
      await db.prepare(
        `UPDATE bing_site_links SET status = 'error', last_error = ?
         WHERE site_id IN (SELECT id FROM sites WHERE user_id = ?)`
      ).run(text, userId);
    } else {
      await db.prepare("UPDATE bing_site_links SET status = 'error', last_error = ?").run(text);
    }
  } catch (err) {
    console.error('Could not record Bing link error:', err?.message || err);
  }
  return text;
}

export async function syncBingSite(siteId, { budgetMs = SITE_SYNC_BUDGET_MS } = {}) {
  const db = await getDb();
  const link = await db.prepare('SELECT * FROM bing_site_links WHERE site_id = ?').get(siteId);
  if (!link) return { skipped: true, reason: 'not linked' };
  if (!(await getBingApiKey())) {
    await db.prepare(
      "UPDATE bing_site_links SET status = 'error', last_error = ? WHERE site_id = ?"
    ).run(NO_KEY_MESSAGE, siteId);
    return { skipped: true, reason: 'no api key', error: NO_KEY_MESSAGE };
  }

  // Leave any previous last_error in place until this run finishes. waitUntil
  // can cancel the task after this write; clearing the message first is how a
  // killed sync goes silent.
  await db.prepare(
    "UPDATE bing_site_links SET status = 'syncing', sync_started_at = datetime('now') WHERE site_id = ?"
  ).run(siteId);

  const fail = async (message) => {
    const text = explainBingError(message);
    await db.prepare(
      "UPDATE bing_site_links SET status = 'error', last_error = ? WHERE site_id = ?"
    ).run(text, siteId);
    return { error: text };
  };

  const started = Date.now();
  const siteBudget = Number.isFinite(budgetMs) ? budgetMs : SITE_SYNC_BUDGET_MS;
  const remaining = () => siteBudget - (Date.now() - started);
  const pull = (method) => {
    const timeoutMs = Math.min(15000, remaining() - 1000);
    if (timeoutMs < 1000) {
      throw new Error('Bing sync stopped before the Worker time limit so the failure could be saved');
    }
    return bingGet(method, { siteUrl: link.bing_url }, timeoutMs);
  };
  const pause = async (ms) => {
    if (remaining() < ms + 2000) {
      throw new Error('Bing sync stopped before the Worker time limit so the failure could be saved');
    }
    await wait(ms);
  };

  let traffic, queries, pages, crawl;
  try {
    traffic = await pull('GetRankAndTrafficStats');
    await pause(BETWEEN_CALLS_MS);
    queries = await pull('GetQueryStats');
    await pause(BETWEEN_CALLS_MS);
    pages = await pull('GetPageStats');
    await pause(BETWEEN_CALLS_MS);
    crawl = await pull('GetCrawlStats');
  } catch (err) {
    return fail(err.message);
  }

  try {
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
  } catch (err) {
    return fail(`Saving Bing data failed: ${err.message}`);
  }

  return {
    ok: true,
    traffic: traffic.length,
    queries: queries.length,
    pages: pages.length,
    crawl: crawl.length,
  };
}

function shouldStopRun(message, stopOnTimeout) {
  const text = String(message || '');
  if (text.includes('Throttle')) return true;
  if (!stopOnTimeout) return false;
  return text.includes('did not answer within') || text.includes('Worker time limit');
}

export async function syncAllBing({
  maxAgeHours = 20,
  force = false,
  userId = null,
  budgetMs = BACKGROUND_RUN_BUDGET_MS,
  stopOnTimeout = true,
} = {}) {
  const started = Date.now();
  const db = await getDb();
  if (!(await getBingApiKey())) {
    await recordLinkError(db, NO_KEY_MESSAGE, userId);
    return { skipped: 'not configured', error: NO_KEY_MESSAGE };
  }
  try {
    await autoLinkSites(userId);
  } catch (err) {
    // GetUserSites runs before any per-site try/catch. A throw here used to
    // skip every row, so the cron returned 500 and last_error stayed NULL.
    const text = await recordLinkError(db, err.message, userId);
    return { synced: 0, error: text, results: [], skipped: [] };
  }
  const links = userId
    ? await db.prepare(
      `SELECT l.site_id, l.last_sync_at, l.status, l.sync_started_at
       FROM bing_site_links l INNER JOIN sites s ON s.id = l.site_id
       WHERE s.user_id = ? ORDER BY l.site_id`
    ).all(userId)
    : await db.prepare(
      'SELECT site_id, last_sync_at, status, sync_started_at FROM bing_site_links ORDER BY site_id'
    ).all();

  const results = [];
  const skipped = [];
  for (const link of links) {
    if (link.status === 'syncing' && link.sync_started_at) {
      const elapsed = Date.now() - new Date(link.sync_started_at.replace(' ', 'T') + 'Z').getTime();
      if (elapsed < STALE_SYNC_MINUTES * 60 * 1000) {
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
    const left = budgetMs - (Date.now() - started);
    if (left < MIN_SITE_START_MS) {
      skipped.push({ siteId: link.site_id, reason: 'time limit' });
      continue;
    }
    try {
      const result = await syncBingSite(link.site_id, {
        budgetMs: Math.min(SITE_SYNC_BUDGET_MS, left - 1000),
      });
      results.push({ siteId: link.site_id, ...result });
      if (shouldStopRun(result.error, stopOnTimeout)) break;
    } catch (err) {
      const text = explainBingError(err?.message || err);
      try {
        await db.prepare(
          "UPDATE bing_site_links SET status = 'error', last_error = ? WHERE site_id = ?"
        ).run(text, link.site_id);
      } catch (writeErr) {
        console.error('Could not record Bing link error:', writeErr?.message || writeErr);
      }
      results.push({ siteId: link.site_id, error: text });
      if (shouldStopRun(text, stopOnTimeout)) break;
    }
    await wait(BETWEEN_SITES_MS);
  }
  return { synced: results.length, results, skipped };
}
