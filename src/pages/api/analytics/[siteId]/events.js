import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';
import { buildSessionFilters, hasSessionFilters } from '@/lib/session-filters';

export default withAuth(async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { siteId } = req.query;
    const site = await verifySiteOwnership(siteId, req.user.userId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const db = await getDb();
    const range = parseDateRange(req.query);
    const dateEnd = range.to + ' 23:59:59';

    // Events inherit whatever session filters the dashboard has active, so the
    // panel stays consistent with the rest of the page when drilling in.
    const sf = buildSessionFilters(req.query, 's');
    const useFilters = hasSessionFilters(req.query) && sf.clauses.length > 0;
    const join = useFilters ? 'INNER JOIN sessions s ON s.id = e.session_id' : '';
    const where = useFilters ? ' AND ' + sf.clauses.join(' AND ') : '';
    const params = [siteId, range.from, dateEnd, ...(useFilters ? sf.params : [])];

    const events = await db
      .prepare(
        `SELECT e.name as name,
                COUNT(*) as count,
                COUNT(DISTINCT e.visitor_id) as visitors,
                COUNT(DISTINCT e.session_id) as sessions
         FROM events e ${join}
         WHERE e.site_id = ? AND datetime(e.timestamp) BETWEEN ? AND ? ${where}
         GROUP BY e.name
         ORDER BY count DESC
         LIMIT 50`
      )
      .all(...params);

    const totals = await db
      .prepare(
        `SELECT COUNT(*) as total_events,
                COUNT(DISTINCT e.visitor_id) as total_visitors,
                COUNT(DISTINCT e.name) as distinct_events
         FROM events e ${join}
         WHERE e.site_id = ? AND datetime(e.timestamp) BETWEEN ? AND ? ${where}`
      )
      .get(...params);

    res.json({
      events: events || [],
      totals: totals || { total_events: 0, total_visitors: 0, distinct_events: 0 },
    });
  } catch (err) {
    console.error('Events query error:', err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});
