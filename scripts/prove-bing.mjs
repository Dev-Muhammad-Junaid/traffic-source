/**
 * Proves the Bing Webmaster key can see this account's sites, and that
 * parseBingDate matches Bing's offset calendar day.
 * Usage: BING_KEY=... node scripts/prove-bing.mjs
 */
const EXPECTED = ['getbanksheet.com', 'grandtheftauto67.com', 'widgetsflow.com'];

function parseBingDate(value) {
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

function hostOf(value) {
  return new URL(value).hostname.replace(/^www\./, '');
}

const dateSample = parseBingDate('/Date(1316156400000-0700)/');
if (dateSample !== '2011-09-16') {
  console.error('FAIL date parse', dateSample);
  process.exit(1);
}
console.log('PASS date parse', dateSample);

const key = process.env.BING_KEY;
if (!key) {
  console.error('FAIL BING_KEY is not set');
  process.exit(1);
}

const sitesRes = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=${encodeURIComponent(key)}`);
const sitesBody = await sitesRes.json();
if (!sitesRes.ok || sitesBody.ErrorCode) {
  console.error('FAIL GetUserSites', sitesBody.Message || sitesRes.status);
  process.exit(1);
}
const hosts = (sitesBody.d || []).filter((site) => site.IsVerified).map((site) => hostOf(site.Url)).sort();
const missing = EXPECTED.filter((host) => !hosts.includes(host));
if (missing.length) {
  console.error('FAIL missing verified sites', missing.join(', '), 'got', hosts.join(', '));
  process.exit(1);
}
console.log('PASS verified sites', hosts.join(', '));

for (const host of EXPECTED) {
  const siteUrl = `https://${host}/`;
  for (const method of ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats', 'GetCrawlStats']) {
    const url = `https://ssl.bing.com/webmaster/api.svc/json/${method}?apikey=${encodeURIComponent(key)}&siteUrl=${encodeURIComponent(siteUrl)}`;
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok || body.ErrorCode) {
      console.error('FAIL', method, host, body.Message || res.status);
      process.exit(1);
    }
    const rows = Array.isArray(body.d) ? body.d.length : -1;
    console.log('PASS', method, host, 'rows=' + rows);
  }
}
