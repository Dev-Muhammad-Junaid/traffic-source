# Deploy Traffic Source to Cloudflare

Analytics dashboard at **https://analytics.example.com** using Workers + OpenNext + D1.

## Prerequisites

- Cloudflare account (paid Workers recommended)
- Wrangler logged in: `npx wrangler whoami`
- Domain `example.com` on Cloudflare

## 1. Create D1 database

```bash
npx wrangler d1 create traffic-source-db
```

Copy the `database_id` from the output into `wrangler.jsonc` → `d1_databases[0].database_id` (replace `REPLACE_AFTER_WRANGLER_D1_CREATE`).

Apply schema:

```bash
npx wrangler d1 migrations apply traffic-source-db --remote
```

## 2. Create R2 cache bucket (OpenNext ISR)

```bash
npx wrangler r2 bucket create traffic-source-opennext-cache
```

## 3. Set secrets

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # APP_ENCRYPTION_KEY (save this — decrypts GSC/Stripe creds in DB)

npx wrangler secret put JWT_SECRET
npx wrangler secret put APP_ENCRYPTION_KEY
npx wrangler secret put CRON_SECRET
```

Optional: `JWT_EXPIRY` as a var in `wrangler.jsonc` if you change the default.

## 4. DNS (Cloudflare dashboard)

| Type  | Name        | Target              | Proxy   |
|-------|-------------|---------------------|---------|
| CNAME | `analytics` | (auto on deploy)    | Proxied |

Custom domain `analytics.example.com` is configured in `wrangler.jsonc` `routes`. After first deploy, confirm the route in **Workers & Pages → traffic-source → Settings → Domains**.

## 5. Deploy

```bash
npm install
npm run deploy
```

First deploy builds with OpenNext and uploads the Worker. Allow a few minutes for the custom domain to become active.

## 6. Accounts & multi-user access

This deployment is configured as a **shared instance** (`ALLOW_REGISTRATION=true` in `wrangler.jsonc`):

- **Anyone** can sign up at https://analytics.example.com/register
- Each user only sees their own sites and analytics (`user_id` on every site)
- GSC OAuth credentials are **per instance** (Settings → Integrations); each user links their own Google account to their sites

For a **private** instance (first user only), set in `wrangler.jsonc`:

```jsonc
"ALLOW_REGISTRATION": "false"
```

Then only the first account can be created; further sign-ups are blocked.

Set `NEXT_PUBLIC_APP_URL` in `wrangler.jsonc` `vars` to your public URL.

## 7. Cron jobs (Stripe sync, GSC, backups, aggregation)

Background `setInterval` in `instrumentation.js` is **disabled** on D1/Workers. Use HTTP cron instead.

In **Cloudflare dashboard → Workers → traffic-source → Triggers → Cron Triggers**, or use [cron-job.org](https://cron-job.org) to POST:

| Schedule   | URL | Header |
|------------|-----|--------|
| Every 5 min | `https://analytics.example.com/api/cron/stripe-sync` | `x-cron-secret: YOUR_CRON_SECRET` |
| Hourly | `https://analytics.example.com/api/cron/aggregate` | same |
| Hourly | `https://analytics.example.com/api/cron/gsc-sync` | same |
| Hourly | `https://analytics.example.com/api/cron/backup` | same |

GSC backfill runs when you link a property (via `waitUntil` on Workers). Hourly `gsc-sync` keeps data updated after the first sync.

## 8. Migrate data from Railway (optional)

Export SQLite from Railway:

```bash
# On Railway shell or download volume
cp /data/analytics.db ./analytics.db
```

Import into D1 (experimental — verify row counts):

```bash
npx wrangler d1 execute traffic-source-db --remote --file=./path/to/export.sql
```

Or use [D1 import tools](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Test on staging first.

**Important:** Copy Railway `data/.appkey` hex into `APP_ENCRYPTION_KEY` secret, or re-enter GSC/Stripe credentials after cutover.

## 9. Example tracking snippet

In the Traffic Source dashboard, create site **Example**, then add to `example.com`:

```html
<script defer src="https://analytics.example.com/t.js" data-site="YOUR_SITE_ID"></script>
```

## Local development

**SQLite (default, no Cloudflare):**

```bash
cp .env.local.example .env.local   # if you have one
npm run dev
```

**Preview on Workers runtime + local D1:**

```bash
cp .dev.vars.example .dev.vars
# Fill secrets, set DATABASE_DRIVER=d1
npx wrangler d1 migrations apply traffic-source-db --local
npm run preview
```

## Backups on D1

- **D1 Time Travel** (dashboard): point-in-time restore, last 30 days on paid plans.
- App “Backup to S3/R2” uses SQLite `VACUUM INTO` — **not available on D1**. Configure R2 for other assets; use D1 export for DB backups:

```bash
npx wrangler d1 export traffic-source-db --remote --output=backup.sql
```
