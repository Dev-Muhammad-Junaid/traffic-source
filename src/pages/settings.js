import { useState, useEffect } from 'react';
import Head from 'next/head';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(user?.name || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setMessage('Profile updated');
  };

  return (
    <>
      <Head>
        <title>Settings - Traffic Source</title>
      </Head>
      <DashboardLayout>
        <h2 className="page-title">Account Settings</h2>
        <div style={{ maxWidth: 720 }}>
          <div className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-header">
              <div className="panel-tabs">
                <button className={`panel-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
                <button className={`panel-tab ${tab === 'integrations' ? 'active' : ''}`} onClick={() => setTab('integrations')}>Integrations</button>
              </div>
            </div>
            <div className="panel-body" style={{ padding: 20 }}>
              {tab === 'profile' && (
                <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {message && (
                    <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>
                      {message}
                    </div>
                  )}
                  {error && <div className="auth-error">{error}</div>}
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
                  </div>
                  <div className="form-group">
                    <label>Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                    Save Changes
                  </button>
                </form>
              )}
              {tab === 'integrations' && <GscIntegration />}
            </div>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}

function SetupGuide() {
  const steps = [
    {
      n: 1,
      title: 'Create a Google Cloud project',
      body: <>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud → New Project</a>. Give it any name (e.g. <em>Traffic Source</em>) and click <strong>Create</strong>. Wait a few seconds, then make sure the new project is selected in the top bar.</>,
    },
    {
      n: 2,
      title: 'Enable the Search Console API',
      body: <>Open <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noreferrer">Search Console API</a> and click <strong>Enable</strong>. This lets your app read keyword data.</>,
    },
    {
      n: 3,
      title: 'Configure the OAuth consent screen',
      body: (
        <>
          Open <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">OAuth consent screen</a>.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>User type: <strong>External</strong> → Create</li>
            <li>App name: anything (e.g. <em>Traffic Source</em>)</li>
            <li>User support email + Developer contact: your email</li>
            <li>Save and continue → on the <strong>Scopes</strong> step, click <em>Add or remove scopes</em> and add <code>.../auth/webmasters.readonly</code></li>
            <li>On <strong>Test users</strong>, add the Google account(s) that own your Search Console properties</li>
            <li>Save (you do <em>not</em> need to publish the app — Testing mode works fine)</li>
          </ul>
        </>
      ),
    },
    {
      n: 4,
      title: 'Create the OAuth client',
      body: (
        <>
          Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a> → <strong>+ Create credentials</strong> → <strong>OAuth client ID</strong>.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Application type: <strong>Web application</strong></li>
            <li>Name: anything</li>
            <li>Under <strong>Authorized redirect URIs</strong>, click <em>Add URI</em> and paste the redirect URI shown above</li>
            <li>Click <strong>Create</strong></li>
          </ul>
        </>
      ),
    },
    {
      n: 5,
      title: 'Copy your credentials',
      body: <>A dialog will show your <strong>Client ID</strong> and <strong>Client secret</strong>. Copy both and paste them into the form below. You can re-open them anytime from the Credentials page.</>,
    },
  ];

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>How to get OAuth credentials</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {steps.map((s) => (
          <div key={s.n} style={{ display: 'flex', gap: 12 }}>
            <div style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
              background: 'var(--primary, #4f46e5)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>{s.n}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
              <div style={{ color: 'var(--text-muted)' }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
        💡 Tip: Once configured, every site in your account can connect to Search Console with one click — you only do this setup once.
      </div>
    </div>
  );
}

function GscIntegration() {
  const [state, setState] = useState(null);
  const [conn, setConn] = useState(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const [r1, r2] = await Promise.all([
      fetch('/api/settings/integrations/gsc/credentials'),
      fetch('/api/settings/integrations/gsc/status'),
    ]);
    if (r1.ok) setState(await r1.json());
    if (r2.ok) setConn(await r2.json());
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setErr(decodeURIComponent(params.get('error')));
    if (params.get('connected')) setMsg('Google account connected.');
  }, []);

  const startConnect = async () => {
    setErr('');
    const r = await fetch('/api/settings/integrations/gsc/connect');
    const d = await r.json();
    if (!r.ok) { setErr(d.error); return; }
    window.location.href = d.url;
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect your Google account? All sites linked to Search Console will stop syncing and their keyword data will be deleted.')) return;
    await fetch('/api/settings/integrations/gsc/disconnect', { method: 'POST' });
    load();
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setErr(''); setMsg('');
    const r = await fetch('/api/settings/integrations/gsc/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    setSaving(false);
    if (r.ok) {
      setMsg('Credentials saved. Now click "Connect Google Search Console" in Step 3 below.');
      setClientId(''); setClientSecret('');
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      setErr(d.error || 'Failed to save');
    }
  };

  const remove = async () => {
    if (!confirm('Remove Google Search Console credentials? Existing site connections will stop syncing.')) return;
    await fetch('/api/settings/integrations/gsc/credentials', { method: 'DELETE' });
    load();
  };

  const copyRedirect = () => {
    if (!state?.redirectUri) return;
    navigator.clipboard.writeText(state.redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!state) return <div className="loading-inline"><div className="loading-spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16 }}>Google Search Console</h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Connect once with your Google Cloud OAuth credentials. Then any site can be linked to Search Console with a single click.
        </p>
      </div>

      {msg && <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>{msg}</div>}
      {err && <div className="auth-error">{err}</div>}

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Step 1 — Copy this Redirect URI
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, overflow: 'auto', color: 'var(--text)' }}>
            {state.redirectUri}
          </code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyRedirect}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Paste this into <strong>Authorized redirect URIs</strong> in your Google Cloud OAuth client. <button type="button" onClick={() => setShowHelp(!showHelp)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 12 }}>How to get OAuth credentials? {showHelp ? '▲' : '▼'}</button>
        </div>
        {showHelp && <SetupGuide />}
      </div>

      {state.configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--success-light)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Credentials saved</span>
          <span style={{ color: 'var(--text-muted)' }}>Client ID: {state.clientIdMasked}</span>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={remove}>Remove</button>
        </div>
      )}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Step 2 — Paste your OAuth credentials
        </div>
        <div className="form-group">
          <label>Client ID</label>
          <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123456789-abc.apps.googleusercontent.com" />
        </div>
        <div className="form-group">
          <label>Client Secret</label>
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-..." />
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={saving || !clientId || !clientSecret}>
          {saving ? 'Saving…' : state.configured ? 'Update Credentials' : 'Save Credentials'}
        </button>
      </form>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Step 3 — Connect your Google account
        </div>
        {!state.configured && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Save your OAuth credentials above first.</p>
        )}
        {state.configured && conn?.connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Connected</span>
            <span style={{ color: 'var(--text-muted)' }}>{conn.email}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={disconnectGoogle}>Disconnect</button>
          </div>
        )}
        {state.configured && !conn?.connected && (
          <button type="button" className="btn btn-primary" onClick={startConnect}>
            Connect Google Search Console
          </button>
        )}
      </div>
    </div>
  );
}
