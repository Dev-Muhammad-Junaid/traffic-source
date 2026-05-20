import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { verifySiteOwnership } from '@/lib/analytics';

export default withAuth(async function handler(req, res) {
  const { id: siteId } = req.query;
  const site = await verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = await getDb();

  if (req.method === 'GET') {
    const affiliates = await db
      .prepare(
        `SELECT a.*,
          (SELECT COUNT(*) FROM affiliate_visits WHERE affiliate_id = a.id) as total_visits,
          (SELECT COUNT(DISTINCT visitor_id) FROM affiliate_visits WHERE affiliate_id = a.id) as unique_visitors,
          (SELECT COUNT(*) FROM conversions WHERE affiliate_id = a.id AND status = 'completed') as conversions,
          (SELECT COALESCE(SUM(amount), 0) FROM conversions WHERE affiliate_id = a.id AND status = 'completed') as revenue
         FROM affiliates a
         WHERE a.site_id = ?
         ORDER BY a.created_at DESC`
      )
      .all(siteId);

    return res.status(200).json({ affiliates });
  }

  if (req.method === 'POST') {
    const { name, slug, commission_rate } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    const slugClean = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!slugClean) {
      return res.status(400).json({ error: 'Invalid slug' });
    }

    const existing = await db
      .prepare('SELECT id FROM affiliates WHERE site_id = ? AND slug = ?')
      .get(siteId, slugClean);
    if (existing) {
      return res.status(409).json({ error: 'Slug already exists' });
    }

    const result = await db
      .prepare('INSERT INTO affiliates (site_id, name, slug, commission_rate) VALUES (?, ?, ?, ?)')
      .run(siteId, name, slugClean, commission_rate || 0);

    const affiliate = await db.prepare('SELECT * FROM affiliates WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ affiliate });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
