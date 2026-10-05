/**
 * Shared session filter builders for analytics API routes.
 */


/**
 * Internal / QA traffic exclusion for reporting (raw rows stay in D1).
 *
 * Matches BankSheet ops rules (site 3 Monday briefs):
 * - Pakistan sessions (country = PK) — founder/internal
 * - session id `smokesid1` (literal smoke-test id)
 * - referrers from 127.0.0.1 or localhost (local dev)
 *
 * Pass exclude_internal=1 (or omit on site_id=3 where APIs default it on).
 * Pass exclude_internal=0 to include internal rows.
 */
export function wantsExcludeInternal(query, siteId) {
  const raw = query && query.exclude_internal;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  // BankSheet (site 3): default ON so E5/E3 metrics are not inflated by PK/smoke/localhost.
  return String(siteId) === '3';
}

/**
 * SQL fragments that drop internal sessions. Alias is the sessions table alias
 * ('' or 's'). Referrer checks cover both sessions.referrer and referrer_domain.
 */
export function buildInternalExclusion(alias = '') {
  const pfx = alias ? `${alias}.` : '';
  const clauses = [
    `COALESCE(${pfx}country, '') != 'PK'`,
    `${pfx}id != 'smokesid1'`,
    `COALESCE(${pfx}referrer, '') NOT LIKE '%127.0.0.1%'`,
    `COALESCE(${pfx}referrer, '') NOT LIKE '%localhost%'`,
    `COALESCE(${pfx}referrer_domain, '') NOT LIKE '%127.0.0.1%'`,
    `COALESCE(${pfx}referrer_domain, '') NOT LIKE '%localhost%'`,
  ];
  return { clauses, params: [] };
}

export function buildSessionFilters(query, alias = '', { excludeDate = false, siteId = null } = {}) {
  const pfx = alias ? `${alias}.` : '';
  const clauses = [];
  const params = [];

  if (wantsExcludeInternal(query, siteId ?? query.siteId)) {
    const internal = buildInternalExclusion(alias);
    clauses.push(...internal.clauses);
  }

  if (query.date && !excludeDate) {
    const day = String(query.date);
    if (day.includes(' ')) {
      clauses.push(`strftime('%Y-%m-%d %H:00', ${pfx}started_at) = ?`);
      params.push(day);
    } else {
      clauses.push(`date(${pfx}started_at) = ?`);
      params.push(day);
    }
  }
  if (query.channel) {
    if (query.channel === 'Direct') {
      clauses.push(`(${pfx}utm_source IS NULL AND (${pfx}referrer_domain IS NULL OR ${pfx}referrer_domain = ''))`);
    } else {
      clauses.push(`(${pfx}utm_source = ? OR ${pfx}referrer_domain = ?)`);
      params.push(query.channel, query.channel);
    }
  }
  if (query.country) {
    clauses.push(`${pfx}country = ?`);
    params.push(query.country);
  }
  if (query.city) {
    clauses.push(`${pfx}city = ?`);
    params.push(query.city);
  }
  if (query.entry_page) {
    clauses.push(`${pfx}entry_page = ?`);
    params.push(query.entry_page);
  }
  if (query.exit_page) {
    clauses.push(`${pfx}exit_page = ?`);
    params.push(query.exit_page);
  }
  if (query.browser) {
    clauses.push(`${pfx}browser = ?`);
    params.push(query.browser);
  }
  if (query.os) {
    clauses.push(`${pfx}os = ?`);
    params.push(query.os);
  }
  if (query.device) {
    clauses.push(`${pfx}device_type = ?`);
    params.push(query.device);
  }

  return { clauses, params };
}

export function buildPageViewFilters(query) {
  const clauses = [];
  const params = [];

  if (query.page) {
    clauses.push(`pathname = ?`);
    params.push(query.page);
  }

  return { clauses, params };
}

export function hasSessionFilters(query, siteId = null) {
  return !!(
    query.date ||
    query.channel ||
    query.country ||
    query.city ||
    query.entry_page ||
    query.exit_page ||
    query.browser ||
    query.os ||
    query.device ||
    wantsExcludeInternal(query, siteId ?? query.siteId)
  );
}

export function hasNonDateSessionFilters(query, siteId = null) {
  return !!(
    query.channel ||
    query.country ||
    query.city ||
    query.entry_page ||
    query.exit_page ||
    query.browser ||
    query.os ||
    query.device ||
    wantsExcludeInternal(query, siteId ?? query.siteId)
  );
}

/** Fill missing YYYY-MM-DD points so a country/device filter still shows every day. */
export function fillDailySeries(rows, from, to) {
  const map = new Map((rows || []).map((row) => [row.date, row]));
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return rows || [];
  const dayCount = Math.round((end - start) / 86400000) + 1;
  if (dayCount < 1 || dayCount > 400) return rows || [];

  const out = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(map.get(key) || { date: key, visitors: 0, sessions: 0, page_views: 0 });
  }
  return out;
}
