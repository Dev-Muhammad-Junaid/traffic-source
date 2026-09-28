import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { getCountryName } from '@/lib/formatters';
import CountryFlag from './CountryFlag';
import TechIcon from './TechIcon';

export default function RealtimeUsers() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const { siteId } = router.query;
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!siteId) return;

    const fetchRealtime = async () => {
      try {
        const res = await fetch(`/api/analytics/${siteId}/realtime`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // silently fail on polling
      }
    };

    fetchRealtime();
    intervalRef.current = setInterval(fetchRealtime, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [siteId]);

  if (!data) return null;

  return (
    <div className="realtime-widget">
      <button className="realtime-widget-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="realtime-dot" />
        <span className="realtime-widget-count">{data.count}</span>
        <span className="realtime-widget-label">
          {data.count === 1 ? 'visitor' : 'visitors'} online
        </span>
        <span className={`realtime-widget-chevron ${expanded ? 'open' : ''}`}>&#x25B2;</span>
      </button>

      {expanded && data.users.length > 0 && (
        <div className="realtime-widget-list">
          {data.users.slice(0, 10).map((user) => (
            <div className="realtime-widget-row" key={user.visitor_id}>
              <div className="realtime-row-top">
                <CountryFlag code={user.country} size="s" />
                <span className="realtime-country">
                  {user.country ? getCountryName(user.country) : 'Unknown'}
                </span>
                <span className="realtime-page">{user.current_page || '/'}</span>
              </div>
              <div className="realtime-row-bottom">
                <span className="realtime-source">{user.source || 'Direct'}</span>
                {user.ip && <span className="realtime-source">{user.ip}</span>}
                <TechIcon type="browser" name={user.browser} />
              </div>
            </div>
          ))}
          {data.users.length > 10 && (
            <div className="realtime-widget-more">
              +{data.users.length - 10} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
