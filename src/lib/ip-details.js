import { getDb } from './db';

function isIp(value) {
  return typeof value === 'string' && value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value);
}

function connectionLabel({ mobile, proxy, hosting }) {
  if (proxy) return 'VPN or proxy';
  if (hosting) return 'Data center';
  if (mobile) return 'Mobile network';
  return 'Home or office broadband';
}

async function fetchPublicDetails(ip) {
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,timezone,isp,org,as,mobile,proxy,hosting`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'success') {
    throw new Error(data.message || 'IP lookup failed');
  }
  return {
    country: data.country || null,
    region: data.regionName || null,
    city: data.city || null,
    timezone: data.timezone || null,
    isp: data.isp || null,
    org: data.org || null,
    asn: data.as || null,
    mobile: data.mobile ? 1 : 0,
    proxy: data.proxy ? 1 : 0,
    hosting: data.hosting ? 1 : 0,
  };
}

export async function getIpDetails(siteId, ip) {
  if (!isIp(ip)) return null;
  const db = await getDb();
  const owned = await db.prepare(
    'SELECT 1 AS ok FROM sessions WHERE site_id = ? AND ip = ? LIMIT 1'
  ).get(siteId, ip);
  if (!owned) return null;

  const cached = await db.prepare('SELECT * FROM ip_details WHERE ip = ?').get(ip);
  if (cached) return { ...cached, connection: connectionLabel(cached) };

  const fresh = await fetchPublicDetails(ip);
  await db.prepare(
    `INSERT INTO ip_details (ip, country, region, city, timezone, isp, org, asn, mobile, proxy, hosting)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET
       country = excluded.country, region = excluded.region, city = excluded.city,
       timezone = excluded.timezone, isp = excluded.isp, org = excluded.org, asn = excluded.asn,
       mobile = excluded.mobile, proxy = excluded.proxy, hosting = excluded.hosting,
       looked_up_at = datetime('now')`
  ).run(ip, fresh.country, fresh.region, fresh.city, fresh.timezone, fresh.isp, fresh.org, fresh.asn, fresh.mobile, fresh.proxy, fresh.hosting);

  return { ip, ...fresh, connection: connectionLabel(fresh) };
}
