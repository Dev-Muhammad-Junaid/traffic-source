import { withAuth } from '@/lib/withAuth';
import { runBackup } from '@/lib/backup';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await runBackup();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
