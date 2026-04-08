import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  LuSearch, LuTrendingUp, LuTrendingDown, LuTarget, LuLightbulb, LuSparkles, LuSkull,
  LuMousePointerClick, LuEye, LuPercent, LuArrowUpRight, LuArrowDownRight, LuExternalLink, LuUnlink,
  LuGlobe, LuMonitor, LuSmartphone, LuTablet, LuChevronRight,
} from 'react-icons/lu';
import { getCountryName } from '@/lib/formatters';
import CountryFlag from '@/components/ui/CountryFlag';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useDateRange } from '@/contexts/DateRangeContext';

export default function GscPage() {
  const router = useRouter();
  const { siteId } = router.query;
  const { period } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [propsLoading, setPropsLoading] = useState(false);
  const [properties, setProperties] = useState(null);
  const [propSiteDomain, setPropSiteDomain] = useState('');
  const [selectedProp, setSelectedProp] = useState('');
  const [linking, setLinking] = useState(false);
  const [pageError, setPageError] = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const r = await fetch(`/api/sites/${siteId}/gsc/data?period=${period}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, [siteId, period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (data?.googleConnected && !data?.linked && !properties) {
      loadProperties();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const loadProperties = async () => {
    setPropsLoading(true);
    const r = await fetch(`/api/sites/${siteId}/gsc/properties`);
    const d = await r.json();
    setPropsLoading(false);
    if (!r.ok) { setPageError(d.error); return; }
    setProperties(d.properties);
    setPropSiteDomain(d.siteDomain || '');
    if (d.properties[0]) setSelectedProp(d.properties[0].siteUrl);
  };

  const linkProperty = async () => {
    setLinking(true);
    const r = await fetch(`/api/sites/${siteId}/gsc/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: selectedProp }),
    });
    setLinking(false);
    if (r.ok) { setProperties(null); load(); }
  };

  const unlink = async () => {
    if (!confirm('Unlink this site from Search Console? All synced keyword data will be deleted.')) return;
    await fetch(`/api/sites/${siteId}/gsc/disconnect`, { method: 'POST' });
    setProperties(null);
    load();
  };

  if (loading || !data) {
    return (
      <DashboardLayout siteId={siteId}>
        <div className="loading-inline"><div className="loading-spinner" /></div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Head><title>Search Console - {data.site?.name}</title></Head>
      <DashboardLayout siteId={siteId} siteName={data.site?.name} siteDomain={data.site?.domain}>
        {pageError && <div className="auth-error" style={{ marginBottom: 16 }}>{pageError}</div>}

        {!data.googleConnected && <NotConnectedState />}

        {data.googleConnected && !data.linked && (
          <PropertyPicker
            properties={properties}
            selectedProp={selectedProp}
            setSelectedProp={setSelectedProp}
            onLink={linkProperty}
            linking={linking}
            loading={propsLoading}
            googleEmail={data.googleEmail}
            siteDomain={propSiteDomain || data.site?.domain}
          />
        )}

        {data.googleConnected && data.linked && <Dashboard data={data} onUnlink={unlink} />}
      </DashboardLayout>
    </>
  );
}

function NotConnectedState() {
  return (
    <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
      <LuSearch size={48} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
      <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Google Search Console not connected</h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
        Connect your Google account once in Settings, then come back here to link this site to a Search Console property.
      </p>
      <a href="/settings" className="btn btn-primary">Go to Settings → Integrations</a>
    </div>
  );
}

function PropertyPicker({ properties, selectedProp, setSelectedProp, onLink, linking, loading, googleEmail, siteDomain }) {
  if (loading || !properties) return <div className="loading-inline"><div className="loading-spinner" /></div>;
  if (!properties.length) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
        <LuSearch size={36} style={{ marginBottom: 8, color: 'var(--text-muted)' }} />
        <h3 style={{ margin: '0 0 6px' }}>No matching property found</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          No verified Search Console property matches <strong>{siteDomain}</strong> on <strong>{googleEmail}</strong>.<br />
          Add and verify this domain in <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console</a> first.
        </p>
      </div>
    );
  }
  return (
    <div className="panel" style={{ padding: 24 }}>
      <h3 style={{ marginTop: 0 }}>Pick a Search Console property to link</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8 }}>Properties from <strong>{googleEmail}</strong></p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {properties.map((p) => (
          <label key={p.siteUrl} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
            <input type="radio" name="prop" value={p.siteUrl} checked={selectedProp === p.siteUrl} onChange={() => setSelectedProp(p.siteUrl)} />
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>{p.siteUrl}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{p.permissionLevel}</span>
          </label>
        ))}
      </div>
      <button className="btn btn-primary" onClick={onLink} disabled={!selectedProp || linking}>
        {linking ? 'Linking…' : 'Link & start sync'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────

function Dashboard({ data, onUnlink }) {
  const t = data.totals || {};
  const clicks = t.clicks || 0;
  const clicksPrev = t.clicks_prev || 0;
  const imps = t.impressions || 0;
  const impsPrev = t.impressions_prev || 0;
  const avgPos = t.avg_position || 0;
  const avgPosPrev = t.avg_position_prev || 0;
  const avgCtr = t.avg_ctr || 0;
  const avgCtrPrev = t.avg_ctr_prev || 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>Property: <strong style={{ color: 'var(--text)' }}>{data.link.property}</strong></span>
        <span>·</span>
        <span>{data.googleEmail}</span>
        {data.link.lastSyncAt && <><span>·</span><span>Last sync {timeAgo(data.link.lastSyncAt)}</span></>}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onUnlink}>
          <LuUnlink size={14} /> Unlink
        </button>
      </div>

      {data.link.lastError && (
        <div className="auth-error" style={{ marginBottom: 16 }}>Last sync error: {data.link.lastError}</div>
      )}

      {!data.link.lastSyncAt && (
        <div className="panel" style={{ padding: 16, marginBottom: 16, fontSize: 13 }}>
          Initial backfill is running in the background. Refresh in a moment to see your data.
        </div>
      )}

      {/* Metric strip */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard icon={LuMousePointerClick} label="Clicks" value={fmtNum(clicks)} cur={clicks} prev={clicksPrev} days={data.days} />
        <MetricCard icon={LuEye} label="Impressions" value={fmtNum(imps)} cur={imps} prev={impsPrev} days={data.days} />
        <MetricCard icon={LuPercent} label="Avg. CTR" value={(avgCtr * 100).toFixed(1) + '%'} cur={avgCtr} prev={avgCtrPrev} days={data.days} />
        <MetricCard icon={LuTarget} label="Avg. Position" value={avgPos.toFixed(1)} cur={avgPos} prev={avgPosPrev} days={data.days} invert />
      </div>

      {/* Trend chart */}
      <GscChart data={data.timeSeries || []} days={data.days} />


      {/* Keyword-centric drill-down */}
      <KeywordExplorer siteId={data.site.id} period={data.period} days={data.days} rows={data.topQueries} />

      {/* Insights */}
      <InsightsPanel data={data} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Metric card
// ─────────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, cur, prev, invert, days }) {
  const delta = (cur || 0) - (prev || 0);
  const pct = prev ? Math.round((delta / prev) * 100) : 0;
  // For position, lower is better — invert direction
  const positive = invert ? delta < 0 : delta > 0;
  const ArrowIcon = positive ? LuArrowUpRight : LuArrowDownRight;
  const color = positive ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <Icon size={14} /> {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, color: 'var(--text)' }}>{value}</div>
      {prev > 0 && (
        <div style={{ fontSize: 12, marginTop: 4, color, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ArrowIcon size={12} />
          {Math.abs(pct)}% vs previous {days}d
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Data table
// ─────────────────────────────────────────────────────────────────

function DataTable({ title, subtitle, rows, cols }) {
  return (
    <div className="panel" style={{ padding: 0, marginBottom: 20 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {(!rows || rows.length === 0) ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data yet</div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table className="journey-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} style={{ textAlign: c.flex ? 'left' : 'right', whiteSpace: 'nowrap' }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => {
                    const v = r[c.key];
                    const display = c.render ? c.render(v, r) : (c.fmt ? c.fmt(v) : v);
                    return (
                      <td
                        key={c.key}
                        style={{
                          textAlign: c.flex ? 'left' : 'right',
                          whiteSpace: 'nowrap',
                          maxWidth: c.flex ? 360 : undefined,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: 13,
                        }}
                        title={typeof v === 'string' ? v : undefined}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeviceIcon({ name }) {
  const n = (name || '').toLowerCase();
  if (n === 'mobile') return <LuSmartphone size={14} />;
  if (n === 'tablet') return <LuTablet size={14} />;
  if (n === 'desktop') return <LuMonitor size={14} />;
  return <LuGlobe size={14} />;
}

function PageLink({ url }) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text)' }}>
        {u.pathname}{u.search}
        <LuExternalLink size={11} style={{ opacity: 0.5 }} />
      </a>
    );
  } catch {
    return url;
  }
}

// ─────────────────────────────────────────────────────────────────
// Insights tabs
// ─────────────────────────────────────────────────────────────────

function InsightsPanel({ data }) {
  const tabs = [
    { key: 'winners', label: 'Winners', icon: LuTrendingUp, subtitle: 'Keywords gaining clicks vs previous period', rows: data.winners, cols: insightCols('delta') },
    { key: 'losers', label: 'Losers', icon: LuTrendingDown, subtitle: 'Keywords losing clicks vs previous period', rows: data.losers, cols: insightCols('delta') },
    { key: 'opportunities', label: 'Opportunities', icon: LuLightbulb, subtitle: 'Position 8–20 — close to page 1', rows: data.opportunities, cols: insightCols('opp') },
    { key: 'quickWins', label: 'Quick wins', icon: LuTarget, subtitle: 'High impressions but low CTR — improve title/meta', rows: data.quickWins, cols: insightCols('opp') },
    { key: 'newQueries', label: 'New', icon: LuSparkles, subtitle: 'Keywords appearing for the first time', rows: data.newQueries, cols: insightCols('new') },
    { key: 'lost', label: 'Lost', icon: LuSkull, subtitle: 'Keywords that dropped out', rows: data.lost, cols: insightCols('lost') },
  ];
  const [active, setActive] = useState('winners');
  const cur = tabs.find((t) => t.key === active);

  return (
    <div className="panel" style={{ padding: 0, marginBottom: 20 }}>
      <div className="panel-header" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="panel-tabs" style={{ display: 'flex', gap: 4, padding: 8, flexWrap: 'wrap' }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const count = (t.rows || []).length;
            return (
              <button
                key={t.key}
                className={`panel-tab ${active === t.key ? 'active' : ''}`}
                onClick={() => setActive(t.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon size={14} /> {t.label} {count > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({count})</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        {cur.subtitle}
      </div>
      {(!cur.rows || cur.rows.length === 0) ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data in this category</div>
      ) : (
        <table className="journey-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              {cur.cols.map((c) => (
                <th key={c.key} style={{ textAlign: c.flex ? 'left' : 'right', whiteSpace: 'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cur.rows.map((r, i) => (
              <tr key={i}>
                {cur.cols.map((c) => {
                  const v = r[c.key];
                  const display = c.render ? c.render(v, r) : (c.fmt ? c.fmt(v) : v);
                  return (
                    <td key={c.key} style={{ textAlign: c.flex ? 'left' : 'right', maxWidth: c.flex ? 360 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function insightCols(variant) {
  const query = { key: 'query', label: 'Query', flex: 1 };
  const clicks = { key: 'clicks_28d', label: 'Clicks', fmt: fmtNum };
  const impressions = { key: 'impressions_28d', label: 'Impr.', fmt: fmtNum };
  const ctr = { key: 'ctr_28d', label: 'CTR', fmt: (v) => (v * 100).toFixed(1) + '%' };
  const pos = { key: 'position_28d', label: 'Pos.', fmt: (v) => v.toFixed(1) };
  const delta = {
    key: 'delta_clicks', label: 'Δ Clicks',
    render: (v) => (
      <span style={{ color: v >= 0 ? 'var(--success)' : 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
        {v >= 0 ? <LuArrowUpRight size={12} /> : <LuArrowDownRight size={12} />}
        {v >= 0 ? '+' : ''}{fmtNum(v)}
      </span>
    ),
  };

  if (variant === 'delta') return [query, clicks, delta, pos];
  if (variant === 'opp') return [query, impressions, ctr, pos];
  if (variant === 'new') return [query, clicks, pos];
  if (variant === 'lost') {
    return [
      query,
      { key: 'clicks_prev_28d', label: 'Clicks (prev)', fmt: fmtNum },
      { key: 'position_prev_28d', label: 'Pos. (prev)', fmt: (v) => v.toFixed(1) },
    ];
  }
  return [query, clicks, impressions, ctr, pos];
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Keyword Explorer — keyword-centric drill-down
// (click a keyword to see pages, countries, devices for that exact query)
// ─────────────────────────────────────────────────────────────────

function KeywordExplorer({ siteId, period, days, rows }) {
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({}); // { [query]: { loading, data, error } }

  const toggle = async (query) => {
    if (expanded === query) { setExpanded(null); return; }
    setExpanded(query);
    if (details[query]?.data) return;
    setDetails((d) => ({ ...d, [query]: { loading: true } }));
    try {
      const r = await fetch(`/api/sites/${siteId}/gsc/keyword?query=${encodeURIComponent(query)}&period=${period}`);
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Failed');
      setDetails((d) => ({ ...d, [query]: { data: json } }));
    } catch (err) {
      setDetails((d) => ({ ...d, [query]: { error: err.message } }));
    }
  };

  return (
    <div className="panel" style={{ padding: 0, marginBottom: 20 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Keyword explorer</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Click any keyword to see which pages it ranks for, where searchers are, and what devices they use — last {days} days
        </div>
      </div>

      {(!rows || rows.length === 0) ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No keywords yet</div>
      ) : (
        <table className="journey-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th style={{ textAlign: 'left' }}>Keyword</th>
              <th style={{ textAlign: 'right' }}>Clicks</th>
              <th style={{ textAlign: 'right' }}>Impr.</th>
              <th style={{ textAlign: 'right' }}>CTR</th>
              <th style={{ textAlign: 'right' }}>Pos.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isOpen = expanded === r.query;
              const det = details[r.query];
              return (
                <FragmentRow key={i}>
                  <tr
                    onClick={() => toggle(r.query)}
                    style={{ cursor: 'pointer', background: isOpen ? 'var(--bg)' : undefined }}
                  >
                    <td style={{ paddingLeft: 12 }}>
                      <LuChevronRight
                        size={14}
                        style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--text-muted)' }}
                      />
                    </td>
                    <td style={{ textAlign: 'left', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: isOpen ? 600 : 500 }} title={r.query}>
                      {r.query}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{fmtNum(r.clicks)}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{fmtNum(r.impressions)}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{(r.ctr * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{r.position.toFixed(1)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                        <KeywordDetails det={det} />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FragmentRow({ children }) {
  // wrapper to allow returning two <tr> elements from .map without React keys complaint
  return <>{children}</>;
}

function KeywordDetails({ det }) {
  if (!det || det.loading) {
    return (
      <div style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 12 }}>
        <div className="loading-spinner" style={{ width: 14, height: 14 }} /> Loading insights…
      </div>
    );
  }
  if (det.error) return <div style={{ padding: 16, color: 'var(--danger)', fontSize: 12 }}>{det.error}</div>;

  const d = det.data;
  if (!d) return null;

  const totalImps = d.pages.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalDeviceImps = d.devices.reduce((s, x) => s + (x.impressions || 0), 0);
  const totalCountryImps = d.countries.reduce((s, x) => s + (x.impressions || 0), 0);

  return (
    <div style={{ padding: '20px 0 24px', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.1fr' }} className="gsc-keyword-grid">
      <style jsx>{`.gsc-keyword-grid > :global(.gsc-section):first-child { border-left: none !important; }`}</style>
      {/* PAGES */}
      <Section icon={LuExternalLink} title="Pages ranking for this keyword" hint={`${d.pages.length} page${d.pages.length === 1 ? '' : 's'}`}>
        {d.pages.length === 0 ? <Empty>No page data</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {d.pages.slice(0, 8).map((p, i) => {
              const share = totalImps ? (p.impressions / totalImps) * 100 : 0;
              return (
                <BarRow
                  key={i}
                  label={<PageLink url={p.page} />}
                  primary={fmtNum(p.clicks)}
                  primaryLabel="clicks"
                  secondary={`${fmtNum(p.impressions)} impr · pos ${p.position.toFixed(1)}`}
                  share={share}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* COUNTRIES */}
      <Section icon={LuGlobe} title="Where searchers are" hint={`${d.countries.length} countr${d.countries.length === 1 ? 'y' : 'ies'}`}>
        {d.countries.length === 0 ? <Empty>No country data</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {d.countries.slice(0, 8).map((c, i) => {
              const share = totalCountryImps ? (c.impressions / totalCountryImps) * 100 : 0;
              const name = c.country_code ? (getCountryName(c.country_code) || c.country_code) : c.country;
              return (
                <BarRow
                  key={i}
                  label={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <CountryFlag code={c.country_code || ''} size="s" /> {name}
                    </span>
                  }
                  primary={fmtNum(c.impressions)}
                  primaryLabel="impr"
                  secondary={c.clicks > 0 ? `${fmtNum(c.clicks)} clicks` : null}
                  share={share}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* DEVICES — segmented horizontal bar */}
      <Section icon={LuMonitor} title="Device split">
        {d.devices.length === 0 ? <Empty>No device data</Empty> : (
          <DeviceSplit devices={d.devices} totalImps={totalDeviceImps} />
        )}
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <div style={{ minWidth: 0, padding: '0 24px', borderLeft: '1px solid var(--border)' }} className="gsc-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap' }}>
          <Icon size={13} /> {title}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{children}</div>;
}

function BarRow({ label, primary, primaryLabel, secondary, share }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{label}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {primary} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>{primaryLabel}</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.max(share, 1.5)}%`,
            background: 'var(--text)',
            opacity: 0.85,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      {secondary && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{secondary}</div>
      )}
    </div>
  );
}

function DeviceSplit({ devices, totalImps }) {
  // Sort: desktop, mobile, tablet for consistency
  const order = { desktop: 0, mobile: 1, tablet: 2 };
  const sorted = [...devices].sort((a, b) => (order[(a.device || '').toLowerCase()] ?? 9) - (order[(b.device || '').toLowerCase()] ?? 9));

  const segments = sorted.map((dv) => ({
    ...dv,
    share: totalImps ? dv.impressions / totalImps : 0,
  }));

  // Three opacities of the same --text color so it stays monochrome
  const opacities = [1, 0.55, 0.28];

  return (
    <div>
      {/* Big total */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{fmtNum(totalImps)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>total impressions</div>
      </div>

      {/* Segmented horizontal bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-surface)', marginBottom: 14 }}>
        {segments.map((s, i) => (
          <div
            key={i}
            title={`${s.device}: ${(s.share * 100).toFixed(1)}%`}
            style={{
              width: `${s.share * 100}%`,
              background: 'var(--text)',
              opacity: opacities[i] ?? 0.2,
              borderRight: i < segments.length - 1 ? '2px solid var(--bg-card)' : 'none',
              transition: 'width 0.4s ease',
            }}
          />
        ))}
      </div>

      {/* Legend rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: 'var(--text)', opacity: opacities[i] ?? 0.2,
              flexShrink: 0,
            }} />
            <DeviceIcon name={s.device} />
            <span style={{ flex: 1, color: 'var(--text)', textTransform: 'capitalize' }}>{(s.device || '').toLowerCase()}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtNum(s.clicks)} clk · {fmtNum(s.impressions)} impr</span>
            <span style={{ minWidth: 42, textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{(s.share * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Custom SVG chart — clicks (line+area) + impressions (line)
// ─────────────────────────────────────────────────────────────────

function GscChart({ data, days = 30 }) {
  const [hover, setHover] = useState(null); // { i, x, y }
  const [width, setWidth] = useState(800);
  const containerRef = useCallback((node) => {
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
  }, []);

  const height = 260;
  const padding = { top: 24, right: 56, bottom: 32, left: 56 };
  const innerW = Math.max(width - padding.left - padding.right, 10);
  const innerH = height - padding.top - padding.bottom;

  if (!data || data.length === 0) {
    return (
      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Performance — last {days} {days === 1 ? 'day' : 'days'}</div>
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No data yet
        </div>
      </div>
    );
  }

  const maxClicks = Math.max(1, ...data.map((d) => d.clicks));
  const maxImps = Math.max(1, ...data.map((d) => d.impressions));
  const niceClicks = niceMax(maxClicks);
  const niceImps = niceMax(maxImps);

  const xAt = (i) => padding.left + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const yClicks = (v) => padding.top + innerH - (v / niceClicks) * innerH;
  const yImps = (v) => padding.top + innerH - (v / niceImps) * innerH;

  // Monotone cubic (Fritsch-Carlson) — prevents overshoot above/below data points
  const linePath = (yFn) => {
    const pts = data.map((d, i) => [xAt(i), yFn(yFn === yClicks ? d.clicks : d.impressions)]);
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M ${pts[0][0]} ${pts[0][1]}`;

    const dxs = [], dys = [], ms = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      dxs.push(dx);
      dys.push(dy);
      ms.push(dx === 0 ? 0 : dy / dx);
    }

    const tangents = new Array(n);
    tangents[0] = ms[0];
    tangents[n - 1] = ms[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (ms[i - 1] * ms[i] <= 0) {
        tangents[i] = 0;
      } else {
        const dxSum = dxs[i - 1] + dxs[i];
        tangents[i] = (3 * dxSum) / ((dxSum + dxs[i]) / ms[i - 1] + (dxSum + dxs[i - 1]) / ms[i]);
      }
    }

    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = dxs[i];
      const x1 = pts[i][0] + dx / 3;
      const y1 = pts[i][1] + (tangents[i] * dx) / 3;
      const x2 = pts[i + 1][0] - dx / 3;
      const y2 = pts[i + 1][1] - (tangents[i + 1] * dx) / 3;
      d += ` C ${x1} ${y1}, ${x2} ${y2}, ${pts[i + 1][0]} ${pts[i + 1][1]}`;
    }
    return d;
  };

  const areaPath = linePath(yClicks) + ` L ${xAt(data.length - 1)} ${padding.top + innerH} L ${xAt(0)} ${padding.top + innerH} Z`;

  // Y-axis ticks (4 segments)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    y: padding.top + innerH - f * innerH,
    clicks: Math.round(niceClicks * f),
    imps: Math.round(niceImps * f),
  }));

  // X labels — show ~6 evenly spaced
  const xLabelStep = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % xLabelStep === 0 || i === data.length - 1);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padding.left || x > padding.left + innerW) { setHover(null); return; }
    const ratio = (x - padding.left) / innerW;
    const i = Math.round(ratio * (data.length - 1));
    setHover({ i, x: xAt(i) });
  };

  return (
    <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Performance — last {days} {days === 1 ? 'day' : 'days'}</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--gsc-clicks, #6366f1)' }} /> Clicks
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 2, background: 'var(--gsc-imps, #10b981)' }} /> Impressions
          </span>
        </div>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={width}
          height={height}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="gsc-clicks-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {yTicks.map((t, i) => (
            <line
              key={i}
              x1={padding.left} y1={t.y} x2={padding.left + innerW} y2={t.y}
              stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} opacity={i === 0 ? 0.6 : 0.4}
            />
          ))}

          {/* Y-axis labels — left (clicks) */}
          {yTicks.map((t, i) => (
            <text
              key={`yl-${i}`}
              x={padding.left - 10} y={t.y + 4}
              textAnchor="end" fontSize="10" fill="var(--text-muted)"
            >
              {fmtNum(t.clicks)}
            </text>
          ))}

          {/* Y-axis labels — right (impressions) */}
          {yTicks.map((t, i) => (
            <text
              key={`yr-${i}`}
              x={padding.left + innerW + 10} y={t.y + 4}
              textAnchor="start" fontSize="10" fill="var(--text-muted)"
            >
              {fmtNum(t.imps)}
            </text>
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ d, i }) => (
            <text
              key={`x-${i}`}
              x={xAt(i)} y={padding.top + innerH + 18}
              textAnchor="middle" fontSize="10" fill="var(--text-muted)"
            >
              {formatXLabel(d.date)}
            </text>
          ))}

          {/* Clicks area */}
          <path d={areaPath} fill="url(#gsc-clicks-fill)" />

          {/* Clicks line */}
          <path d={linePath(yClicks)} fill="none" stroke="#6366f1" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

          {/* Impressions line */}
          <path d={linePath(yImps)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0" opacity="0.85" />

          {/* Hover */}
          {hover != null && (
            <>
              <line
                x1={hover.x} y1={padding.top} x2={hover.x} y2={padding.top + innerH}
                stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
              />
              <circle cx={hover.x} cy={yClicks(data[hover.i].clicks)} r="4.5" fill="#6366f1" stroke="var(--bg-card)" strokeWidth="2" />
              <circle cx={hover.x} cy={yImps(data[hover.i].impressions)} r="4.5" fill="#10b981" stroke="var(--bg-card)" strokeWidth="2" />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover != null && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(Math.max(hover.x - 80, 0), width - 160),
              top: 0,
              pointerEvents: 'none',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 160,
            }}
          >
            <div style={{ color: 'var(--text-muted)', marginBottom: 6, fontSize: 11 }}>{formatTooltipDate(data[hover.i].date)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 3 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /> Clicks
              </span>
              <strong>{fmtNum(data[hover.i].clicks)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Impressions
              </span>
              <strong>{fmtNum(data[hover.i].impressions)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  let nice;
  if (f <= 1) nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else nice = 10;
  return nice * exp;
}

function formatXLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTooltipDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtNum(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 10_000) return (v / 1_000).toFixed(1) + 'k';
  return v.toLocaleString();
}

function timeAgo(iso) {
  const t = new Date(iso + 'Z').getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
