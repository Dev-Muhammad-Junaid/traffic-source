import { getDb } from './db';

export function parseDateRange(query) {
  const { from, to, period } = query;
  if (from && to) {
    return { from, to };
  }
  const now = new Date();
  const periods = {
    '24h': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '12m': 365,
  };
  const days = periods[period] || 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export async function verifySiteOwnership(siteId, userId) {
  const db = await getDb();
  return await db
    .prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?')
    .get(siteId, userId);
}

export async function getBreakdown(siteId, dateRange, table, groupField, limit = 20) {
  const db = await getDb();
  const timeField = table === 'sessions' ? 'started_at' : 'timestamp';
  return await db
    .prepare(
      `SELECT ${groupField} as name, COUNT(*) as count
       FROM ${table}
       WHERE site_id = ? AND datetime(${timeField}) BETWEEN ? AND ?
       AND ${groupField} IS NOT NULL AND ${groupField} != ''
       GROUP BY ${groupField}
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(siteId, dateRange.from, dateRange.to + ' 23:59:59', limit);
}
