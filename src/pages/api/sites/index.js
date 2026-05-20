import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';

export default withAuth(async function handler(req, res) {
  try {
    const db = await getDb();

    if (req.method === 'GET') {
      const sites = await db
        .prepare(
          `SELECT s.id, s.user_id, s.domain, s.name, s.created_at,
          (SELECT COUNT(*) FROM page_views pv WHERE pv.site_id = s.id
           AND pv.timestamp >= datetime('now', '-7 days')) as views_7d
         FROM sites s WHERE s.user_id = ? ORDER BY s.created_at DESC`
        )
        .all(req.user.userId);

      const siteIds = sites.map((s) => s.id);
      const hourlyMap = {};
      if (siteIds.length > 0) {
        const rows = await db
          .prepare(
            `SELECT site_id, strftime('%Y-%m-%d %H:00', timestamp) as hour,
                  COUNT(*) as pageviews,
                  COUNT(DISTINCT visitor_id) as visitors
           FROM page_views
           WHERE site_id IN (${siteIds.map(() => '?').join(',')})
             AND timestamp >= datetime('now', '-24 hours')
           GROUP BY site_id, hour
           ORDER BY hour`
          )
          .all(...siteIds);
        for (const row of rows) {
          if (!hourlyMap[row.site_id]) hourlyMap[row.site_id] = [];
          hourlyMap[row.site_id].push({ hour: row.hour, pageviews: row.pageviews, visitors: row.visitors });
        }
      }

      const enriched = sites.map((s) => ({
        ...s,
        hourly: hourlyMap[s.id] || [],
      }));

      return res.status(200).json({ sites: enriched });
    }

    if (req.method === 'POST') {
      const { domain, name } = req.body;

      if (!domain || !name) {
        return res.status(400).json({ error: 'Domain and name are required' });
      }

      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();

      try {
        const result = await db
          .prepare('INSERT INTO sites (user_id, domain, name) VALUES (?, ?, ?)')
          .run(req.user.userId, cleanDomain, name);

        const site = await db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);

        return res.status(201).json({ site });
      } catch (err) {
        if (err.message?.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Site with this domain already exists' });
        }
        console.error('Create site error:', err);
        return res.status(500).json({ error: 'Failed to create site' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Sites API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
