import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getSiteLink } from '@/lib/gsc';
import { syncSite } from '@/lib/gsc-sync';
import { scheduleBackgroundTask } from '@/lib/background-task';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { id } = req.query;
  const db = await getDb();
  const site = await db.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const link = await getSiteLink(id);
  if (!link) return res.status(400).json({ error: 'Search Console property not linked' });

  // `backfill` forces the full 90-day window. Otherwise syncSite derives the
  // window from what is already stored, so a site that has fallen behind still
  // catches up — the old `!link.last_sync_at` check meant an already-synced
  // site could never re-fetch more than the last 3 days, and any gap was
  // permanent.
  const backfill = req.body?.backfill === true || !link.last_sync_at;
  scheduleBackgroundTask(() => syncSite(Number(id), { backfill }));

  return res.status(200).json({
    ok: true,
    message: backfill ? 'Backfill started.' : 'Sync started.',
  });
});
