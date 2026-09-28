import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getBingApiKey, hostOf, listBingSites } from '@/lib/bing';

const PERIOD_DAYS = { '24h': 7, '7d': 7, '30d': 30, '90d': 90, '12m': 180 };

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const db = await getDb();
  const site = await db.prepare('SELECT id, name, domain FROM sites WHERE id = ? AND user_id = ?').get(req.query.id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const configured = !!(await getBingApiKey());
  if (!configured) return res.status(200).json({ site, configured: false, linked: false });

  const link = await db.prepare('SELECT * FROM bing_site_links WHERE site_id = ?').get(site.id);
  if (!link) {
    let matches = [];
    try {
      const host = hostOf(site.domain);
      matches = (await listBingSites())
        .filter((row) => row.IsVerified && hostOf(row.Url) === host)
        .map((row) => row.Url);
    } catch (err) {
      return res.status(200).json({ site, configured: true, linked: false, error: err.message, matches: [] });
    }
    return res.status(200).json({ site, configured: true, linked: false, matches });
  }

  const days = PERIOD_DAYS[req.query.period] || 30;
  const start = `date('now', '-${days} days')`;
  const daily = await db.prepare(
    `SELECT date, clicks, impressions FROM bing_daily WHERE site_id = ? AND date >= ${start} ORDER BY date ASC`
  ).all(site.id);
  const totals = daily.reduce((sum, row) => {
    sum.clicks += row.clicks || 0;
    sum.impressions += row.impressions || 0;
    return sum;
  }, { clicks: 0, impressions: 0 });
  totals.ctr = totals.impressions ? totals.clicks / totals.impressions : 0;

  const queries = await db.prepare(
    `SELECT query AS name, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            CASE WHEN SUM(impressions) > 0
              THEN SUM(avg_impression_position * impressions) / SUM(impressions) ELSE 0 END AS position
     FROM bing_queries WHERE site_id = ? AND date >= ${start}
     GROUP BY query ORDER BY clicks DESC, impressions DESC LIMIT 50`
  ).all(site.id);
  const pages = await db.prepare(
    `SELECT page AS name, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            CASE WHEN SUM(impressions) > 0
              THEN SUM(avg_impression_position * impressions) / SUM(impressions) ELSE 0 END AS position
     FROM bing_pages WHERE site_id = ? AND date >= ${start}
     GROUP BY page ORDER BY clicks DESC, impressions DESC LIMIT 50`
  ).all(site.id);
  const crawl = await db.prepare(
    `SELECT * FROM bing_crawl WHERE site_id = ? ORDER BY date DESC LIMIT 30`
  ).all(site.id);

  return res.status(200).json({
    site,
    configured: true,
    linked: true,
    link: {
      url: link.bing_url,
      status: link.status,
      lastSyncAt: link.last_sync_at,
      lastError: link.last_error,
    },
    days,
    totals,
    daily,
    queries,
    pages,
    crawl,
  });
});
