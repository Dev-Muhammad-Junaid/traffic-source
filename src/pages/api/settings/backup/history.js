import { withAuth } from '@/lib/withAuth';
import { getBackupHistory } from '@/lib/backup';

export default withAuth(function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const history = getBackupHistory();
  return res.json({ history });
});
