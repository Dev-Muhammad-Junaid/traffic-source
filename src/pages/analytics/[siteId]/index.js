import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MetricStrip from '@/components/ui/MetricStrip';
import AnalyticsPanel from '@/components/ui/AnalyticsPanel';
import CombinedChart from '@/components/charts/CombinedChart';
import RealtimeUsers from '@/components/ui/RealtimeUsers';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useFilters } from '@/contexts/FilterContext';
import { useDateRange } from '@/contexts/DateRangeContext';
import { getCountryName, buildPageHref } from '@/lib/formatters';
import CountryFlag from '@/components/ui/CountryFlag';
import TechIcon from '@/components/ui/TechIcon';
import ChannelIcon from '@/components/ui/ChannelIcon';

const FILTER_LABELS = {
  date: 'Day',
  channel: 'Channel',
  country: 'Country',
  city: 'City',
  page: 'Page',
  entry_page: 'Entry page',
  exit_page: 'Exit page',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
};

const GEO_FILTER_KEYS = ['channel', 'country', 'city', 'entry_page', 'exit_page', 'browser', 'os', 'device'];

function formatFilterDate(value) {
  if (!value) return value;
  if (String(value).includes(' ')) {
    const [day, hour] = String(value).split(' ');
    const d = new Date(day + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hour}`;
  }
  const d = new Date(value + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Analytics() {
  const router = useRouter();
  const { siteId } = router.query;
  const { data, loading, refreshing } = useAnalytics('overview');
  const { filters, setFilter, removeFilter, clearFilters, hasFilters } = useFilters();
  const { period, customRange, getParams } = useDateRange();
  const [dayGeo, setDayGeo] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);

  const dayGeoKey = useMemo(() => {
    if (!filters.date) return null;
    const parts = { date: filters.date, ...(customRange || { period }) };
    for (const key of GEO_FILTER_KEYS) {
      if (filters[key]) parts[key] = filters[key];
    }
    return JSON.stringify(parts);
  }, [filters, period, customRange]);

  useEffect(() => {
    if (!siteId || !filters.date || !dayGeoKey) {
      setDayGeo(null);
      setDayLoading(false);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams(JSON.parse(dayGeoKey));

    setDayLoading(true);
    fetch(`/api/analytics/${siteId}/geo?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load day geo');
        if (!cancelled) setDayGeo(json);
      })
      .catch(() => {
        if (!cancelled) setDayGeo(null);
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, filters.date, dayGeoKey]);

  if (!data && loading) {
    return (
      <>
        <Head><title>Analytics - Traffic Source</title></Head>
        <DashboardLayout siteId={siteId}>
          <div className="loading-inline"><div className="loading-spinner" /></div>
        </DashboardLayout>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Head><title>Analytics - Traffic Source</title></Head>
        <DashboardLayout siteId={siteId}>
          <div className="empty-state"><p>Failed to load analytics</p></div>
        </DashboardLayout>
      </>
    );
  }

  const usingDayGeo = !!filters.date && !!dayGeo;
  const countries = usingDayGeo ? dayGeo.countries : data.countries || [];
  const cities = usingDayGeo ? dayGeo.cities : data.cities || [];
  const current = usingDayGeo ? dayGeo.current : data.current;
  const conv = data.conversions?.totals || {};
  const isUpdating = refreshing || dayLoading;

  const toggleFilter = (key, value) => {
    if (filters[key] === value) {
      removeFilter(key);
    } else {
      setFilter(key, value);
    }
  };

  const sourceTabToFilter = { referrer: 'channel', utm_source: 'channel', utm_campaign: 'channel' };
  const geoTabToFilter = { country: 'country', city: 'city' };
  const pageTabToFilter = { all: 'page', entry: 'entry_page', exit: 'exit_page' };
  const techTabToFilter = { browser: 'browser', os: 'os', device: 'device' };

  return (
    <>
      <Head>
        <title>{data.site?.name || 'Analytics'} - Traffic Source</title>
      </Head>
      <DashboardLayout siteId={siteId} siteName={data.site?.name} siteDomain={data.site?.domain}>

        {hasFilters && (
          <div className="filter-bar">
            <span className="filter-bar-label">Filtered by:</span>
            {Object.entries(filters).map(([key, value]) => (
              <span key={key} className="filter-pill">
                <span className="filter-pill-label">{FILTER_LABELS[key] || key}:</span>
                <span className="filter-pill-value">
                  {key === 'country' ? getCountryName(value) : key === 'date' ? formatFilterDate(value) : value}
                </span>
                <button
                  className="filter-pill-remove"
                  onClick={() => removeFilter(key)}
                  aria-label={`Remove ${key} filter`}
                >
                  &times;
                </button>
              </span>
            ))}
            <button className="filter-clear" onClick={clearFilters}>
              Clear all
            </button>
            {isUpdating && <span className="filter-updating">Updating…</span>}
          </div>
        )}

        {!hasFilters && isUpdating && (
          <div className="filter-bar filter-bar-subtle">
            <span className="filter-updating">Updating…</span>
          </div>
        )}

        <div className={`analytics-content${isUpdating ? ' is-refreshing' : ''}`}>
          <RealtimeUsers />

          <MetricStrip metrics={[
            { label: 'Visitors', value: current.visitors, change: usingDayGeo ? undefined : data.changes.visitors },
            { label: 'Pageviews', value: current.pageViews, change: usingDayGeo ? undefined : data.changes.pageViews },
            { label: 'Revenue', value: conv.revenue || 0, format: 'currency' },
            { label: 'Conversion rate', value: conv.conversionRate || 0, format: 'percent' },
            { label: 'Bounce rate', value: current.bounceRate, change: usingDayGeo ? undefined : data.changes.bounceRate, format: 'percent' },
            { label: 'Session time', value: current.avgDuration, change: usingDayGeo ? undefined : data.changes.avgDuration, format: 'duration' },
          ]} />

          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="chart-panel-header">
              <span className="chart-panel-hint">
                {filters.date
                  ? `Showing locations for ${formatFilterDate(filters.date)} — click the day again to clear`
                  : 'Click a day to see where traffic came from'}
              </span>
            </div>
            <CombinedChart
              trafficData={data.timeSeries}
              revenueData={data.conversions?.timeSeries || []}
              selectedDate={filters.date || null}
              onDayClick={(date) => toggleFilter('date', date)}
            />
          </div>

          <div className="grid-2">
            <AnalyticsPanel
              tabs={[
                { key: 'referrer', label: 'Channel' },
                { key: 'utm_source', label: 'Referrer' },
                { key: 'utm_campaign', label: 'Campaign' },
              ]}
              data={{
                referrer: data.sources || [],
                utm_source: (data.sources || []).filter(s => s.name !== 'Direct'),
                utm_campaign: (data.sources || []).filter(s => s.name !== 'Direct'),
              }}
              valueKey="sessions"
              renderLabel={(row) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ChannelIcon name={row.name} />
                  {row.name}
                </span>
              )}
              showPercentage
              defaultTab="referrer"
              onRowClick={(row, tab) => toggleFilter(sourceTabToFilter[tab], row.name)}
              activeFilter={{ tab: Object.keys(sourceTabToFilter).find(t => sourceTabToFilter[t] === 'channel'), value: filters.channel }}
            />

            <AnalyticsPanel
              tabs={[
                { key: 'country', label: 'Country' },
                { key: 'city', label: 'City' },
              ]}
              data={{
                country: countries,
                city: cities,
              }}
              renderLabel={(row, meta) => {
                if (meta.activeTab === 'city') return row.name;
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CountryFlag code={row.name} size="s" />
                    {getCountryName(row.name)}
                  </span>
                );
              }}
              showPercentage
              defaultTab="country"
              onRowClick={(row, tab) => toggleFilter(geoTabToFilter[tab], row.name)}
              activeFilter={{ tab: filters.country ? 'country' : filters.city ? 'city' : null, value: filters.country || filters.city }}
            />
          </div>

          <div className="grid-2">
            <AnalyticsPanel
              tabs={[
                { key: 'all', label: 'Page' },
                { key: 'entry', label: 'Entry page' },
                { key: 'exit', label: 'Exit page' },
              ]}
              data={{
                all: (data.pages || []).map(p => ({ ...p, count: p.views })),
                entry: (data.entryPages || []).map(p => ({ ...p, count: p.sessions })),
                exit: (data.exitPages || []).map(p => ({ ...p, count: p.sessions })),
              }}
              renderLabel={(row) => renderPageLabel(row.name, data.site?.domain)}
              showPercentage
              barByTotal
              defaultTab="all"
              onRowClick={(row, tab) => toggleFilter(pageTabToFilter[tab], row.name)}
              activeFilter={{
                tab: filters.page ? 'all' : filters.entry_page ? 'entry' : filters.exit_page ? 'exit' : null,
                value: filters.page || filters.entry_page || filters.exit_page,
              }}
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
              onRowClick={(row, tab) => toggleFilter(techTabToFilter[tab], row.name)}
              activeFilter={{
                tab: filters.browser ? 'browser' : filters.os ? 'os' : filters.device ? 'device' : null,
                value: filters.browser || filters.os || filters.device,
              }}
            />
          </div>

          {data.affiliates?.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div className="panel-tabs">
                  <button className="panel-tab active">Affiliates</button>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => router.push(`/analytics/${siteId}/affiliates`)}
                >
                  View all &rarr;
                </button>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="journey-table">
                  <thead>
                    <tr>
                      <th>Affiliate</th>
                      <th>Visits</th>
                      <th>Conversions</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.affiliates.map((a, i) => (
                      <tr key={i}>
                        <td><span style={{ fontWeight: 600 }}>{a.name}</span></td>
                        <td>{a.visits}</td>
                        <td>{a.conversions}</td>
                        <td style={{ fontWeight: 600 }}>${((a.revenue || 0) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.conversions?.bySource?.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div className="panel-tabs">
                  <button className="panel-tab active">Journey for payment</button>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => router.push(`/analytics/${siteId}/conversions`)}
                >
                  View all &rarr;
                </button>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="journey-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Conversions</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.conversions.bySource.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{row.name}</span>
                        </td>
                        <td>{row.conversions}</td>
                        <td style={{ fontWeight: 600 }}>${((row.revenue || 0) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </DashboardLayout>
    </>
  );
}

function renderPageLabel(pathname, siteDomain) {
  const href = buildPageHref(pathname, siteDomain);
  if (!href) return pathname || '/';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="page-link-out" onClick={(e) => e.stopPropagation()}>
      <span>{pathname || '/'}</span>
      <span aria-hidden="true">&uarr;</span>
    </a>
  );
}
