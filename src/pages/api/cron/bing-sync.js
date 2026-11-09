import { syncAllBing } from '@/lib/bing-sync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await syncAllBing();
    // worker-entry logs this body. A missing key is a skip (200) that still
    // names the reason. A Bing failure used to be a generic 500 with no row
    // updates; surface the message as 502.
    if (result.error && result.skipped !== 'not configured') {
      return res.status(502).json({ success: false, ...result });
    }
    return res.status(200).json({ success: !result.error, ...result });
  } catch (err) {
    console.error('Bing sync error:', err);
    return res.status(500).json({ error: `Bing sync failed: ${err?.message || err}` });
  }
}
