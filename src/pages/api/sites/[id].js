import { getDb } from '@/lib/db';
import { withAuth } from '@/lib/withAuth';

export default withAuth(function handler(req, res) {
  const db = getDb();
  const { id } = req.query;

  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?')
    .get(id, req.user.userId);

  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  if (req.method === 'GET') {
    const maskedSite = { ...site };
    if (maskedSite.stripe_secret_key) {
      maskedSite.stripe_secret_key = '••••' + maskedSite.stripe_secret_key.slice(-4);
    }
    if (maskedSite.stripe_webhook_secret) {
      maskedSite.stripe_webhook_secret = '••••' + maskedSite.stripe_webhook_secret.slice(-4);
    }
    return res.status(200).json({ site: maskedSite });
  }

  if (req.method === 'PUT') {
    const { domain, name, stripe_secret_key, is_public, public_slug } = req.body;
    const cleanDomain = domain
      ? domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
      : site.domain;

    db.prepare('UPDATE sites SET domain = ?, name = ? WHERE id = ?').run(
      cleanDomain,
      name || site.name,
      id
    );

    if (stripe_secret_key !== undefined) {
      db.prepare('UPDATE sites SET stripe_secret_key = ? WHERE id = ?').run(
        stripe_secret_key || null,
        id
      );
    }

    if (is_public !== undefined) {
      if (is_public) {
        // Generate a slug if not provided
        let slug = public_slug;
        if (!slug) {
          slug = site.public_slug || site.domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        }
        slug = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
        // Check uniqueness
        const existing = db.prepare('SELECT id FROM sites WHERE public_slug = ? AND id != ?').get(slug, id);
        if (existing) {
          return res.status(400).json({ error: 'This slug is already taken. Please choose a different one.' });
        }
        db.prepare('UPDATE sites SET is_public = 1, public_slug = ? WHERE id = ?').run(slug, id);
      } else {
        db.prepare('UPDATE sites SET is_public = 0 WHERE id = ?').run(id);
      }
    } else if (public_slug !== undefined && site.is_public) {
      const slug = public_slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const existing = db.prepare('SELECT id FROM sites WHERE public_slug = ? AND id != ?').get(slug, id);
      if (existing) {
        return res.status(400).json({ error: 'This slug is already taken. Please choose a different one.' });
      }
      db.prepare('UPDATE sites SET public_slug = ? WHERE id = ?').run(slug, id);
    }

    const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    const maskedUpdated = { ...updated };
    if (maskedUpdated.stripe_secret_key) {
      maskedUpdated.stripe_secret_key = '••••' + maskedUpdated.stripe_secret_key.slice(-4);
    }
    if (maskedUpdated.stripe_webhook_secret) {
      maskedUpdated.stripe_webhook_secret = '••••' + maskedUpdated.stripe_webhook_secret.slice(-4);
    }
    return res.status(200).json({ site: maskedUpdated });
  }

  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM sites WHERE id = ?').run(id);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
