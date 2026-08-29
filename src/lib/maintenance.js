import { getDb, isD1 } from './db';

export async function purgeOldPageViews(daysToKeep = 90) {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = await db
    .prepare("DELETE FROM page_views WHERE date(timestamp) < ?")
    .run(cutoffStr);

  // Events are retained on the same schedule. They accumulate faster than
  // pageviews (many per visit), so skipping them here would let the table
  // grow without bound.
  const events = await db
    .prepare("DELETE FROM events WHERE date(timestamp) < ?")
    .run(cutoffStr);

  return {
    deleted: result.changes,
    pageViewsDeleted: result.changes,
    eventsDeleted: events.changes,
  };
}

export async function getDatabaseSize() {
  const db = await getDb();
  if (isD1(db)) {
    return { bytes: 0, mb: '0', note: 'Size metrics unavailable on D1' };
  }
  const pageCount = db.raw.pragma('page_count', { simple: true });
  const pageSize = db.raw.pragma('page_size', { simple: true });
  const sizeBytes = pageCount * pageSize;

  return {
    bytes: sizeBytes,
    mb: (sizeBytes / (1024 * 1024)).toFixed(2),
  };
}

export async function vacuum() {
  const db = await getDb();
  if (isD1(db)) return;
  await db.exec('VACUUM');
}

export async function getTableCounts() {
  const db = await getDb();
  const count = async (table) => {
    const row = await db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    return row.count;
  };
  return {
    users: await count('users'),
    sites: await count('sites'),
    sessions: await count('sessions'),
    page_views: await count('page_views'),
    events: await count('events'),
    conversions: await count('conversions'),
    daily_stats: await count('daily_stats'),
  };
}
