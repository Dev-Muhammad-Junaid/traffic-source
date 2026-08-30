#!/bin/bash
# Deploy the Search Console auto-sync fix.
#
#   1. D1 migration 0003 (adds gsc_site_links.sync_started_at and clears the
#      stuck 'syncing' flag on widgetsflow.com)
#   2. Build + deploy the Worker, which now has a scheduled() handler and a
#      cron trigger that runs /api/cron/gsc-sync every 6 hours
#
# Run from the repo root:  bash deploy-gsc-autosync.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/3  Applying D1 migration 0003 (remote)"
npx wrangler d1 migrations apply traffic-source-db --remote

echo
echo "==> 2/3  Building and deploying the Worker"
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy

echo
echo "==> 3/3  Confirming the cron trigger is registered"
npx wrangler deployments list --name traffic-source | head -20 || true

echo
echo "Done. The Search Console sync now runs every 6 hours."
echo "Cron schedule can be checked at: Cloudflare dashboard -> Workers -> traffic-source -> Settings -> Trigger Events"
