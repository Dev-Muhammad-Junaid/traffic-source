import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DashboardLayout from '@/components/layout/DashboardLayout';

function highlightCode(code, highlightPatterns = []) {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const TOKEN_RE =
    /('(?:[^'\\]|\\.)*')|("(?:[^"\\]|\\.)*")|(\b(?:const|let|var|await|async|function|return|if|else|import|from|export|default|new)\b)|(&lt;\/?[\w-]+)|(\b(?:true|false|null|undefined)\b)/g;

  return html
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      const isHighlighted = highlightPatterns.some((p) => trimmed.includes(p));

      let tokenized;
      if (trimmed.startsWith('//') || trimmed.startsWith('&lt;!--')) {
        tokenized = '<span class="hl-comment">' + line + '</span>';
      } else {
        tokenized = line.replace(TOKEN_RE, (match, sq, dq, kw, tag, lit) => {
          if (sq || dq) return '<span class="hl-string">' + match + '</span>';
          if (kw) return '<span class="hl-keyword">' + match + '</span>';
          if (tag) return '<span class="hl-tag">' + match + '</span>';
          if (lit) return '<span class="hl-literal">' + match + '</span>';
          return match;
        });
      }

      if (isHighlighted) {
        return '<span class="hl-line">' + tokenized + '</span>';
      }
      return tokenized;
    })
    .join('\n');
}

function CodeBlock({ code, onCopy, highlightPatterns }) {
  const highlighted = useMemo(() => highlightCode(code, highlightPatterns), [code, highlightPatterns]);
  return (
    <div className="code-block">
      <button className="copy-btn" onClick={onCopy}>Copy</button>
      <pre><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
    </div>
  );
}

export default function SiteSettings() {
  const router = useRouter();
  const { siteId } = router.query;

  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snippetData, setSnippetData] = useState(null);
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeMessage, setStripeMessage] = useState('');
  const [stripeError, setStripeError] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [publicSlug, setPublicSlug] = useState('');
  const [shareSaving, setShareSaving] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareError, setShareError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const [siteRes, snippetRes] = await Promise.all([
          fetch(`/api/sites/${siteId}`),
          fetch(`/api/sites/${siteId}/snippet`),
        ]);
        if (siteRes.ok) {
          const data = await siteRes.json();
          setSite(data.site);
          setStripeSecretKey(data.site.stripe_secret_key || '');
          setIsPublic(!!data.site.is_public);
          setPublicSlug(data.site.public_slug || '');
        }
        if (snippetRes.ok) {
          setSnippetData(await snippetRes.json());
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const handleSaveStripe = async (e) => {
    e.preventDefault();
    setStripeSaving(true);
    setStripeMessage('');
    setStripeError('');
    try {
      const body = {};
      if (stripeSecretKey && !stripeSecretKey.startsWith('••••')) {
        body.stripe_secret_key = stripeSecretKey;
      }
      if (Object.keys(body).length === 0) {
        setStripeMessage('No changes to save');
        return;
      }
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStripeSecretKey(data.site.stripe_secret_key || '');
      setStripeMessage('Stripe key saved');
    } catch (err) {
      setStripeError(err.message);
    } finally {
      setStripeSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this site and all its data?')) return;
    await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
    router.push('/sites');
  };

  const handleTogglePublic = async (enable) => {
    setShareSaving(true);
    setShareMessage('');
    setShareError('');
    try {
      const body = { is_public: enable };
      if (enable && publicSlug) body.public_slug = publicSlug;
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsPublic(!!data.site.is_public);
      setPublicSlug(data.site.public_slug || '');
      setSite(data.site);
      setShareMessage(enable ? 'Public analytics enabled.' : 'Public analytics disabled.');
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareSaving(false);
    }
  };

  const handleUpdateSlug = async (e) => {
    e.preventDefault();
    setShareSaving(true);
    setShareMessage('');
    setShareError('');
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_slug: publicSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPublicSlug(data.site.public_slug || '');
      setSite(data.site);
      setShareMessage('Slug updated.');
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareSaving(false);
    }
  };

  const copyShareUrl = () => {
    const url = `${window.location.origin}/shared/${publicSlug}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading || !site) {
    return (
      <>
        <Head><title>Settings - Traffic Source</title></Head>
        <DashboardLayout siteId={siteId}>
          <div className="loading-inline"><div className="loading-spinner" /></div>
        </DashboardLayout>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Settings - {site.name} - Traffic Source</title>
      </Head>
      <DashboardLayout siteId={siteId} siteName={site.name} siteDomain={site.domain}>
        <h2 className="page-title">Site Settings</h2>

        {/* ── Tracking Snippet ── */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-tabs">
              <button className="panel-tab active">Tracking Code</button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 20 }}>
            {snippetData ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Add this snippet to your website&apos;s HTML, before the closing &lt;/head&gt; tag:
                </p>
                <CodeBlock
                  code={snippetData.trackingSnippet}
                  onCopy={() => copyToClipboard(snippetData.trackingSnippet)}
                />

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 16 }}>
                  For Stripe conversion tracking, pass the tracking cookies as metadata in your checkout:
                </p>
                <CodeBlock
                  code={snippetData.stripeSnippet}
                  onCopy={() => copyToClipboard(snippetData.stripeSnippet)}
                  highlightPatterns={['metadata', 'ts_visitor_id', 'ts_session_id']}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Traffic Source will automatically sync payments from Stripe. No webhook setup needed.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Could not load snippet data.</p>
            )}
          </div>
        </div>

        {/* ── Stripe Settings ── */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-tabs">
              <button className="panel-tab active">Stripe</button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 20 }}>
            {stripeMessage && (
              <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 }}>
                {stripeMessage}
              </div>
            )}
            {stripeError && <div className="auth-error">{stripeError}</div>}
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter your Stripe Secret Key. You can find it in your Stripe Dashboard under Developers &gt; API keys.
              Traffic Source will automatically sync your payments &mdash; no webhook setup required.
            </p>
            <form onSubmit={handleSaveStripe} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label>Stripe Secret Key</label>
                <input
                  type="password"
                  value={stripeSecretKey}
                  onChange={(e) => setStripeSecretKey(e.target.value)}
                  placeholder="sk_live_..."
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={stripeSaving} style={{ alignSelf: 'flex-start' }}>
                {stripeSaving ? 'Saving...' : 'Save Key'}
              </button>
            </form>
          </div>
        </div>

        {/* ── Public Sharing ── */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-tabs">
              <button className="panel-tab active">Public Analytics</button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 20 }}>
            {shareMessage && (
              <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 }}>
                {shareMessage}
              </div>
            )}
            {shareError && <div className="auth-error" style={{ marginBottom: 12 }}>{shareError}</div>}

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Share your analytics publicly with a unique URL. Visitors can view traffic stats without needing to log in. Revenue and conversion data is not included.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button
                className={`btn ${isPublic ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleTogglePublic(!isPublic)}
                disabled={shareSaving}
                style={{ minWidth: 140 }}
              >
                {shareSaving ? 'Saving...' : isPublic ? 'Disable Sharing' : 'Enable Sharing'}
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {isPublic ? 'Anyone with the link can view analytics.' : 'Analytics are private.'}
              </span>
            </div>

            {isPublic && (
              <>
                <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Public URL
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 6, fontSize: 13, overflow: 'auto', color: 'var(--text)' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/shared/${publicSlug}` : `/shared/${publicSlug}`}
                    </code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyShareUrl}>
                      {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <form onSubmit={handleUpdateSlug} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Custom Slug</label>
                    <input
                      type="text"
                      value={publicSlug}
                      onChange={(e) => setPublicSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                      placeholder="my-site-analytics"
                    />
                  </div>
                  <button type="submit" className="btn btn-secondary" disabled={shareSaving} style={{ height: 38 }}>
                    {shareSaving ? 'Saving...' : 'Update Slug'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div className="panel" style={{ borderColor: 'var(--danger, #e53e3e)' }}>
          <div className="panel-header">
            <div className="panel-tabs">
              <button className="panel-tab active" style={{ color: 'var(--danger, #e53e3e)' }}>Danger Zone</button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Permanently delete <strong>{site.name}</strong> and all its analytics data. This action cannot be undone.
            </p>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete Site
            </button>
          </div>
        </div>

      </DashboardLayout>
    </>
  );
}
