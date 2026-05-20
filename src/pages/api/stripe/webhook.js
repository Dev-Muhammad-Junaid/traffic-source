export default async function handler(req, res) {
  res.status(410).json({
    error: 'Webhooks are no longer used. Conversions are synced automatically via Stripe API polling.',
  });
}
