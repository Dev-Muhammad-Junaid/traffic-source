import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ConversionJourneyTable from '@/components/ui/ConversionJourneyTable';
import FunnelView from '@/components/ui/FunnelView';
import { useDateRange } from '@/contexts/DateRangeContext';

export default function Conversions() {
  const router = useRouter();
  const { siteId } = router.query;
  const { getParams } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('journey');

  const fetchData = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...getParams(),
        page: String(page),
        limit: '25',
        ...(search ? { search } : {}),
      });
      const res = await fetch(`/api/analytics/${siteId}/conversions?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [siteId, page, search, JSON.stringify(getParams())]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <>
      <Head>
        <title>Conversions - Traffic Source</title>
      </Head>
      <DashboardLayout siteId={siteId} siteName={data?.site?.name} siteDomain={data?.site?.domain}>
        <div className="page-nav">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => router.push(`/analytics/${siteId}`)}
          >
            &larr; Dashboard
          </button>
        </div>

        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-tabs">
              <button
                className={`panel-tab ${activeTab === 'journey' ? 'active' : ''}`}
                onClick={() => setActiveTab('journey')}
              >
                Journey for payment
              </button>
              <button
                className={`panel-tab ${activeTab === 'funnel' ? 'active' : ''}`}
                onClick={() => setActiveTab('funnel')}
              >
                Funnel
              </button>
            </div>

            {activeTab === 'journey' && (
              <div className="search-input-wrap">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="search-input"
                />
              </div>
            )}
          </div>

          <div className="panel-body" style={{ padding: 0 }}>
            {activeTab === 'journey' ? (
              loading ? (
                <div className="loading-inline"><div className="loading-spinner" /></div>
              ) : (
                <ConversionJourneyTable
                  conversions={data?.conversions || []}
                  siteId={siteId}
                />
              )
            ) : (
              <FunnelView siteId={siteId} />
            )}
          </div>

          {activeTab === 'journey' && data?.pagination && data.pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
