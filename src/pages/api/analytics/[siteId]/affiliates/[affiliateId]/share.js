import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { verifySiteOwnership } from '@/lib/analytics';

export default withAuth(async function handler(req, res) {
  const { siteId, affiliateId } = req.query;
  const site = await verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = await getDb();
  const affiliate = await db
    .prepare('SELECT * FROM affiliates WHERE id = ? AND site_id = ?')
    .get(affiliateId, siteId);
  if (!affiliate) return res.status(404).json({ error: 'Affiliate not found' });

  if (req.method === 'POST') {
    const token = crypto.randomBytes(24).toString('base64url');
    await db.prepare('UPDATE affiliates SET share_token = ? WHERE id = ?').run(token, affiliateId);
    return res.status(200).json({ share_token: token });
  }

  if (req.method === 'DELETE') {
    await db.prepare('UPDATE affiliates SET share_token = NULL WHERE id = ?').run(affiliateId);
    return res.status(200).json({ share_token: null });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ share_token: affiliate.share_token || null });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
