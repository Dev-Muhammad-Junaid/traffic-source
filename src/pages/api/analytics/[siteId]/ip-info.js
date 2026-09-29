import { withAuth } from '@/lib/withAuth';
import { verifySiteOwnership } from '@/lib/analytics';
import { getIpDetails } from '@/lib/ip-details';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const site = await verifySiteOwnership(req.query.siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  try {
    const details = await getIpDetails(req.query.siteId, req.query.ip);
    if (!details) return res.status(404).json({ error: 'IP not found for this site' });
    return res.status(200).json(details);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'IP lookup failed' });
  }
});
