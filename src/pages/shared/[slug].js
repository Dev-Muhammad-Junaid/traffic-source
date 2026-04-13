import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import MetricStrip from '@/components/ui/MetricStrip';
import AnalyticsPanel from '@/components/ui/AnalyticsPanel';
import CombinedChart from '@/components/charts/CombinedChart';
import { getCountryName } from '@/lib/formatters';
import CountryFlag from '@/components/ui/CountryFlag';
import TechIcon from '@/components/ui/TechIcon';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { useTheme } from '@/contexts/ThemeContext';

const periods = [
  { value: '24h', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '1M' },
  { value: '90d', label: '3M' },
  { value: '12m', label: '1Y' },
];

export default function PublicAnalytics() {
  const router = useRouter();
  const { slug } = router.query;
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('30d');

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      const res = await fetch(`/api/shared/${slug}?${params}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('This analytics page is not available.');
        } else {
          setError('Failed to load analytics.');
        }
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError('Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [slug, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <>
        <Head><title>Analytics - Traffic Source</title></Head>
        <div className="app-layout">
          <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, marginBottom: 8 }}>Not Found</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{error}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <Head><title>Analytics - Traffic Source</title></Head>
        <div className="app-layout">
          <div className="app-content">
            <div className="loading-inline"><div className="loading-spinner" /></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{data.site?.name || 'Analytics'} - Public Analytics</title>
      </Head>
      <div className="app-layout">
        <header className="app-header">
          <div className="app-header-left">
            <span className="app-logo" style={{ cursor: 'default' }}>
              <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M49.501 8.249L38.251 20.75h-5l-11.25 12.499H17l-11.25 12.5V2H2v60h60V8.249H49.501M27.626 56.375h-9.688V35.124h9.688v21.251m16.25 0h-9.688v-33.75h9.688v33.75m16.249 0h-9.687V10.124h9.687v46.251"/>
              </svg>
              Traffic Source
            </span>
          </div>
          <div className="app-header-right">
            <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 10px', background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
              Public Dashboard
            </span>
            <button className="btn-ghost theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <main className="app-content">
          <div className="page-header">
            <div className="page-header-site">
              {data.site?.domain && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(data.site.domain)}&sz=32`}
                  alt=""
                  width={24}
                  height={24}
                  className="page-header-favicon"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div>
                <h1 className="page-header-name">{data.site?.name || data.site?.domain}</h1>
                {data.site?.name && data.site?.domain && (
                  <span className="page-header-domain">{data.site.domain}</span>
                )}
              </div>
            </div>
            <div className="date-picker">
              {periods.map((p) => (
                <button
                  key={p.value}
                  className={period === p.value ? 'active' : ''}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <MetricStrip metrics={[
            { label: 'Visitors', value: data.current.visitors, change: data.changes.visitors },
            { label: 'Pageviews', value: data.current.pageViews, change: data.changes.pageViews },
            { label: 'Bounce rate', value: data.current.bounceRate, change: data.changes.bounceRate, format: 'percent' },
            { label: 'Session time', value: data.current.avgDuration, change: data.changes.avgDuration, format: 'duration' },
          ]} />

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="chart-container">
              <CombinedChart trafficData={data.timeSeries} revenueData={[]} />
            </div>
          </div>

          <div className="grid-2">
            <AnalyticsPanel
              tabs={[{ key: 'sources', label: 'Channel' }]}
              data={{ sources: data.sources || [] }}
              valueKey="sessions"
              renderLabel={(row) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ChannelIcon name={row.name} />
                  {row.name}
                </span>
              )}
              showPercentage
              defaultTab="sources"
            />

            <AnalyticsPanel
              tabs={[{ key: 'country', label: 'Country' }]}
              data={{ country: data.countries || [] }}
              renderLabel={(row) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <CountryFlag code={row.name} size="s" />
                  {getCountryName(row.name)}
                </span>
              )}
              showPercentage
              defaultTab="country"
            />
          </div>

          <div className="grid-2">
            <AnalyticsPanel
              tabs={[{ key: 'pages', label: 'Page' }]}
              data={{ pages: (data.pages || []).map(p => ({ ...p, count: p.views })) }}
              renderLabel={(row) => row.name || '/'}
              showPercentage
              barByTotal
              defaultTab="pages"
            />

            <AnalyticsPanel
              tabs={[
                { key: 'browser', label: 'Browser' },
                { key: 'os', label: 'OS' },
                { key: 'device', label: 'Device' },
              ]}
              data={{
                browser: data.browsers || [],
                os: data.os || [],
                device: data.devices || [],
              }}
              renderLabel={(row, meta) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <TechIcon type={meta.activeTab} name={row.name} />
                  {row.name}
                </span>
              )}
              showPercentage
              defaultTab="browser"
            />
          </div>

          <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Powered by <a href="https://github.com/mddanishyusuf/traffic-source" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)', fontWeight: 600 }}>Traffic Source</a>
          </div>
        </main>
      </div>
    </>
  );
}
