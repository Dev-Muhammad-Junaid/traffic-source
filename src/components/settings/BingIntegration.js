import { useEffect, useState } from 'react';

export default function BingIntegration() {
  const [state, setState] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    const res = await fetch('/api/settings/integrations/bing/credentials');
    if (res.ok) setState(await res.json());
  };

  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    const res = await fetch('/api/settings/integrations/bing/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(body.error || 'Could not save the Bing API key');
      return;
    }
    const linked = (body.linked || []).map((site) => site.domain).join(', ');
    setMsg(`Connected ${body.verified?.length || 0} verified Bing site${body.verified?.length === 1 ? '' : 's'}.${linked ? ` Linked ${linked}. Sync started.` : ''}`);
    setApiKey('');
    load();
  };

  const remove = async () => {
    if (!confirm('Remove the Bing Webmaster API key? Linked sites will stop syncing.')) return;
    await fetch('/api/settings/integrations/bing/credentials', { method: 'DELETE' });
    setMsg('');
    load();
  };

  if (!state) return <div className="loading-inline"><div className="loading-spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 16 }}>Bing Webmaster</h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Clicks, impressions, queries, pages, and crawl stats from Bing. Generate a key in Bing Webmaster Tools → Settings → API Access. One key covers every verified site on that account.
        </p>
      </div>
      {msg && <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>{msg}</div>}
      {err && <div className="auth-error">{err}</div>}
      {state.configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>Key saved</span>
          <span style={{ color: 'var(--text-muted)' }}>{state.masked}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={remove}>Remove</button>
        </div>
      )}
      <form onSubmit={save} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
          <label>API key</label>
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the Bing Webmaster API key" autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !apiKey}>{saving ? 'Checking…' : state.configured ? 'Update key' : 'Save key'}</button>
      </form>
    </div>
  );
}
