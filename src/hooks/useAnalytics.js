import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useDateRange } from '@/contexts/DateRangeContext';

const FILTER_KEYS = ['channel', 'country', 'city', 'page', 'entry_page', 'exit_page', 'browser', 'os', 'device'];

export function useAnalytics(endpoint, extraParams = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const { siteId } = router.query;
  const { getParams } = useDateRange();

  // Read filters directly from router.query so we react to URL changes immediately
  const filterParams = useMemo(() => {
    const f = {};
    for (const key of FILTER_KEYS) {
      if (router.query[key]) f[key] = router.query[key];
    }
    return f;
  }, [router.query]);

  const filterKey = JSON.stringify(filterParams);

  const fetchData = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ...getParams(), ...filterParams, ...extraParams });
      const res = await fetch(
        `/api/analytics/${siteId}/${endpoint}?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siteId, endpoint, JSON.stringify(getParams()), filterKey, JSON.stringify(extraParams)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
