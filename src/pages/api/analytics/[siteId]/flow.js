import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';

/**
 * User-flow / Sankey tree endpoint.
 *
 * Performance notes:
 *  - Single SQL query (ORDER BY visitor_id, timestamp) instead of N+1 per visitor.
 *  - In-memory cache keyed by (siteId|from|to|converters) lives for FLOW_TTL_MS.
 *    Tree shaping (root, depth, topN) is done in JS against the cached journeys,
 *    so changing root / "converters only" toggle is instant after the first hit.
 *
 * Query params:
 *   root        - starting pathname (optional; auto-picks the most common entry page)
 *   depth       - max tree depth (default 4, max 6)
 *   topN        - children per node (default 3, max 5)
 *   converters  - "1" to restrict pool to converted visitors only
 */

const FLOW_TTL_MS = 60_000; // 1 minute
const flowCache = new Map(); // key -> { expires, journeys, entryOptions, totalVisitors }

function loadJourneys(db, siteId, range, dateEnd, convertersOnly) {
  const cacheKey = `${siteId}|${range.from}|${range.to}|${convertersOnly ? 1 : 0}`;
  const cached = flowCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached;

  let rows;
  if (convertersOnly) {
    // Join page_views to converted visitors in one shot.
    rows = db
      .prepare(
        `SELECT pv.visitor_id, pv.pathname, pv.timestamp
         FROM page_views pv
         INNER JOIN (
           SELECT DISTINCT visitor_id FROM conversions
           WHERE site_id = ? AND status = 'completed'
           AND datetime(created_at) BETWEEN ? AND ?
         ) c ON c.visitor_id = pv.visitor_id
         WHERE pv.site_id = ?
         AND datetime(pv.timestamp) BETWEEN ? AND ?
         ORDER BY pv.visitor_id, pv.timestamp ASC`
      )
      .all(siteId, range.from, dateEnd, siteId, range.from, dateEnd);
  } else {
    rows = db
      .prepare(
        `SELECT visitor_id, pathname, timestamp
         FROM page_views
         WHERE site_id = ?
         AND datetime(timestamp) BETWEEN ? AND ?
         ORDER BY visitor_id, timestamp ASC`
      )
      .all(siteId, range.from, dateEnd);
  }

  // Single linear pass: bucket by visitor_id, dedupe consecutive pathnames.
  const journeys = [];
  let curVisitor = null;
  let curPath = null;
  for (const r of rows) {
    if (r.visitor_id !== curVisitor) {
      if (curPath && curPath.length > 0) journeys.push(curPath);
      curVisitor = r.visitor_id;
      curPath = [];
    }
    if (curPath[curPath.length - 1] !== r.pathname) curPath.push(r.pathname);
  }
  if (curPath && curPath.length > 0) journeys.push(curPath);

  // Top entry pages.
  const entryCounts = new Map();
  for (const j of journeys) {
    entryCounts.set(j[0], (entryCounts.get(j[0]) || 0) + 1);
  }
  const entryOptions = [...entryCounts.entries()]
    .map(([pathname, visitors]) => ({ pathname, visitors }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 8);

  const entry = {
    expires: Date.now() + FLOW_TTL_MS,
    journeys,
    entryOptions,
    totalVisitors: journeys.length,
  };

  // Tiny LRU-ish cap so the cache doesn't grow unbounded.
  if (flowCache.size > 100) {
    const firstKey = flowCache.keys().next().value;
    flowCache.delete(firstKey);
  }
  flowCache.set(cacheKey, entry);
  return entry;
}

function buildTree(journeys, rootPath, depth, topN) {
  const rootSuffixes = [];
  for (const j of journeys) {
    const idx = j.indexOf(rootPath);
    if (idx !== -1) rootSuffixes.push(j.slice(idx + 1));
  }

  function recurse(suffixes, level) {
    const visitors = suffixes.length;
    if (level >= depth) return { visitors, children: [] };

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
      const child = recurse(buckets.get(pathname), level + 1);
      return { pathname, ...child };
    });

    return { visitors, children };
  }

  const tree = recurse(rootSuffixes, 1);
  return { pathname: rootPath, visitors: rootSuffixes.length, children: tree.children };
}

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

  const { journeys, entryOptions, totalVisitors } = loadJourneys(
    db,
    siteId,
    range,
    dateEnd,
    convertersOnly
  );

  if (totalVisitors === 0) {
    return res.status(200).json({ root: null, totalVisitors: 0, entryOptions: [] });
  }

  const rootPath = req.query.root || entryOptions[0]?.pathname;
  if (!rootPath) {
    return res.status(200).json({ root: null, totalVisitors, entryOptions });
  }

  const root = buildTree(journeys, rootPath, depth, topN);

  // Tell the browser it can also cache for a short while.
  res.setHeader('Cache-Control', 'private, max-age=60');

  res.status(200).json({
    site: { id: site.id, name: site.name, domain: site.domain },
    root,
    totalVisitors,
    entryOptions,
  });
});
