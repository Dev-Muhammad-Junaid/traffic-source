import { withAuth } from '@/lib/withAuth';
import { getGscCredentials, getRedirectUri, buildAuthUrl } from '@/lib/gsc';
import crypto from 'crypto';

export default withAuth(async function handler(req, res) {
  const { clientId } = await getGscCredentials();
  if (!clientId) return res.status(400).json({ error: 'Add OAuth credentials first.' });

  const state = crypto.randomBytes(16).toString('hex') + '.' + req.user.userId;
  res.setHeader('Set-Cookie', `gsc_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);
  const url = buildAuthUrl({ clientId, redirectUri: getRedirectUri(req), state });
  return res.status(200).json({ url });
});
