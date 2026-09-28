import { withAuth } from '@/lib/withAuth';
import { clearBingApiKey, getBingApiKey, listBingSites, saveBingApiKey } from '@/lib/bing';
import { autoLinkSites, syncAllBing } from '@/lib/bing-sync';
import { scheduleBackgroundTask } from '@/lib/background-task';

function mask(key) {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export default withAuth(async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const apiKey = await getBingApiKey();
      return res.status(200).json({ configured: !!apiKey, masked: mask(apiKey) });
    }

    if (req.method === 'POST') {
      const apiKey = String(req.body?.apiKey || '').trim();
      if (!apiKey) return res.status(400).json({ error: 'API key is required' });
      const sites = await listBingSites(apiKey);
      await saveBingApiKey(apiKey);
      const linked = await autoLinkSites(req.user.userId);
      if (linked.length) {
        scheduleBackgroundTask(() => syncAllBing({ userId: req.user.userId, force: true }));
      }
      return res.status(200).json({
        ok: true,
        verified: sites.filter((site) => site.IsVerified).map((site) => site.Url),
        linked,
      });
    }

    if (req.method === 'DELETE') {
      await clearBingApiKey();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Bing credentials error:', err);
    return res.status(400).json({ error: err.message || 'Bing API key was rejected' });
  }
});
