import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId } = req.query;
  const site = await verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = await getDb();
  const range = parseDateRange(req.query);
  const dateEnd = range.to + ' 23:59:59';

  // All affiliates with stats for the date range
  const affiliates = await db
    .prepare(
      `SELECT a.id, a.name, a.slug, a.commission_rate, a.created_at,
        COALESCE(v.visits, 0) as visits,
        COALESCE(v.unique_visitors, 0) as unique_visitors,
        COALESCE(c.conversions, 0) as conversions,
        COALESCE(c.revenue, 0) as revenue
       FROM affiliates a
       LEFT JOIN (
         SELECT affiliate_id,
           COUNT(*) as visits,
           COUNT(DISTINCT visitor_id) as unique_visitors
         FROM affiliate_visits
         WHERE site_id = ? AND datetime(landed_at) BETWEEN ? AND ?
         GROUP BY affiliate_id
       ) v ON v.affiliate_id = a.id
       LEFT JOIN (
         SELECT affiliate_id,
           COUNT(*) as conversions,
           SUM(amount) as revenue
         FROM conversions
         WHERE site_id = ? AND status = 'completed'
           AND datetime(created_at) BETWEEN ? AND ?
         GROUP BY affiliate_id
       ) c ON c.affiliate_id = a.id
       WHERE a.site_id = ?
       ORDER BY COALESCE(c.revenue, 0) DESC, COALESCE(v.visits, 0) DESC`
    )
    .all(siteId, range.from, dateEnd, siteId, range.from, dateEnd, siteId);

  // Totals
  const totals = affiliates.reduce(
    (acc, a) => ({
      visits: acc.visits + a.visits,
      unique_visitors: acc.unique_visitors + a.unique_visitors,
      conversions: acc.conversions + a.conversions,
      revenue: acc.revenue + a.revenue,
    }),
    { visits: 0, unique_visitors: 0, conversions: 0, revenue: 0 }
  );

  // Time series for affiliate visits
  const timeSeries = await db
    .prepare(
      `SELECT date(landed_at) as date,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_id) as unique_visitors
       FROM affiliate_visits
       WHERE site_id = ? AND datetime(landed_at) BETWEEN ? AND ?
       GROUP BY date ORDER BY date ASC`
    )
    .all(siteId, range.from, dateEnd);

  res.status(200).json({ site, affiliates, totals, timeSeries });
});
