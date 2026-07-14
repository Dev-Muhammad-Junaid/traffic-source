import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';
import { buildSessionFilters } from '@/lib/session-filters';

/**
 * Lightweight day/geo breakdown — used when clicking a chart day
 * so the full overview payload does not need to reload.
 */
export default withAuth(async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { siteId, date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const site = await verifySiteOwnership(siteId, req.user.userId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const db = await getDb();
    const range = parseDateRange(req.query);
    const dateEnd = range.to + ' 23:59:59';
    const sf = buildSessionFilters(req.query);
    const sfWhere = sf.clauses.length > 0 ? ' AND ' + sf.clauses.join(' AND ') : '';

    const totals = await db
      .prepare(
        `SELECT
          COUNT(DISTINCT visitor_id) as total_visitors,
          COUNT(*) as total_sessions,
          COALESCE(SUM(page_count), 0) as total_page_views,
          COALESCE(SUM(is_bounce), 0) as total_bounces,
          COALESCE(AVG(duration), 0) as avg_duration
         FROM sessions
         WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?${sfWhere}`
      )
      .get(siteId, range.from, dateEnd, ...sf.params);

    const bounceRate =
      totals.total_sessions > 0
        ? ((totals.total_bounces / totals.total_sessions) * 100).toFixed(1)
        : 0;

    const countries = await db
      .prepare(
        `SELECT country as name, COUNT(*) as count
         FROM sessions
         WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
           AND country IS NOT NULL AND country != ''${sfWhere}
         GROUP BY country ORDER BY count DESC LIMIT 20`
      )
      .all(siteId, range.from, dateEnd, ...sf.params);

    const cities = await db
      .prepare(
        `SELECT city as name, COUNT(*) as count
         FROM sessions
         WHERE site_id = ? AND datetime(started_at) BETWEEN ? AND ?
           AND city IS NOT NULL AND city != ''${sfWhere}
         GROUP BY city ORDER BY count DESC LIMIT 20`
      )
      .all(siteId, range.from, dateEnd, ...sf.params);

    return res.status(200).json({
      date,
      countries,
      cities,
      current: {
        visitors: totals.total_visitors,
        sessions: totals.total_sessions,
        pageViews: totals.total_page_views,
        bounceRate: parseFloat(bounceRate),
        avgDuration: Math.round(totals.avg_duration || 0),
      },
    });
  } catch (err) {
    console.error('[geo]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
});
