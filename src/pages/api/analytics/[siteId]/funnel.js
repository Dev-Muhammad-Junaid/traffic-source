import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';
import { parseDateRange, verifySiteOwnership } from '@/lib/analytics';

/**
 * Auto-funnel endpoint.
 *
 * 1. Looks at converted visitors in the date range and reads their page-view
 *    journeys from `page_views`.
 * 2. Picks the most common ordered path prefix walked by converters as the
 *    funnel steps (up to 5 steps).
 * 3. For each step, counts how many *total* visitors (not just converters)
 *    reached that pathname in order during the same date range, so the
 *    drop-off percentage is meaningful.
 */
export default withAuth(function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { siteId } = req.query;
  const site = verifySiteOwnership(siteId, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const db = getDb();
  const range = parseDateRange(req.query);
  const dateEnd = range.to + ' 23:59:59';

  // 1. Pull converter journeys (deduped consecutive pathnames per visitor).
  const converters = db
    .prepare(
      `SELECT DISTINCT visitor_id FROM conversions
       WHERE site_id = ? AND status = 'completed'
       AND datetime(created_at) BETWEEN ? AND ?`
    )
    .all(siteId, range.from, dateEnd);

  if (converters.length === 0) {
    return res.status(200).json({ steps: [], totalConverters: 0 });
  }

  const journeyStmt = db.prepare(
    `SELECT pathname FROM page_views
     WHERE site_id = ? AND visitor_id = ?
     AND datetime(timestamp) BETWEEN ? AND ?
     ORDER BY timestamp ASC`
  );

  // Build deduped journeys: collapse consecutive duplicates so refreshes don't bloat steps.
  const journeys = [];
  for (const { visitor_id } of converters) {
    const rows = journeyStmt.all(siteId, visitor_id, range.from, dateEnd);
    const path = [];
    for (const r of rows) {
      if (path[path.length - 1] !== r.pathname) path.push(r.pathname);
    }
    if (path.length > 0) journeys.push(path);
  }

  if (journeys.length === 0) {
    return res.status(200).json({ steps: [], totalConverters: converters.length });
  }

  // 2. Greedy: at each position, pick the pathname that the most remaining
  //    journeys share (in order). This finds the dominant funnel without
  //    requiring an exact match across all converters.
  const MAX_STEPS = 5;
  const steps = [];
  let pool = journeys.slice();

  for (let i = 0; i < MAX_STEPS; i++) {
    const counts = new Map();
    for (const j of pool) {
      if (i < j.length) counts.set(j[i], (counts.get(j[i]) || 0) + 1);
    }
    if (counts.size === 0) break;

    let bestPath = null;
    let bestCount = 0;
    for (const [p, c] of counts) {
      if (c > bestCount) {
        bestCount = c;
        bestPath = p;
      }
    }

    // Stop if the dominant next step is followed by less than 10% of the current pool —
    // means we've gone past the natural funnel end.
    if (bestCount / pool.length < 0.1) break;

    steps.push(bestPath);
    pool = pool.filter((j) => j[i] === bestPath);
  }

  if (steps.length === 0) {
    return res.status(200).json({ steps: [], totalConverters: converters.length });
  }

  // 3. For each step, count how many visitors (any, not just converters) reached
  //    that pathname AFTER reaching all prior steps, in order, in the date range.
  //
  // We do this by walking the page_views table once per step using a CTE per step.
  // Simpler approach: for each visitor that hit step 1, check if they hit the
  // remaining steps in order at any later timestamp. We use min(timestamp) per
  // (visitor, step) and require strictly increasing timestamps.
  const stepCounts = [];

  // Visitors who reached step 0 at all in the range
  let prevVisitorTimes = new Map(); // visitor_id -> earliest timestamp at which they reached the previous step

  for (let i = 0; i < steps.length; i++) {
    const path = steps[i];
    const rows = db
      .prepare(
        `SELECT visitor_id, MIN(timestamp) as t
         FROM page_views
         WHERE site_id = ? AND pathname = ?
         AND datetime(timestamp) BETWEEN ? AND ?
         GROUP BY visitor_id`
      )
      .all(siteId, path, range.from, dateEnd);

    let reached;
    if (i === 0) {
      reached = new Map(rows.map((r) => [r.visitor_id, r.t]));
    } else {
      reached = new Map();
      for (const r of rows) {
        const prevT = prevVisitorTimes.get(r.visitor_id);
        if (prevT && r.t > prevT) reached.set(r.visitor_id, r.t);
      }
    }
    stepCounts.push(reached.size);
    prevVisitorTimes = reached;
  }

  const total = stepCounts[0] || 0;
  const result = steps.map((path, i) => ({
    pathname: path,
    visitors: stepCounts[i],
    pctOfTotal: total ? stepCounts[i] / total : 0,
    pctOfPrev: i === 0 ? 1 : stepCounts[i - 1] ? stepCounts[i] / stepCounts[i - 1] : 0,
    dropOff: i === 0 ? 0 : stepCounts[i - 1] - stepCounts[i],
  }));

  res.status(200).json({
    site: { id: site.id, name: site.name, domain: site.domain },
    steps: result,
    totalConverters: converters.length,
  });
});
