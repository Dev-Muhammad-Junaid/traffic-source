# Deploy Traffic Source to Cloudflare

This guide is for the **[Cloudflare edition](https://github.com/Dev-Muhammad-Junaid/traffic-source)** of [Traffic Source](https://github.com/mddanishyusuf/traffic-source) — a fork that adds **Workers**, **D1**, and **OpenNext** while keeping the upstream VPS/SQLite path available.

| | |
|---|---|
| **Fork repo** | https://github.com/Dev-Muhammad-Junaid/traffic-source |
| **Upstream** | https://github.com/mddanishyusuf/traffic-source |
| **Fork vs upstream** | [ATTRIBUTION.md](./ATTRIBUTION.md) |

## Prerequisites

- Cloudflare account (paid Workers recommended)
- Wrangler logged in: `npx wrangler whoami`
- A domain on Cloudflare (e.g. `yourdomain.com`)

## 0. Configure Wrangler

`wrangler.jsonc` is not committed (it may contain your D1 ID and domain). Copy the template:

```bash
cp wrangler.jsonc.example wrangler.jsonc
```

Edit `wrangler.jsonc`:

- `NEXT_PUBLIC_APP_URL` — public URL of your instance (e.g. `https://analytics.yourdomain.com`)
- `d1_databases[0].database_id` — from step 1 below
- `routes[0].pattern` — your analytics hostname
- `ALLOW_REGISTRATION` — `false` (default, private) or `true` only if you intentionally run a shared multi-tenant instance

## 1. Create D1 database

```bash
npx wrangler d1 create traffic-source-db
```

Copy the `database_id` from the output into `wrangler.jsonc` → `d1_databases[0].database_id`.

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

Set `routes` in `wrangler.jsonc` to your hostname (e.g. `analytics.yourdomain.com`). After first deploy, confirm the route in **Workers & Pages → traffic-source → Settings → Domains**.

## 5. Deploy

```bash
npm install
npm run deploy
```

First deploy builds with OpenNext and uploads the Worker. Allow a few minutes for the custom domain to become active.

## 6. Accounts & registration

**Default (`ALLOW_REGISTRATION=false`):** only the **first** user can register; then registration is closed. Use this for a private analytics instance.

**Optional multi-tenant (`ALLOW_REGISTRATION=true`):** anyone can sign up; each user only sees their own sites (`user_id` on every site). Only enable this if you are deliberately operating a shared public service.

GSC OAuth client credentials are **per instance** (Settings → Integrations); each user links their own Google account to their sites.

## 7. Cron jobs (Stripe sync, GSC, backups, aggregation)

Background `setInterval` in `instrumentation.js` is **disabled** on D1/Workers. Use HTTP cron instead.

In **Cloudflare dashboard → Workers → traffic-source → Triggers → Cron Triggers**, or use [cron-job.org](https://cron-job.org) to POST (replace `YOUR_DOMAIN`):

| Schedule   | URL | Header |
|------------|-----|--------|
| Every 5 min | `https://YOUR_DOMAIN/api/cron/stripe-sync` | `x-cron-secret: YOUR_CRON_SECRET` |
| Hourly | `https://YOUR_DOMAIN/api/cron/aggregate` | same |
| Hourly | `https://YOUR_DOMAIN/api/cron/gsc-sync` | same |
| Hourly | `https://YOUR_DOMAIN/api/cron/backup` | same |

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

## 9. Tracking snippet

After creating a site in the dashboard, add to your website:

```html
<script defer src="https://YOUR_DOMAIN/t.js" data-site="YOUR_SITE_ID"></script>
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
