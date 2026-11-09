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

/**
 * The API key is a query param, so any error text that echoes the request URL
 * has to lose both the raw key and its percent-encoded form.
 */
export function redactBingSecret(text, apiKey, requestUrl) {
  let out = String(text ?? '');
  if (requestUrl) {
    const href = typeof requestUrl === 'string' ? requestUrl : requestUrl.href;
    if (href) out = out.replaceAll(href, '[redacted-url]');
    const search = typeof requestUrl.search === 'string' ? requestUrl.search : '';
    if (search.length > 1) out = out.replaceAll(search, '');
  }
  if (apiKey) {
    const encoded = encodeURIComponent(apiKey);
    for (const secret of [apiKey, encoded, encoded.replace(/%20/g, '+')]) {
      if (secret) out = out.replaceAll(secret, '[redacted]');
    }
  }
  return out.replace(/([?&]apikey=)[^&\s'"]+/gi, '$1[redacted]');
}

export function explainBingError(message) {
  const text = redactBingSecret(message);
  if (text.includes('ThrottleIP') || text.includes('Throttle')) {
    return 'Bing is rate-limiting this server (ThrottleIP). Requests from this host are being refused. Try Sync now again later; if it keeps failing, Bing calls have to run outside this server. Saving the API key again will not fix it.';
  }
  return text.slice(0, 500);
}

// Bing answers in well under a second. A call that hangs must end as an error
// we can record, not as a background task the Worker silently cancels.
const BING_TIMEOUT_MS = 15000;

/**
 * Call one Bing Webmaster API method.
 *
 * No in-request retry on ThrottleIP. Bing throttles Cloudflare's shared egress
 * IPs, so waiting 20s and then 40s rarely helps, and it pushes a ctx.waitUntil()
 * sync past the Worker's ~30s post-response budget. The isolate is then killed
 * after the row was marked syncing and before any error is written. Fail fast,
 * let the caller store last_error, and leave the retry to the next cron run.
 * Error text must not include the request URL: the API key is a query param.
 * Timeout errors use a fixed sentence. Some runtimes put that URL in the
 * thrown message, and copying it would log the key.
 */
export async function bingGet(method, params = {}, timeoutMs = BING_TIMEOUT_MS) {
  const apiKey = params.apikey || await getBingApiKey();
  if (!apiKey) throw new Error('Bing Webmaster API key is not configured');
  const url = new URL(`${BASE}/${method}`);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (key === 'apikey' || value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const requested = Number.isFinite(timeoutMs) ? Math.floor(timeoutMs) : BING_TIMEOUT_MS;
  const limit = Math.min(BING_TIMEOUT_MS, Math.max(1000, requested));

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(limit) });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      const seconds = Math.max(1, Math.round(limit / 1000));
      throw new Error(`Bing ${method} did not answer within ${seconds}s`);
    }
    const detail = redactBingSecret(err?.message || err, apiKey, url);
    throw new Error(explainBingError(`Bing ${method} request failed: ${detail}`));
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok && !data.ErrorCode) {
    const rows = data.d;
    return Array.isArray(rows) ? rows : [];
  }
  const message = data.Message || `Bing ${method} failed (${res.status})`;
  throw new Error(explainBingError(redactBingSecret(message, apiKey, url)));
}

export async function listBingSites(apiKey) {
  return bingGet('GetUserSites', apiKey ? { apikey: apiKey } : {});
}
