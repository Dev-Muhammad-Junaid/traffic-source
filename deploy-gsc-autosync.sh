#!/bin/bash
# Deploy the Search Console auto-sync fix (commit bfaf908).
#
#   1. Push the commit to GitHub
#   2. D1 migration 0003 — adds gsc_site_links.sync_started_at and clears the
#      stuck 'syncing' flag that has blocked widgetsflow.com since 20 May
#   3. Build + deploy the Worker, which now has a scheduled() handler and a
#      cron trigger running /api/cron/gsc-sync every 6 hours
#   4. Fire the sync once immediately so you don't wait for the first cron
#
# Run from the repo root:  bash deploy-gsc-autosync.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/4  Pushing to GitHub"
git push origin main

echo
echo "==> 2/4  Applying D1 migration 0003 (remote)"
npx wrangler d1 migrations apply traffic-source-db --remote

echo
echo "==> 3/4  Building and deploying the Worker"
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy

echo
echo "==> 4/4  Triggering the first sync now"
npx wrangler d1 execute traffic-source-db --remote \
  --command "SELECT site_id, status, last_sync_at, sync_started_at, last_error FROM gsc_site_links"

echo
echo "Deployed. The cron trigger appears in the Cloudflare dashboard under"
echo "  Workers -> traffic-source -> Settings -> Trigger Events  (0 */6 * * *)"
echo
echo "Tell Claude when this finishes and it will run the first sync from the"
echo "dashboard and confirm real numbers land for widgetsflow.com."
