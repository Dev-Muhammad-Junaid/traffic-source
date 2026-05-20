import { withAuth } from '@/lib/withAuth';
import { getDb } from '@/lib/db';

export default withAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const db = await getDb();

  const site = await db
    .prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?')
    .get(id, req.user.userId);

  if (!site) return res.status(404).json({ error: 'Site not found' });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const trackingSnippet = `<!-- Traffic Source Analytics -->
<script defer src="${appUrl}/t.js" data-site="${site.id}"></script>`;

  const stripeSnippet = `// In your checkout API route, pass the tracking cookies as metadata:
const session = await stripe.checkout.sessions.create({
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  mode: 'payment',
  metadata: {
    ts_visitor_id: req.cookies._ts_vid || '',
    ts_session_id: req.cookies._ts_sid || '',
  },
  success_url: 'https://${site.domain}/success',
  cancel_url: 'https://${site.domain}/cancel',
});`;

  res.status(200).json({
    site,
    trackingSnippet,
    stripeSnippet,
  });
});
