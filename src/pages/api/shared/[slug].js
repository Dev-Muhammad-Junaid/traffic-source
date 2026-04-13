import { getDb } from '@/lib/db';
import { parseDateRange } from '@/lib/analytics';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  const db = getDb();

  const site = db
    .prepare('SELECT * FROM sites WHERE public_slug = ? AND is_public = 1')
    .get(slug);

  if (!site) {
    return res.status(404).json({ error: 'Not found' });
  }

  const siteId = site.id;
  const range = parseDateRange(req.query);
  const dateEnd = range.to + ' 23:59:59';

  // Previous period for comparison
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
  const prevFrom = new Date(fromDate);
  prevFrom.setDate(prevFrom.getDate() - daysDiff);
  const prevRange = {
    from: prevFrom.toISOString().slice(0, 10),
    to: new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10),
  };

  const current = db
    .prepare(
      `SELECT
        COALESCE(SUM(visitors), 0) as total_visitors,
        COALESCE(SUM(sessions), 0) as total_sessions,
        COALESCE(SUM(page_views), 0) as total_page_views,
        COALESCE(SUM(bounces), 0) as total_bounces,
        COALESCE(AVG(avg_duration), 0) as avg_duration
       FROM daily_stats
       WHERE site_id = ? AND date BETWEEN ? AND ?`
    )
    .get(siteId, range.from, range.to);

  const previous = db
    .prepare(
      `SELECT
        COALESCE(SUM(visitors), 0) as total_visitors,
        COALESCE(SUM(sessions), 0) as total_sessions,
        COALESCE(SUM(page_views), 0) as total_page_views,
        COALESCE(SUM(bounces), 0) as total_bounces,
        COALESCE(AVG(avg_duration), 0) as avg_duration
       FROM daily_stats
       WHERE site_id = ? AND date BETWEEN ? AND ?`
    )
    .get(siteId, prevRange.from, prevRange.to);

  const bounceRate = current.total_sessions > 0
    ? ((current.total_bounces / current.total_sessions) * 100).toFixed(1)
    : 0;
  const prevBounceRate = previous.total_sessions > 0
    ? ((previous.total_bounces / previous.total_sessions) * 100).toFixed(1)
    : 0;

  // Time series
  let timeSeries;
  if (req.query.period === '24h') {
    timeSeries = db
      .prepare(
        `SELECT strftime('%Y-%m-%d %H:00', timestamp) as date,
                COUNT(*) as page_views,
                COUNT(DISTINCT visitor_id) as visitors
         FROM page_views
         WHERE site_id = ? AND timestamp >= datetime('now', '-24 hours')
         GROUP BY date ORDER BY date ASC`
      )
      .all(siteId);
  } else {
    timeSeries = db
      .prepare(
        `SELECT date, visitors, sessions, page_views
         FROM daily_stats
         WHERE site_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`
      )
      .all(siteId, range.from, range.to);
  }

  // Sources
  const sources = db
    .prepare(
      `SELECT COALESCE(utm_source, referrer_domain, 'Direct') as name,
        COUNT(*) as sessions, COUNT(DISTINCT visitor_id) as visitors
       FROM sessions
       WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
       GROUP BY name ORDER BY sessions DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  // Pages
  const pages = db
    .prepare(
      `SELECT pathname as name, COUNT(*) as views
       FROM page_views
       WHERE site_id = ? AND datetime(timestamp) BETWEEN ? AND ?
       GROUP BY pathname ORDER BY views DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  // Countries
  const countries = db
    .prepare(
      `SELECT country as name, COUNT(*) as count
       FROM sessions
       WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
       AND country IS NOT NULL AND country != ''
       GROUP BY country ORDER BY count DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  // Browsers
  const browsers = db
    .prepare(
      `SELECT browser as name, COUNT(*) as count
       FROM sessions
       WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
       AND browser IS NOT NULL AND browser != ''
       GROUP BY browser ORDER BY count DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  // OS
  const os = db
    .prepare(
      `SELECT os as name, COUNT(*) as count
       FROM sessions
       WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
       AND os IS NOT NULL AND os != ''
       GROUP BY os ORDER BY count DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  // Devices
  const devices = db
    .prepare(
      `SELECT device_type as name, COUNT(*) as count
       FROM sessions
       WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
       AND device_type IS NOT NULL AND device_type != ''
       GROUP BY device_type ORDER BY count DESC LIMIT 10`
    )
    .all(siteId, range.from, dateEnd);

  function pctChange(curr, prev) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return (((curr - prev) / prev) * 100).toFixed(1);
  }

  res.status(200).json({
    site: { name: site.name, domain: site.domain },
    current: {
      visitors: current.total_visitors,
      sessions: current.total_sessions,
      pageViews: current.total_page_views,
      bounceRate: parseFloat(bounceRate),
      avgDuration: Math.round(current.avg_duration),
    },
    changes: {
      visitors: parseFloat(pctChange(current.total_visitors, previous.total_visitors)),
      sessions: parseFloat(pctChange(current.total_sessions, previous.total_sessions)),
      pageViews: parseFloat(pctChange(current.total_page_views, previous.total_page_views)),
      bounceRate: parseFloat(pctChange(bounceRate, prevBounceRate)),
      avgDuration: parseFloat(pctChange(current.avg_duration, previous.avg_duration)),
    },
    timeSeries,
    sources,
    pages,
    countries,
    browsers,
    os,
    devices,
  });
}
