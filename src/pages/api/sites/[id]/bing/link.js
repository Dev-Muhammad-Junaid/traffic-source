import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { hostOf, listBingSites } from '@/lib/bing';
import { syncBingSite } from '@/lib/bing-sync';
import { scheduleBackgroundTask } from '@/lib/background-task';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = await getDb();
  const site = await db.prepare('SELECT id, domain FROM sites WHERE id = ? AND user_id = ?').get(req.query.id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const bingUrl = String(req.body?.bingUrl || '').trim();
  const verified = await listBingSites();
  const match = verified.find((row) => row.IsVerified && row.Url === bingUrl && hostOf(row.Url) === hostOf(site.domain));
  if (!match) return res.status(400).json({ error: 'That Bing property does not match this site' });

  await db.prepare(`
    INSERT INTO bing_site_links (site_id, bing_url, status, last_error)
    VALUES (?, ?, 'active', NULL)
    ON CONFLICT(site_id) DO UPDATE SET bing_url = excluded.bing_url, status = 'active', last_error = NULL
  `).run(site.id, match.Url);
  scheduleBackgroundTask(() => syncBingSite(Number(site.id)));
  return res.status(200).json({ ok: true, bingUrl: match.Url });
});
