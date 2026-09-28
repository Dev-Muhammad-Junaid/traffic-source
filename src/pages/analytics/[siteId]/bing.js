import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart';
import { useDateRange } from '@/contexts/DateRangeContext';

export default function BingPage() {
  const router = useRouter();
  const { siteId } = router.query;
  const { period } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!siteId) return;
    const res = await fetch(`/api/sites/${siteId}/bing/data?period=${period}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [siteId, period]);

  useEffect(() => { load(); }, [load]);

  const syncThis = async () => {
    setSyncing(true);
    setError('');
    const res = await fetch(`/api/sites/${siteId}/bing/sync`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) { setError(body.error || 'Could not start sync'); return; }
    setNote('Sync started. Refresh in a minute.');
    setTimeout(load, 4000);
  };

  const link = async (bingUrl) => {
    setError('');
    const res = await fetch(`/api/sites/${siteId}/bing/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bingUrl }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Could not link'); return; }
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
      <Head><title>Bing - {data.site?.name}</title></Head>
      <DashboardLayout siteId={siteId} siteName={data.site?.name} siteDomain={data.site?.domain}>
        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
        {note && <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16 }}>{note}</div>}
        {!data.configured && <NeedsKey />}
        {data.configured && !data.linked && <LinkPanel data={data} onLink={link} />}
        {data.configured && data.linked && (
          <Dashboard data={data} onSync={syncThis} syncing={syncing} />
        )}
      </DashboardLayout>
    </>
  );
}

function NeedsKey() {
  return (
    <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>Bing Webmaster is not connected</h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)' }}>
        Add the API key from Bing Webmaster → Settings → API Access. One key covers every verified site.
      </p>
      <a href="/settings?tab=integrations" className="btn btn-primary">Open Settings</a>
    </div>
  );
}

function LinkPanel({ data, onLink }) {
  return (
    <div className="panel" style={{ padding: 32 }}>
      <h3 style={{ marginTop: 0 }}>Link {data.site.domain}</h3>
      {data.error && <div className="auth-error" style={{ marginBottom: 12 }}>{data.error}</div>}
      {data.matches?.length ? data.matches.map((url) => (
        <button key={url} type="button" className="btn btn-primary" onClick={() => onLink(url)}>{url}</button>
      )) : (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          No verified Bing property matches {data.site.domain}. Add and verify it in Bing Webmaster Tools first.
        </p>
      )}
    </div>
  );
}

function Dashboard({ data, onSync, syncing }) {
  const totals = data.totals || {};
  const latestCrawl = data.crawl?.[0];
  const chart = (data.daily || []).map((row) => ({ date: row.date, page_views: row.clicks, impressions: row.impressions }));

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        <span>Property: <strong style={{ color: 'var(--text)' }}>{data.link.url}</strong></span>
        {data.link.lastSyncAt && <span>Last sync {data.link.lastSyncAt} UTC</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSync} disabled={syncing}>{syncing ? 'Starting…' : 'Sync now'}</button>
        </div>
      </div>
      {data.link.lastError && <div className="auth-error" style={{ marginBottom: 16 }}>{data.link.lastError}</div>}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="Clicks" value={totals.clicks || 0} />
        <Stat label="Impressions" value={totals.impressions || 0} />
        <Stat label="CTR" value={`${((totals.ctr || 0) * 100).toFixed(1)}%`} />
        <Stat label="Indexed pages" value={latestCrawl?.in_index ?? '—'} />
      </div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="chart-panel-header"><span className="chart-panel-hint">Bing clicks</span></div>
        <TimeSeriesChart data={chart} dataKey="page_views" />
      </div>
      {!data.daily?.length && (
        <div className="panel" style={{ padding: 16, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          Bing returned no search-performance rows for this property yet. Collection starts when the site is added in Bing Webmaster and can take a few days. Crawl and index numbers appear here once Bing sends them.
        </div>
      )}
      <div className="grid-2">
        <RankTable title="Queries" rows={data.queries || []} />
        <RankTable title="Pages" rows={data.pages || []} />
      </div>
      {latestCrawl && (
        <div className="panel" style={{ padding: 16, fontSize: 13 }}>
          <strong>Crawl</strong>
          <span style={{ color: 'var(--text-muted)' }}> · {latestCrawl.date}</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            <span>Crawled {latestCrawl.crawled_pages}</span>
            <span>Errors {latestCrawl.crawl_errors}</span>
            <span>In index {latestCrawl.in_index}</span>
            <span>Inbound links {latestCrawl.in_links}</span>
            <span>2xx {latestCrawl.code_2xx}</span>
            <span>4xx {latestCrawl.code_4xx}</span>
            <span>5xx {latestCrawl.code_5xx}</span>
            <span>Blocked {latestCrawl.blocked_robots}</span>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 650 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function RankTable({ title, rows }) {
  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header"><div className="panel-tabs"><button className="panel-tab active">{title}</button></div></div>
      <div className="panel-body" style={{ padding: 0 }}>
        {rows.length === 0 ? <div className="empty-state"><p>No rows yet</p></div> : (
          <table className="journey-table">
            <thead><tr><th>{title === 'Pages' ? 'Page' : 'Query'}</th><th>Clicks</th><th>Impressions</th><th>Position</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</td>
                  <td>{row.clicks}</td>
                  <td>{row.impressions}</td>
                  <td>{row.position ? Number(row.position).toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
