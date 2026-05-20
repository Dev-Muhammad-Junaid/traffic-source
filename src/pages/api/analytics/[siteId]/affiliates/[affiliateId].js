import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId, affiliateId } = req.query;
  const site = await verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = await getDb();
  const affiliate = await db
    .prepare('SELECT * FROM affiliates WHERE id = ? AND site_id = ?')
    .get(affiliateId, siteId);
  if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });

  const range = parseDateRange(req.query);
  const dateEnd = range.to + ' 23:59:59';

  // Stats
  const stats = await db
    .prepare(
      `SELECT
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_id) as unique_visitors
       FROM affiliate_visits
       WHERE affiliate_id = ? AND datetime(landed_at) BETWEEN ? AND ?`
    )
    .get(affiliateId, range.from, dateEnd);

  const convStats = await db
    .prepare(
      `SELECT
        COUNT(*) as conversions,
        COALESCE(SUM(amount), 0) as revenue
       FROM conversions
       WHERE affiliate_id = ? AND status = 'completed'
         AND datetime(created_at) BETWEEN ? AND ?`
    )
    .get(affiliateId, range.from, dateEnd);

  // Time series
  const visitTimeSeries = await db
    .prepare(
      `SELECT date(landed_at) as date,
        COUNT(*) as visits,
        COUNT(DISTINCT visitor_id) as unique_visitors
       FROM affiliate_visits
       WHERE affiliate_id = ? AND datetime(landed_at) BETWEEN ? AND ?
       GROUP BY date ORDER BY date ASC`
    )
    .all(affiliateId, range.from, dateEnd);

  const convTimeSeries = await db
    .prepare(
      `SELECT date(created_at) as date,
        COUNT(*) as conversions,
        SUM(amount) as revenue
       FROM conversions
       WHERE affiliate_id = ? AND status = 'completed'
         AND datetime(created_at) BETWEEN ? AND ?
       GROUP BY date ORDER BY date ASC`
    )
    .all(affiliateId, range.from, dateEnd);

  // Top landing pages
  const landingPages = await db
    .prepare(
      `SELECT landing_page as name, COUNT(*) as count
       FROM affiliate_visits
       WHERE affiliate_id = ? AND datetime(landed_at) BETWEEN ? AND ?
       AND landing_page IS NOT NULL
       GROUP BY landing_page ORDER BY count DESC LIMIT 10`
    )
    .all(affiliateId, range.from, dateEnd);

  // Recent conversions
  const conversions = await db
    .prepare(
      `SELECT c.*, a.name as affiliate_name
       FROM conversions c
       LEFT JOIN affiliates a ON a.id = c.affiliate_id
       WHERE c.affiliate_id = ? AND c.status = 'completed'
         AND datetime(c.created_at) BETWEEN ? AND ?
       ORDER BY c.created_at DESC LIMIT 20`
    )
    .all(affiliateId, range.from, dateEnd);

  const conversionRate = stats.visits > 0
    ? ((convStats.conversions / stats.unique_visitors) * 100).toFixed(2)
    : 0;

  const commission = affiliate.commission_rate > 0
    ? Math.round(convStats.revenue * affiliate.commission_rate)
    : 0;

  res.status(200).json({
    site,
    affiliate,
    stats: {
      visits: stats.visits,
      uniqueVisitors: stats.unique_visitors,
      conversions: convStats.conversions,
      revenue: convStats.revenue,
      conversionRate: parseFloat(conversionRate),
      commission,
    },
    visitTimeSeries,
    convTimeSeries,
    landingPages,
    conversions,
  });
});
