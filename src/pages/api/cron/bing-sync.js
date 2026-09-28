import { syncAllBing } from '@/lib/bing-sync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await syncAllBing();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('Bing sync error:', err);
    return res.status(500).json({ error: 'Bing sync failed' });
  }
});
