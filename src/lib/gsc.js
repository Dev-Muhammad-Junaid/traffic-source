import { getDb } from './db';
import { encrypt, decrypt } from './crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email';

// ───── settings (client id/secret stored encrypted in app_settings) ─────

export function getGscCredentials() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('gsc_client_id','gsc_client_secret')").all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    clientId: decrypt(map.gsc_client_id),
    clientSecret: decrypt(map.gsc_client_secret),
  };
}

export function saveGscCredentials({ clientId, clientSecret }) {
  const db = getDb();
  const up = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  up.run('gsc_client_id', encrypt(clientId));
  up.run('gsc_client_secret', encrypt(clientSecret));
}

export function clearGscCredentials() {
  const db = getDb();
  db.prepare("DELETE FROM app_settings WHERE key IN ('gsc_client_id','gsc_client_secret')").run();
}

export function isGscConfigured() {
  const { clientId, clientSecret } = getGscCredentials();
  return !!(clientId && clientSecret);
}

// ───── redirect URI auto-detection ─────

export function getRedirectUri(req) {
  const proto = (req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}/api/auth/google/callback`;
}

// ───── OAuth flow ─────

export function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, redirectUri }) {
  const { clientId, clientSecret } = getGscCredentials();
  if (!clientId || !clientSecret) throw new Error('GSC not configured');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getGscCredentials();
  if (!clientId || !clientSecret) throw new Error('GSC not configured');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function fetchUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

// ───── Search Console API ─────

export async function listGscProperties(accessToken) {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`List sites failed: ${await res.text()}`);
  const data = await res.json();
  return (data.siteEntry || []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser');
}

export async function querySearchAnalytics({ accessToken, property, startDate, endDate, dimensions = ['query', 'page'], rowLimit = 25000, dimensionFilterGroups }) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const body = { startDate, endDate, dimensions, rowLimit, dataState: 'final' };
  if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search Analytics failed: ${await res.text()}`);
  const data = await res.json();
  return data.rows || [];
}

// ───── user-level Google connection ─────

export function getUserConnection(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM gsc_connections WHERE user_id = ?').get(userId);
}

export function saveUserConnection({ userId, refreshToken, googleEmail }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO gsc_connections (user_id, refresh_token, google_email, connected_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      google_email = excluded.google_email,
      connected_at = excluded.connected_at,
      last_error = NULL
  `).run(userId, encrypt(refreshToken), googleEmail);
}

export function deleteUserConnection(userId) {
  const db = getDb();
  // Cascade: unlink all of user's sites and wipe their GSC data
  const siteIds = db.prepare('SELECT id FROM sites WHERE user_id = ?').all(userId).map((r) => r.id);
  const tx = db.transaction(() => {
    for (const sid of siteIds) {
      db.prepare('DELETE FROM gsc_site_links WHERE site_id = ?').run(sid);
      db.prepare('DELETE FROM gsc_daily WHERE site_id = ?').run(sid);
      db.prepare('DELETE FROM gsc_trends WHERE site_id = ?').run(sid);
    }
    db.prepare('DELETE FROM gsc_connections WHERE user_id = ?').run(userId);
  });
  tx();
}

export function getDecryptedRefreshToken(conn) {
  return conn?.refresh_token ? decrypt(conn.refresh_token) : null;
}

// ───── per-site property link ─────

export function getSiteLink(siteId) {
  const db = getDb();
  return db.prepare('SELECT * FROM gsc_site_links WHERE site_id = ?').get(siteId);
}

export function linkSiteProperty(siteId, property) {
  const db = getDb();
  db.prepare(`
    INSERT INTO gsc_site_links (site_id, gsc_property, status, linked_at)
    VALUES (?, ?, 'active', datetime('now'))
    ON CONFLICT(site_id) DO UPDATE SET gsc_property = excluded.gsc_property, status = 'active', last_error = NULL
  `).run(siteId, property);
}

export function unlinkSite(siteId) {
  const db = getDb();
  db.prepare('DELETE FROM gsc_site_links WHERE site_id = ?').run(siteId);
  db.prepare('DELETE FROM gsc_daily WHERE site_id = ?').run(siteId);
  db.prepare('DELETE FROM gsc_trends WHERE site_id = ?').run(siteId);
}
