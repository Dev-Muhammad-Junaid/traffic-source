import { withAuth } from '@/lib/withAuth';
import { listRemoteBackups, restoreBackup } from '@/lib/backup';

export default withAuth(async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const backups = await listRemoteBackups();
      return res.json({ backups });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Missing backup key' });
    }

    try {
      const result = await restoreBackup(key);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
