import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getUserConnection } from '@/lib/gsc';
import { syncAllConnections } from '@/lib/gsc-sync';
import { scheduleBackgroundTask } from '@/lib/background-task';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const connection = await getUserConnection(req.user.userId);
  if (!connection) {
    return res.status(400).json({ error: 'Google Search Console is not connected.' });
  }

  const db = await getDb();
  const sites = await db
    .prepare(
      `SELECT s.id, s.name, s.domain
       FROM sites s
       INNER JOIN gsc_site_links l ON l.site_id = s.id
       WHERE s.user_id = ?
       ORDER BY s.name`
    )
    .all(req.user.userId);

  if (!sites.length) {
    return res.status(400).json({ error: 'No sites are linked to Search Console yet.' });
  }

  scheduleBackgroundTask(() => syncAllConnections({ userId: req.user.userId, force: true }));

  return res.status(200).json({
    ok: true,
    message: `Sync started for ${sites.length} site${sites.length === 1 ? '' : 's'}.`,
    sites: sites.map((site) => ({ id: site.id, name: site.name, domain: site.domain })),
  });
});
