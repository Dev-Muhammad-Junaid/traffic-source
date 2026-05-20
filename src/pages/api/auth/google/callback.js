import { withAuth } from '@/lib/withAuth';
import { exchangeCodeForTokens, fetchUserEmail, saveUserConnection, getRedirectUri } from '@/lib/gsc';

export default withAuth(async function handler(req, res) {
  const { code, state, error } = req.query;
  const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('gsc_state='));
  const cookieState = cookie ? cookie.slice('gsc_state='.length) : null;

  if (error) return redirectErr(res, `Google returned error: ${error}`);
  if (!code || !state || state !== cookieState) return redirectErr(res, 'Invalid OAuth state');

  const userId = parseInt(state.split('.')[1], 10);
  if (userId !== req.user.userId) return redirectErr(res, 'User mismatch');

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri: getRedirectUri(req) });
    if (!tokens.refresh_token) {
      return redirectErr(res, 'No refresh token returned. Revoke the app in your Google account and try again.');
    }
    const email = await fetchUserEmail(tokens.access_token);
    await saveUserConnection({ userId, refreshToken: tokens.refresh_token, googleEmail: email });
    res.setHeader('Set-Cookie', 'gsc_state=; HttpOnly; Path=/; Max-Age=0');
    res.redirect('/settings?tab=integrations&connected=1');
  } catch (err) {
    return redirectErr(res, err.message);
  }
});

function redirectErr(res, msg) {
  res.redirect(`/settings?tab=integrations&error=${encodeURIComponent(msg)}`);
}
