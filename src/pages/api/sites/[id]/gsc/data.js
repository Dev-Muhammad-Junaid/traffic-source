import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getSiteLink, getUserConnection } from '@/lib/gsc';
import { alpha3ToAlpha2 } from '@/lib/iso-countries';

const PERIOD_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '12m': 90 };

export default withAuth(function handler(req, res) {
  const { id, period = '30d' } = req.query;
  const days = PERIOD_DAYS[period] || 30;

  const db = getDb();
  const site = db.prepare('SELECT id, name, domain FROM sites WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const userConn = getUserConnection(req.user.userId);
  const link = getSiteLink(id);

  if (!userConn) return res.status(200).json({ site, googleConnected: false, linked: false });
  if (!link) return res.status(200).json({ site, googleConnected: true, googleEmail: userConn.google_email, linked: false });

  // GSC has 2-3d lag — anchor end at today-1 (exclusive), so data through today-2 is included.
  // Current window: dates >= today-(days+1) and < today-1   → covers `days` full days ending at today-2
  // Previous window: dates >= today-(2*days+1) and < today-(days+1)
  const curStart = `date('now','-${days + 1} days')`;
  const curEnd = `date('now','-1 days')`;
  const prevStart = `date('now','-${2 * days + 1} days')`;
  const prevEnd = `date('now','-${days + 1} days')`;

  // ── Totals: current + previous, weighted CTR/position (from gsc_daily_totals — most accurate) ──
  const totalsRow = db.prepare(`
    SELECT
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN clicks ELSE 0 END) AS clicks,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN clicks ELSE 0 END) AS clicks_prev,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN impressions ELSE 0 END) AS impressions,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN impressions ELSE 0 END) AS impressions_prev,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN position * impressions ELSE 0 END) AS pos_num,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN impressions ELSE 0 END) AS pos_den,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN position * impressions ELSE 0 END) AS pos_num_prev,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN impressions ELSE 0 END) AS pos_den_prev
    FROM gsc_daily_totals WHERE site_id = ?
  `).get(id) || {};

  const totals = {
    clicks: totalsRow.clicks || 0,
    clicks_prev: totalsRow.clicks_prev || 0,
    impressions: totalsRow.impressions || 0,
    impressions_prev: totalsRow.impressions_prev || 0,
    avg_position: totalsRow.pos_den ? totalsRow.pos_num / totalsRow.pos_den : 0,
    avg_position_prev: totalsRow.pos_den_prev ? totalsRow.pos_num_prev / totalsRow.pos_den_prev : 0,
    avg_ctr: totalsRow.impressions ? totalsRow.clicks / totalsRow.impressions : 0,
    avg_ctr_prev: totalsRow.impressions_prev ? totalsRow.clicks_prev / totalsRow.impressions_prev : 0,
  };

  // ── Time series for the current window (from totals — accurate, includes anonymized) ──
  const timeSeries = db.prepare(`
    SELECT date, clicks, impressions
    FROM gsc_daily_totals
    WHERE site_id = ? AND date >= ${curStart} AND date < ${curEnd}
    ORDER BY date ASC
  `).all(id);

  // ── Top pages (current period) — from page-only fetch, includes impression-only pages ──
  const topPages = db.prepare(`
    SELECT page,
      SUM(clicks) AS clicks,
      SUM(impressions) AS impressions,
      CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
    FROM gsc_daily_pages
    WHERE site_id = ? AND date >= ${curStart} AND date < ${curEnd}
    GROUP BY page
    ORDER BY impressions DESC
    LIMIT 100
  `).all(id);

  const topCountriesRaw = db.prepare(`
    SELECT country,
      SUM(clicks) AS clicks,
      SUM(impressions) AS impressions,
      CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
    FROM gsc_daily_countries
    WHERE site_id = ? AND date >= ${curStart} AND date < ${curEnd}
    GROUP BY country
    ORDER BY impressions DESC
    LIMIT 25
  `).all(id);

  const topCountries = topCountriesRaw.map((c) => ({
    ...c,
    country_code: alpha3ToAlpha2(c.country) || null,
  }));

  const devices = db.prepare(`
    SELECT device,
      SUM(clicks) AS clicks,
      SUM(impressions) AS impressions,
      CASE WHEN SUM(impressions) > 0 THEN SUM(clicks) * 1.0 / SUM(impressions) ELSE 0 END AS ctr,
      CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) * 1.0 / SUM(impressions) ELSE 0 END AS position
    FROM gsc_daily_devices
    WHERE site_id = ? AND date >= ${curStart} AND date < ${curEnd}
    GROUP BY device
    ORDER BY impressions DESC
  `).all(id);

  // ── Per-query aggregation, current + previous, used for top + insights ──
  const queryRows = db.prepare(`
    SELECT query,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN clicks ELSE 0 END) AS clicks,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN clicks ELSE 0 END) AS clicks_prev,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN impressions ELSE 0 END) AS impressions,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN impressions ELSE 0 END) AS impressions_prev,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN position * impressions ELSE 0 END) AS pos_num,
      SUM(CASE WHEN date >= ${curStart} AND date < ${curEnd} THEN impressions ELSE 0 END) AS pos_den,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN position * impressions ELSE 0 END) AS pos_num_prev,
      SUM(CASE WHEN date >= ${prevStart} AND date < ${prevEnd} THEN impressions ELSE 0 END) AS pos_den_prev
    FROM gsc_daily
    WHERE site_id = ?
    GROUP BY query
    HAVING (clicks + clicks_prev + impressions + impressions_prev) > 0
  `).all(id);

  const enriched = queryRows.map((r) => {
    const position = r.pos_den ? r.pos_num / r.pos_den : 0;
    const positionPrev = r.pos_den_prev ? r.pos_num_prev / r.pos_den_prev : 0;
    const ctr = r.impressions ? r.clicks / r.impressions : 0;
    const deltaClicks = (r.clicks || 0) - (r.clicks_prev || 0);
    const deltaPosition = positionPrev && position ? positionPrev - position : 0;
    let status;
    if ((r.clicks_prev || 0) === 0 && (r.clicks || 0) > 0) status = 'new';
    else if ((r.clicks || 0) === 0 && (r.clicks_prev || 0) > 0) status = 'lost';
    else if (deltaClicks > 0 || deltaPosition > 0.5) status = 'growing';
    else if (deltaClicks < 0 || deltaPosition < -0.5) status = 'declining';
    else status = 'stable';
    return {
      query: r.query,
      clicks_28d: r.clicks || 0,
      clicks_prev_28d: r.clicks_prev || 0,
      impressions_28d: r.impressions || 0,
      position_28d: position,
      position_prev_28d: positionPrev,
      ctr_28d: ctr,
      delta_clicks: deltaClicks,
      delta_position: deltaPosition,
      status,
    };
  });

  const topQueries = [...enriched]
    .sort((a, b) => (b.clicks_28d - a.clicks_28d) || (b.impressions_28d - a.impressions_28d))
    .slice(0, 25)
    .map((r) => ({
      query: r.query,
      clicks: r.clicks_28d,
      impressions: r.impressions_28d,
      ctr: r.ctr_28d,
      position: r.position_28d,
      delta_clicks: r.delta_clicks,
    }));

  const winners = enriched.filter((r) => r.status === 'growing').sort((a, b) => b.delta_clicks - a.delta_clicks).slice(0, 20);
  const losers = enriched.filter((r) => r.status === 'declining').sort((a, b) => a.delta_clicks - b.delta_clicks).slice(0, 20);
  const opportunities = enriched
    .filter((r) => r.position_28d >= 8 && r.position_28d <= 20 && r.impressions_28d >= 50)
    .sort((a, b) => b.impressions_28d - a.impressions_28d)
    .slice(0, 20);
  const quickWins = enriched
    .filter((r) => r.impressions_28d >= 100 && r.ctr_28d < 0.02 && r.position_28d <= 10)
    .sort((a, b) => b.impressions_28d - a.impressions_28d)
    .slice(0, 20);
  const lost = enriched.filter((r) => r.status === 'lost').sort((a, b) => b.clicks_prev_28d - a.clicks_prev_28d).slice(0, 20);
  const newQueries = enriched.filter((r) => r.status === 'new').sort((a, b) => b.clicks_28d - a.clicks_28d).slice(0, 20);

  return res.status(200).json({
    site,
    googleConnected: true,
    googleEmail: userConn.google_email,
    linked: true,
    period,
    days,
    link: {
      property: link.gsc_property,
      status: link.status,
      lastSyncAt: link.last_sync_at,
      lastError: link.last_error,
    },
    totals,
    timeSeries,
    topPages,
    topQueries,
    topCountries,
    devices,
    winners,
    losers,
    opportunities,
    quickWins,
    lost,
    newQueries,
  });
});
