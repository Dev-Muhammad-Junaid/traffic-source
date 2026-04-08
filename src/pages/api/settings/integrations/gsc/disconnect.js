import { withAuth } from '@/lib/withAuth';
import { deleteUserConnection } from '@/lib/gsc';

export default withAuth(function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end();
  deleteUserConnection(req.user.userId);
  return res.status(200).json({ ok: true });
});
