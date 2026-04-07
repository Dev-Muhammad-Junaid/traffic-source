import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';

/**
 * User-flow / Sankey tree endpoint.
 *
 * Query params:
 *   root        - starting pathname (optional; auto-picks the most common entry page if omitted)
 *   depth       - max tree depth (default 4, max 6)
 *   topN        - how many children to keep per node (default 3, max 5)
 *   converters  - "1" to restrict to converted visitors only
 *
 * Response:
 *   {
 *     root: { pathname, visitors, children: [...] },
 *     totalVisitors: number,
 *     entryOptions: [{ pathname, visitors }, ...]   // top candidate roots
 *   }
 */
export default withAuth(function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { siteId } = req.query;
  const site = verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = getDb();
  const range = parseDateRange(req.query);
  const dateEnd = range.to + ' 23:59:59';
  const depth = Math.min(6, Math.max(1, parseInt(req.query.depth) || 4));
  const topN = Math.min(5, Math.max(1, parseInt(req.query.topN) || 3));
  const convertersOnly = req.query.converters === '1';

  // 1. Pick the visitor pool.
  let visitorRows;
  if (convertersOnly) {
    visitorRows = db
      .prepare(
        `SELECT DISTINCT visitor_id FROM conversions
         WHERE site_id = ? AND status = 'completed'
         AND datetime(created_at) BETWEEN ? AND ?`
      )
      .all(siteId, range.from, dateEnd);
  } else {
    visitorRows = db
      .prepare(
        `SELECT DISTINCT visitor_id FROM page_views
         WHERE site_id = ?
         AND datetime(timestamp) BETWEEN ? AND ?`
      )
      .all(siteId, range.from, dateEnd);
  }

  if (visitorRows.length === 0) {
    return res.status(200).json({ root: null, totalVisitors: 0, entryOptions: [] });
  }

  // 2. Build deduped journey per visitor.
  const journeyStmt = db.prepare(
    `SELECT pathname FROM page_views
     WHERE site_id = ? AND visitor_id = ?
     AND datetime(timestamp) BETWEEN ? AND ?
     ORDER BY timestamp ASC`
  );

  const journeys = [];
  for (const { visitor_id } of visitorRows) {
    const rows = journeyStmt.all(siteId, visitor_id, range.from, dateEnd);
    const path = [];
    for (const r of rows) {
      if (path[path.length - 1] !== r.pathname) path.push(r.pathname);
    }
    if (path.length > 0) journeys.push(path);
  }

  if (journeys.length === 0) {
    return res.status(200).json({ root: null, totalVisitors: 0, entryOptions: [] });
  }

  // 3. Compute candidate entry pages (top first-pathnames).
  const entryCounts = new Map();
  for (const j of journeys) {
    entryCounts.set(j[0], (entryCounts.get(j[0]) || 0) + 1);
  }
  const entryOptions = [...entryCounts.entries()]
    .map(([pathname, visitors]) => ({ pathname, visitors }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 8);

  const rootPath = req.query.root || entryOptions[0]?.pathname;
  if (!rootPath) {
    return res.status(200).json({ root: null, totalVisitors: 0, entryOptions });
  }

  // 4. Build the tree. Each node carries the list of journey-suffixes that reached it.
  function build(suffixes, level) {
    const visitors = suffixes.length;
    if (level >= depth) return { visitors, children: [] };

    // Count next-pathnames among suffixes that have at least one more step.
    const nextCounts = new Map();
    const buckets = new Map();
    for (const s of suffixes) {
      if (s.length === 0) continue;
      const next = s[0];
      nextCounts.set(next, (nextCounts.get(next) || 0) + 1);
      if (!buckets.has(next)) buckets.set(next, []);
      buckets.get(next).push(s.slice(1));
    }

    const top = [...nextCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    const children = top.map(([pathname]) => {
      const child = build(buckets.get(pathname), level + 1);
      return { pathname, ...child };
    });

    return { visitors, children };
  }

  // Find suffixes that *start* with rootPath (anywhere in the journey).
  const rootSuffixes = [];
  for (const j of journeys) {
    const idx = j.indexOf(rootPath);
    if (idx !== -1) rootSuffixes.push(j.slice(idx + 1));
  }

  const tree = build(rootSuffixes, 1);
  const root = { pathname: rootPath, visitors: rootSuffixes.length, children: tree.children };

  res.status(200).json({
    site: { id: site.id, name: site.name, domain: site.domain },
    root,
    totalVisitors: journeys.length,
    entryOptions,
  });
});
