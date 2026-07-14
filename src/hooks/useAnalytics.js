import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useDateRange } from '@/contexts/DateRangeContext';

// `date` is intentionally excluded — day drill-down uses the light /geo endpoint
const FILTER_KEYS = ['channel', 'country', 'city', 'page', 'entry_page', 'exit_page', 'browser', 'os', 'device'];

export function useAnalytics(endpoint, extraParams = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  const { siteId } = router.query;
  const { getParams } = useDateRange();
  const hasDataRef = useRef(false);

  const filterParams = useMemo(() => {
    const f = {};
    for (const key of FILTER_KEYS) {
      if (router.query[key]) f[key] = router.query[key];
    }
    return f;
  }, [router.query]);

  const filterKey = JSON.stringify(filterParams);
  const periodKey = JSON.stringify(getParams());
  const extraKey = JSON.stringify(extraParams);

  const fetchData = useCallback(async () => {
    if (!siteId) return;
    setError(null);
    if (hasDataRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ ...getParams(), ...filterParams, ...extraParams });
      const res = await fetch(
        `/api/analytics/${siteId}/${endpoint}?${params}`
      );
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(res.ok ? 'Invalid response' : (text.slice(0, 80) || 'Failed to fetch'));
      }
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setData(json);
      hasDataRef.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId, endpoint, periodKey, filterKey, extraKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, refetch: fetchData };
}
