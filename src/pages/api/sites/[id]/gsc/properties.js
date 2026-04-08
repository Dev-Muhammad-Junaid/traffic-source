import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getUserConnection, getDecryptedRefreshToken, refreshAccessToken, listGscProperties } from '@/lib/gsc';

export default withAuth(async function handler(req, res) {
  const { id } = req.query;
  const db = getDb();
  const site = db.prepare('SELECT id, domain FROM sites WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const conn = getUserConnection(req.user.userId);
  if (!conn) return res.status(400).json({ error: 'Google account not connected. Connect it in Settings → Integrations.' });

  try {
    const accessToken = await refreshAccessToken(getDecryptedRefreshToken(conn));
    const all = await listGscProperties(accessToken);
    const properties = all.filter((p) => propertyMatchesDomain(p.siteUrl, site.domain));
    return res.status(200).json({ properties, siteDomain: site.domain });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function normalizeDomain(d) {
  return String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
}

function propertyMatchesDomain(siteUrl, siteDomain) {
  const target = normalizeDomain(siteDomain);
  if (!target) return false;
  // Domain property: "sc-domain:example.com"
  if (siteUrl.startsWith('sc-domain:')) {
    const propDomain = normalizeDomain(siteUrl.slice('sc-domain:'.length));
    return propDomain === target || target.endsWith('.' + propDomain) || propDomain.endsWith('.' + target);
  }
  // URL-prefix property: "https://example.com/"
  const propDomain = normalizeDomain(siteUrl);
  return propDomain === target;
}
