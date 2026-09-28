import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { syncBingSite } from '@/lib/bing-sync';
import { scheduleBackgroundTask } from '@/lib/background-task';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = await getDb();
  const site = await db.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?').get(req.query.id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const link = await db.prepare('SELECT site_id FROM bing_site_links WHERE site_id = ?').get(site.id);
  if (!link) return res.status(400).json({ error: 'This site is not linked to Bing Webmaster' });
  scheduleBackgroundTask(() => syncBingSite(Number(site.id)));
  return res.status(200).json({ ok: true, message: 'Sync started.' });
});
