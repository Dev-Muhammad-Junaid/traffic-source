import { getDb } from './db';
import { encrypt, decrypt } from './crypto';

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

export function hostOf(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^www\./, '').toLowerCase();
  }
}

/** Bing JSON dates look like /Date(1316156400000-0700)/. Return YYYY-MM-DD in that offset. */
export function parseBingDate(value) {
  const match = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(String(value || ''));
  if (!match) return String(value || '').slice(0, 10);
  let ms = Number(match[1]);
  const offset = match[2];
  if (offset) {
    const sign = offset[0] === '-' ? -1 : 1;
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(3, 5));
    ms += sign * (hours * 60 + minutes) * 60 * 1000;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

export async function getBingApiKey() {
  const db = await getDb();
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = 'bing_api_key'").get();
  const stored = decrypt(row?.value);
  if (stored) return stored;
  const fromEnv = process.env.BING_WEBMASTER_API_KEY?.trim();
  return fromEnv || null;
}

export async function saveBingApiKey(apiKey) {
  const db = await getDb();
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('bing_api_key', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(encrypt(apiKey));
}

export async function clearBingApiKey() {
  const db = await getDb();
  await db.prepare("DELETE FROM app_settings WHERE key = 'bing_api_key'").run();
}

export function explainBingError(message) {
  const text = String(message || '');
  if (text.includes('ThrottleIP') || text.includes('Throttle')) {
    return 'Bing is rate-limiting this server (ThrottleIP). Too many API calls were made in a short time. Wait about 15 minutes, then use Sync now.';
  }
  return text.slice(0, 500);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function bingGet(method, params = {}) {
  const apiKey = params.apikey || await getBingApiKey();
  if (!apiKey) throw new Error('Bing Webmaster API key is not configured');
  const url = new URL(`${BASE}/${method}`);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (key === 'apikey' || value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  let lastMessage = `Bing ${method} failed`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.ErrorCode) {
      const rows = data.d;
      return Array.isArray(rows) ? rows : [];
    }
    lastMessage = data.Message || `Bing ${method} failed (${res.status})`;
    const throttled = String(lastMessage).includes('Throttle');
    if (!throttled || attempt === 2) break;
    await wait(20000 * (attempt + 1));
  }
  throw new Error(explainBingError(lastMessage));
}

export async function listBingSites(apiKey) {
  return bingGet('GetUserSites', apiKey ? { apikey: apiKey } : {});
}
