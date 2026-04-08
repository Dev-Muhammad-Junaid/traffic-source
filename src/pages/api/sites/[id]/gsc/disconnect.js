import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { unlinkSite } from '@/lib/gsc';

export default withAuth(function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end();
  const { id } = req.query;
  const db = getDb();
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  unlinkSite(id);
  return res.status(200).json({ ok: true });
});
