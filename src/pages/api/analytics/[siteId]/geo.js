import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';
import { buildSessionFilters, buildPageViewFilters } from '@/lib/session-filters';

/**
 * Lightweight breakdown for a selected day (and any other active filters).
 * Keeps the full-period chart in memory while updating every panel.
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
    const sfAliased = buildSessionFilters(req.query, 's');
    const pvf = buildPageViewFilters(req.query);
    const sfWhere = sf.clauses.length > 0 ? ' AND ' + sf.clauses.join(' AND ') : '';
    const sfAliasedWhere = sfAliased.clauses.length > 0 ? ' AND ' + sfAliased.clauses.join(' AND ') : '';
    const pvfWhere = pvf.clauses.length > 0 ? ' AND ' + pvf.clauses.join(' AND ') : '';

    const sessQ = async (baseWhere, baseParams, select, groupOrder) => {
      return await db
        .prepare(`${select} FROM sessions WHERE ${baseWhere}${sfWhere} ${groupOrder}`)
        .all(...baseParams, ...sf.params);
    };

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
      .get(siteId, range.from, dateEnd, ...sf.params) || {
        total_visitors: 0,
        total_sessions: 0,
        total_page_views: 0,
        total_bounces: 0,
        avg_duration: 0,
      };

    const bounceRate =
      totals.total_sessions > 0
        ? ((totals.total_bounces / totals.total_sessions) * 100).toFixed(1)
        : 0;

    // Sequential D1 queries — parallel statements can fail on Workers
    const sources = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ?`,
      [siteId, range.from, dateEnd],
      `SELECT COALESCE(utm_source, referrer_domain, 'Direct') as name,
        COUNT(*) as sessions,
        COUNT(DISTINCT visitor_id) as visitors,
        ROUND(AVG(is_bounce) * 100, 1) as bounce_rate`,
      `GROUP BY name ORDER BY sessions DESC LIMIT 20`
    );
    const countries = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ? AND country IS NOT NULL AND country != ''`,
      [siteId, range.from, dateEnd],
      `SELECT country as name, COUNT(*) as count`,
      `GROUP BY country ORDER BY count DESC LIMIT 20`
    );
    const cities = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ? AND city IS NOT NULL AND city != ''`,
      [siteId, range.from, dateEnd],
      `SELECT city as name, COUNT(*) as count`,
      `GROUP BY city ORDER BY count DESC LIMIT 20`
    );
    const browsers = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ? AND browser IS NOT NULL AND browser != ''`,
      [siteId, range.from, dateEnd],
      `SELECT browser as name, COUNT(*) as count`,
      `GROUP BY browser ORDER BY count DESC LIMIT 10`
    );
    const os = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ? AND os IS NOT NULL AND os != ''`,
      [siteId, range.from, dateEnd],
      `SELECT os as name, COUNT(*) as count`,
      `GROUP BY os ORDER BY count DESC LIMIT 10`
    );
    const devices = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ? AND device_type IS NOT NULL AND device_type != ''`,
      [siteId, range.from, dateEnd],
      `SELECT device_type as name, COUNT(*) as count`,
      `GROUP BY device_type ORDER BY count DESC LIMIT 10`
    );
    const entryPages = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ?`,
      [siteId, range.from, dateEnd],
      `SELECT entry_page as name, COUNT(*) as sessions,
        ROUND(AVG(is_bounce) * 100, 1) as bounce_rate`,
      `GROUP BY entry_page ORDER BY sessions DESC LIMIT 10`
    );
    const exitPages = await sessQ(
      `site_id = ? AND datetime(started_at) BETWEEN ? AND ?`,
      [siteId, range.from, dateEnd],
      `SELECT exit_page as name, COUNT(*) as sessions`,
      `GROUP BY exit_page ORDER BY sessions DESC LIMIT 10`
    );
    const pages = await db
      .prepare(
        `SELECT pv.pathname as name, COUNT(*) as views,
          COUNT(DISTINCT pv.visitor_id) as visitors
         FROM page_views pv
         INNER JOIN sessions s ON s.site_id = pv.site_id AND s.id = pv.session_id
         WHERE pv.site_id = ? AND datetime(pv.timestamp) BETWEEN ? AND ?${sfAliasedWhere}${pvfWhere}
         GROUP BY pv.pathname ORDER BY views DESC LIMIT 20`
      )
      .all(siteId, range.from, dateEnd, ...sfAliased.params, ...pvf.params);

    return res.status(200).json({
      date,
      sources,
      pages,
      entryPages,
      exitPages,
      countries,
      cities,
      browsers,
      os,
      devices,
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
