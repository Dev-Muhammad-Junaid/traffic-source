import { useEffect, useState } from 'react';
import { useDateRange } from '@/contexts/DateRangeContext';

export default function FunnelView({ siteId }) {
  const { getParams } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams(getParams());
    fetch(`/api/analytics/${siteId}/funnel?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, JSON.stringify(getParams())]);

  if (loading) {
    return <div className="loading-inline"><div className="loading-spinner" /></div>;
  }

  if (!data || !data.steps || data.steps.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <h3>No funnel yet</h3>
        <p>Auto-funnel needs at least a few converted visitors with page-view history in this date range.</p>
      </div>
    );
  }

  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;
  const max = data.steps[0]?.visitors || 1;

  return (
    <div className="funnel">
      <div className="funnel-meta">
        Auto-detected from <strong>{data.totalConverters}</strong> converted visitor{data.totalConverters === 1 ? '' : 's'}.
      </div>
      <div className="funnel-steps">
        {data.steps.map((step, i) => {
          const widthPct = (step.visitors / max) * 100;
          return (
            <div className="funnel-step" key={i}>
              <div className="funnel-step-head">
                <div className="funnel-step-index">{i + 1}</div>
                <div className="funnel-step-path" title={step.pathname}>{step.pathname}</div>
                <div className="funnel-step-visitors">
                  <strong>{step.visitors.toLocaleString()}</strong>
                  <span className="funnel-step-label">visitors</span>
                </div>
              </div>
              <div className="funnel-bar-track">
                <div className="funnel-bar-fill" style={{ width: `${widthPct}%` }} />
              </div>
              <div className="funnel-step-foot">
                <span>{fmtPct(step.pctOfTotal)} of total</span>
                {i > 0 && (
                  <span className={step.pctOfPrev < 0.5 ? 'funnel-drop bad' : 'funnel-drop'}>
                    {fmtPct(step.pctOfPrev)} from previous
                    {step.dropOff > 0 && <> · -{step.dropOff.toLocaleString()} drop</>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
