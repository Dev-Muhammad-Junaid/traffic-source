import Link from 'next/link';
import { useRouter } from 'next/router';
import ProtectedRoute from '../ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useDateRange } from '@/contexts/DateRangeContext';
import { useTheme } from '@/contexts/ThemeContext';

const periods = [
  { value: '24h', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '1M' },
  { value: '90d', label: '3M' },
  { value: '12m', label: '1Y' },
];

export default function DashboardLayout({ children, siteId, siteName, siteDomain }) {
  const { period, setPeriod, setCustomRange } = useDateRange();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const path = router.asPath;

  return (
    <ProtectedRoute>
      <div className="app-layout">
        <header className="app-header">
          <div className="app-header-left">
            <Link href="/sites" className="app-logo">
              <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="M49.501 8.249L38.251 20.75h-5l-11.25 12.499H17l-11.25 12.5V2H2v60h60V8.249H49.501M27.626 56.375h-9.688V35.124h9.688v21.251m16.25 0h-9.688v-33.75h9.688v33.75m16.249 0h-9.687V10.124h9.687v46.251"/>
              </svg>
              Traffic Source
            </Link>
            <nav className="app-nav">
              <Link href="/sites" className={`app-nav-link ${path === '/sites' ? 'active' : ''}`}>
                Sites
              </Link>
              {siteId && (
                <>
                  <Link
                    href={`/analytics/${siteId}`}
                    className={`app-nav-link ${path === `/analytics/${siteId}` ? 'active' : ''}`}
                  >
                    Analytics
                  </Link>
                  <Link
                    href={`/analytics/${siteId}/conversions`}
                    className={`app-nav-link ${path.includes('/conversions') ? 'active' : ''}`}
                  >
                    Conversions
                  </Link>
                  <Link
                    href={`/analytics/${siteId}/affiliates`}
                    className={`app-nav-link ${path.includes('/affiliates') ? 'active' : ''}`}
                  >
                    Affiliates
                  </Link>
                  <Link
                    href={`/analytics/${siteId}/gsc`}
                    className={`app-nav-link ${path.includes('/gsc') ? 'active' : ''}`}
                  >
                    Search Console
                  </Link>
                  <Link
                    href={`/analytics/${siteId}/settings`}
                    className={`app-nav-link ${path.includes('/settings') && path.includes('/analytics/') ? 'active' : ''}`}
                  >
                    Settings
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="app-header-right">
            <Link href="/settings" className={`app-nav-link ${path === '/settings' ? 'active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </Link>
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
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </header>

        <main className="app-content">
          {(siteName || siteDomain) && (
            <div className="page-header">
              <div className="page-header-site">
                {siteDomain && (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(siteDomain)}&sz=32`}
                    alt=""
                    width={24}
                    height={24}
                    className="page-header-favicon"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div>
                  <h1 className="page-header-name">{siteName || siteDomain}</h1>
                  {siteName && siteDomain && (
                    <span className="page-header-domain">{siteDomain}</span>
                  )}
                </div>
              </div>
              <div className="date-picker">
                {periods.map((p) => (
                  <button
                    key={p.value}
                    className={period === p.value ? 'active' : ''}
                    onClick={() => { setCustomRange(null); setPeriod(p.value); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
