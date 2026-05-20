import Stripe from 'stripe';
import { getDb } from './db';

export async function syncStripePayments() {
  const db = await getDb();

  const sites = await db
    .prepare('SELECT id, stripe_secret_key FROM sites WHERE stripe_secret_key IS NOT NULL')
    .all();

  if (sites.length === 0) return { sites: 0, conversions: 0, refunds: 0 };

  let totalProcessed = 0;
  let totalRefunds = 0;

  for (const site of sites) {
    const stripe = new Stripe(site.stripe_secret_key);
    const since = Math.floor(Date.now() / 1000) - 86400;

    try {
      const sessions = await stripe.checkout.sessions.list({
        status: 'complete',
        created: { gte: since },
        limit: 100,
      });

      for (const session of sessions.data) {
        if (!session.payment_status || session.payment_status !== 'paid') continue;

        const paymentIntentId = session.payment_intent || session.id;

        const existing = await db
          .prepare('SELECT id FROM conversions WHERE payment_intent_id = ? AND site_id = ?')
          .get(paymentIntentId, site.id);
        if (existing) continue;

        let visitorId = session.metadata?.ts_visitor_id || null;
        let sessionId = session.metadata?.ts_session_id || null;

        if (!visitorId && session.client_reference_id) {
          const parts = session.client_reference_id.split('|');
          if (parts.length === 3) {
            visitorId = parts[0];
            sessionId = parts[1];
          }
        }

        let utmSource = null;
        let utmMedium = null;
        let utmCampaign = null;
        let referrerDomain = null;

        if (sessionId) {
          const origSession = await db
            .prepare('SELECT * FROM sessions WHERE id = ?')
            .get(sessionId);
          if (origSession) {
            utmSource = origSession.utm_source;
            utmMedium = origSession.utm_medium;
            utmCampaign = origSession.utm_campaign;
            referrerDomain = origSession.referrer_domain;
          }
        }

        if (!utmSource && visitorId) {
          const recentSession = await db
            .prepare('SELECT * FROM sessions WHERE visitor_id = ? ORDER BY started_at DESC LIMIT 1')
            .get(visitorId);
          if (recentSession) {
            if (!sessionId) sessionId = recentSession.id;
            utmSource = recentSession.utm_source;
            utmMedium = recentSession.utm_medium;
            utmCampaign = recentSession.utm_campaign;
            referrerDomain = recentSession.referrer_domain;
          }
        }

        const amount = session.amount_total || 0;
        const currency = session.currency || 'usd';

        let affiliateId = null;
        if (visitorId) {
          const affiliateVisit = await db
            .prepare('SELECT affiliate_id FROM affiliate_visits WHERE visitor_id = ? AND site_id = ? ORDER BY landed_at DESC LIMIT 1')
            .get(visitorId, site.id);
          if (affiliateVisit) affiliateId = affiliateVisit.affiliate_id;
        }

        await db.prepare(
          `INSERT OR IGNORE INTO conversions (
            site_id, session_id, visitor_id, stripe_event_id,
            stripe_customer_id, stripe_customer_email, payment_intent_id,
            amount, currency, status,
            utm_source, utm_medium, utm_campaign, referrer_domain, affiliate_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          site.id,
          sessionId,
          visitorId,
          session.id,
          session.customer || null,
          session.customer_email || session.customer_details?.email || null,
          paymentIntentId,
          amount,
          currency,
          'completed',
          utmSource,
          utmMedium,
          utmCampaign,
          referrerDomain,
          affiliateId
        );

        totalProcessed++;
      }

      const charges = await stripe.charges.list({
        created: { gte: since },
        limit: 100,
      });

      for (const charge of charges.data) {
        if (!charge.refunded) continue;
        const updated = await db
          .prepare("UPDATE conversions SET status = 'refunded' WHERE payment_intent_id = ? AND site_id = ? AND status = 'completed'")
          .run(charge.payment_intent, site.id);
        if (updated.changes > 0) totalRefunds++;
      }
    } catch (stripeErr) {
      console.error(`Stripe sync error for site ${site.id}:`, stripeErr.message);
    }
  }

  return { sites: sites.length, conversions: totalProcessed, refunds: totalRefunds };
}
