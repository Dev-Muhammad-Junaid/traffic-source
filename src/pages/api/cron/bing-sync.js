import { explainBingError } from '@/lib/bing';
import { CRON_RUN_BUDGET_MS, syncAllBing } from '@/lib/bing-sync';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // The scheduled handler awaits this route, so the limit is the cron wall
    // time (15 min), not the 30s waitUntil budget used by Sync now.
    const result = await syncAllBing({ budgetMs: CRON_RUN_BUDGET_MS, stopOnTimeout: false });
    const siteError = Array.isArray(result.results)
      ? result.results.find((row) => row?.error)?.error
      : undefined;
    const failure = result.error || siteError;
    // worker-entry logs this body. A missing key is a skip (200) that still
    // names the reason. Any Bing failure, including one site after the others
    // succeeded, is a 502 whose error text is the message that was stored.
    if (failure && result.skipped !== 'not configured') {
      return res.status(502).json({ ...result, success: false, error: failure });
    }
    return res.status(200).json({ success: !failure, ...result });
  } catch (err) {
    const message = explainBingError(err?.message || err);
    console.error('Bing sync error:', message);
    return res.status(500).json({ error: `Bing sync failed: ${message}` });
  }
}
