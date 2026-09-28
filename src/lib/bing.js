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
  return decrypt(row?.value) || null;
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

export async function bingGet(method, params = {}) {
  const apiKey = params.apikey || await getBingApiKey();
  if (!apiKey) throw new Error('Bing Webmaster API key is not configured');
  const url = new URL(`${BASE}/${method}`);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (key === 'apikey' || value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ErrorCode) {
    throw new Error(data.Message || `Bing ${method} failed (${res.status})`);
  }
  const rows = data.d;
  return Array.isArray(rows) ? rows : [];
}

export async function listBingSites(apiKey) {
  return bingGet('GetUserSites', apiKey ? { apikey: apiKey } : {});
}
