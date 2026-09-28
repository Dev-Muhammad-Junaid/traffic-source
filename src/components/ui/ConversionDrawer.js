import { useState, useEffect } from 'react';
import VisitorAvatar from './VisitorAvatar';
import CountryFlag from './CountryFlag';
import TechIcon from './TechIcon';
import { getCountryName } from '@/lib/formatters';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Instant';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function formatSessionDuration(seconds) {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function ConversionDrawer({ siteId, conversion, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversion) { setData(null); return; }
    setLoading(true);
    const params = new URLSearchParams({
      visitorId: conversion.visitor_id,
      conversionId: String(conversion.id),
    });
    fetch(`/api/analytics/${siteId}/visitor-journey?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [conversion?.id, siteId]);

  useEffect(() => {
    if (!conversion) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [conversion, onClose]);

  if (!conversion) return null;

  return (
    <>
      <div className={`drawer-overlay ${conversion ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${conversion ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-header-left">
            <VisitorAvatar visitorId={conversion.visitor_id} size={36} />
            <div>
              <div className="drawer-title">Conversion Journey</div>
              <div className="drawer-subtitle">
                {conversion.stripe_customer_email
                  ? conversion.stripe_customer_email.split('@')[0].slice(0, 3) + '***'
                  : `Visitor ${(conversion.visitor_id || '').slice(-6)}`}
              </div>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-body">
          {loading ? (
            <div className="loading-inline"><div className="loading-spinner" /></div>
          ) : data ? (
            <>
              <div className="drawer-summary">
                <div className="drawer-summary-item">
                  <span className="drawer-summary-label">Time to convert</span>
                  <span className="drawer-summary-value">
                    {formatDuration(data.timeToComplete)}
                  </span>
                </div>
                <div className="drawer-summary-item">
                  <span className="drawer-summary-label">Sessions</span>
                  <span className="drawer-summary-value">
                    {data.visitor.totalSessions}
                  </span>
                </div>
                <div className="drawer-summary-item">
                  <span className="drawer-summary-label">Pages viewed</span>
                  <span className="drawer-summary-value">
                    {data.visitor.totalPageViews}
                  </span>
                </div>
                <div className="drawer-summary-item">
                  <span className="drawer-summary-label">Amount</span>
                  <span className="drawer-summary-value">
                    ${((data.conversion?.amount || 0) / 100).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="drawer-timeline">
                {data.sessions.map((session, idx) => (
                  <div key={session.id} className="timeline-session">
                    <div className="timeline-track">
                      <div className="timeline-dot" />
                      {(idx < data.sessions.length - 1 || data.conversion) && (
                        <div className="timeline-line" />
                      )}
                    </div>

                    <div className="timeline-content">
                      <div className="timeline-session-header">
                        <span className="timeline-session-label">
                          Session {idx + 1}
                        </span>
                        <span className="timeline-session-time">
                          {formatTimestamp(session.started_at)}
                        </span>
                      </div>

                      <div className="timeline-session-meta">
                        {session.ip && <span>{session.ip}</span>}
                        {session.country && (
                          <span>
                            <CountryFlag code={session.country} size="s" />
                            {getCountryName(session.country)}
                          </span>
                        )}
                        {session.browser && (
                          <span>
                            <TechIcon type="browser" name={session.browser} />
                            {session.browser}
                          </span>
                        )}
                        {session.referrer_domain && (
                          <span>via {session.referrer_domain}</span>
                        )}
                        {session.utm_source && (
                          <span>utm: {session.utm_source}</span>
                        )}
                        <span>
                          {formatSessionDuration(session.duration)}
                          {' · '}
                          {session.page_count} page{session.page_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {session.pageViews.length > 0 && (
                        <div className="timeline-pages">
                          {session.pageViews.map((pv, pvIdx) => (
                            <div key={pv.id || pvIdx} className="timeline-page">
                              <span className="timeline-page-path">
                                {pv.pathname}
                              </span>
                              <span className="timeline-page-time">
                                {new Date(pv.timestamp).toLocaleTimeString('en-US', {
                                  hour: 'numeric', minute: '2-digit', hour12: true,
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {data.conversion && (
                  <div className="timeline-session">
                    <div className="timeline-track">
                      <div className="timeline-dot timeline-dot--conversion" />
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-session-header">
                        <span className="timeline-session-label timeline-session-label--conversion">
                          Payment completed
                        </span>
                        <span className="timeline-session-time">
                          {formatTimestamp(data.conversion.created_at)}
                        </span>
                      </div>
                      <div className="timeline-session-meta">
                        <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                          ${((data.conversion.amount || 0) / 100).toLocaleString()}
                        </span>
                        {data.conversion.stripe_customer_email && (
                          <span>{data.conversion.stripe_customer_email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>Could not load journey data</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
