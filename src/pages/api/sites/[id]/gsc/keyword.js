import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';
import { getSiteLink, getUserConnection, getDecryptedRefreshToken, refreshAccessToken, querySearchAnalytics } from '@/lib/gsc';
import { alpha3ToAlpha2 } from '@/lib/iso-countries';

const PERIOD_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '12m': 90 };

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

export default withAuth(async function handler(req, res) {
  const { id, query, period = '30d' } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  const days = PERIOD_DAYS[period] || 30;

  const db = getDb();
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND user_id = ?').get(id, req.user.userId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const link = getSiteLink(id);
  const conn = getUserConnection(req.user.userId);
  if (!link || !conn) return res.status(400).json({ error: 'Not connected' });

  let accessToken;
  try {
    accessToken = await refreshAccessToken(getDecryptedRefreshToken(conn));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const endDate = fmtDate(daysAgo(2));
  const startDate = fmtDate(daysAgo(days + 2));

  const filter = {
    dimensionFilterGroups: [{
      filters: [{ dimension: 'query', operator: 'equals', expression: query }],
    }],
  };

  let pages, countries, devices;
  try {
    [pages, countries, devices] = await Promise.all([
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['page'], rowLimit: 1000, ...filter }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['country'], rowLimit: 500, ...filter }),
      querySearchAnalytics({ accessToken, property: link.gsc_property, startDate, endDate, dimensions: ['device'], rowLimit: 10, ...filter }),
    ]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const mapRow = (r, key) => ({
    [key]: r.keys?.[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  });

  return res.status(200).json({
    query,
    period,
    days,
    pages: pages.map((r) => mapRow(r, 'page')).sort((a, b) => b.impressions - a.impressions),
    countries: countries
      .map((r) => ({ ...mapRow(r, 'country'), country_code: alpha3ToAlpha2(r.keys?.[0]) || null }))
      .sort((a, b) => b.impressions - a.impressions),
    devices: devices.map((r) => mapRow(r, 'device')).sort((a, b) => b.impressions - a.impressions),
  });
});
