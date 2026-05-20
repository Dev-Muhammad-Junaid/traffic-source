# Traffic Source — Cloudflare Edition

Community fork of [Traffic Source](https://github.com/mddanishyusuf/traffic-source) with **Cloudflare Workers**, **D1**, and **OpenNext**. Deploy your own private analytics instance — no vendor lock-in.

Open-source, self-hosted web analytics with conversion tracking and affiliate management. Run on Cloudflare (serverless), a VPS, or Railway.

**No monthly fees. No data sharing. No limits.**

![Traffic Source Dashboard](demo-image.png)

| Resource | Link |
|----------|------|
| Original project | [mddanishyusuf/traffic-source](https://github.com/mddanishyusuf/traffic-source) |
| Cloudflare deploy guide | [DEPLOY.md](./DEPLOY.md) |
| Changes vs upstream | [ATTRIBUTION.md](./ATTRIBUTION.md) |

Original Traffic Source is built by the [SuperDevPro](https://superdevpro.com) team.

## About this project

[Traffic Source](https://github.com/mddanishyusuf/traffic-source) targets Node.js with **SQLite** and background workers via `setInterval`. **This repo keeps that path** for VPS/Railway/local dev and **adds Cloudflare**:

- **Workers + D1** — no VPS; database is Cloudflare D1
- **OpenNext** — Next.js 16 on the Workers runtime
- **Cron HTTP endpoints** — Stripe sync, aggregation, GSC sync, backups (Workers have no long-lived `setInterval`)
- **`ctx.waitUntil()`** — GSC initial backfill after linking a property
- **`ALLOW_REGISTRATION`** — optional multi-tenant sign-up on a shared instance

You can still run the app exactly like upstream on SQLite; set `DATABASE_DRIVER` unset (or omit) and use `npm run dev` / `npm start`.

## Features

- **Real-time Analytics** — Live visitor count, pageviews, sessions, bounce rate, and session duration
- **Traffic Sources** — Referrers, UTM parameters (source, medium, campaign, term, content)
- **Geo Tracking** — Country and city-level visitor data via Cloudflare proxy headers
- **Device & Browser** — Browser, OS, device type, and screen resolution breakdowns
- **Google Search Console** — One-click connect, drill into any keyword to see its pages, countries, and devices on a single screen
- **Conversion Tracking** — Stripe integration that auto-syncs payments every 60 seconds — no webhooks needed
- **Affiliate System** — Create affiliates with custom commission rates, shareable referral links, and public dashboards
- **Visitor Journeys** — Full session replay showing every page a visitor viewed before converting
- **Multi-site** — Track multiple websites from a single dashboard
- **Lightweight Script** — ~3KB tracking snippet with SPA support (pushState/popstate)
- **Privacy-first** — No cookies for tracking, all data stays on your infrastructure
- **SQLite or D1** — SQLite on VPS/Railway; **Cloudflare D1** on Workers

## Tech Stack

- **Framework:** Next.js 16 + React 19
- **Database:** SQLite (`better-sqlite3`) *or* **Cloudflare D1**
- **Hosting:** VPS + PM2, Railway, or **Cloudflare Workers** (OpenNext)
- **Payments:** Stripe API (polling-based, no webhooks)
- **Auth:** JWT with httpOnly cookies
- **Styling:** SASS
- **Charts:** Recharts

## Quick Start

### Option 1: Deploy on Cloudflare (Workers + D1)

Serverless hosting on Cloudflare — no VPS. Full guide: **[DEPLOY.md](./DEPLOY.md)**.

```bash
git clone https://github.com/YOUR_ORG/traffic-source.git
cd traffic-source
cp wrangler.jsonc.example wrangler.jsonc
# Edit wrangler.jsonc (URL, domain, ALLOW_REGISTRATION)
npm install
npx wrangler d1 create traffic-source-db
# Add database_id to wrangler.jsonc, then:
npx wrangler d1 migrations apply traffic-source-db --remote
npx wrangler secret put JWT_SECRET
npx wrangler secret put APP_ENCRYPTION_KEY
npx wrangler secret put CRON_SECRET
npm run deploy
```

**Multi-tenant (open registration):** set in `wrangler.jsonc` `vars`:

```jsonc
"ALLOW_REGISTRATION": "true"
```

**Single-tenant (first user only):** omit or set `"ALLOW_REGISTRATION": "false"`.

On D1/Workers, background jobs use HTTP cron (not `setInterval`). Configure cron hits for `stripe-sync`, `aggregate`, `gsc-sync`, and `backup` — see [DEPLOY.md](./DEPLOY.md).

### Option 2: One-click deploy on Railway (upstream-style)

No VPS setup needed — deploy in one click and you're live in under a minute.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/traffic-source)

Uses SQLite; no D1/Workers configuration required. See [upstream repo](https://github.com/mddanishyusuf/traffic-source) for Railway-specific notes.

### Option 3: Self-host on a VPS (upstream-style)

Same as the [original Traffic Source](https://github.com/mddanishyusuf/traffic-source#option-2-self-host-on-a-vps) VPS guide.

#### Prerequisites

- Node.js 20+
- A VPS ($4/mo on Hetzner or $6/mo on DigitalOcean works great)
- Cloudflare account (free tier) for geo data + CDN

#### 1. Clone and install

```bash
git clone https://github.com/mddanishyusuf/traffic-source.git
cd traffic-source
npm install
```

Or clone this Cloudflare edition and follow the Cloudflare section above.

#### 2. Configure environment

```bash
cp .env.local .env.production
```

Edit `.env.production`:

```env
JWT_SECRET=your-random-64-char-hex-string
JWT_EXPIRY=7d
NEXT_PUBLIC_APP_URL=https://your-domain.com
DATABASE_PATH=./data/analytics.db
```

Do **not** set `DATABASE_DRIVER=d1` on VPS — leave it unset so SQLite is used.

Generate a secure JWT secret:

```bash
openssl rand -hex 32
```

#### 3. Build and run

```bash
npm run build
npm start
```

The app runs on port 3000 by default. Background sync (Stripe, GSC) runs via `src/instrumentation.js` automatically on Node.

#### 4. Set up Cloudflare proxy

1. Add your domain to Cloudflare (free plan)
2. Point DNS A record to your VPS IP
3. Enable the orange cloud (proxy) toggle
4. Done — Cloudflare will now send `cf-ipcountry` and `cf-ipcity` headers automatically

#### 5. First login

Visit your domain and register.

- **Default:** only the **first** user can register; then registration closes.
- **Shared instance:** set `ALLOW_REGISTRATION=true` in your environment so anyone can sign up (each user’s sites stay isolated).

## Production Deployment (VPS)

### Using PM2 (recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start npm --name "trafficsource" -- start

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Zero-downtime deploys

The included deploy script pulls latest changes, builds in a temp directory, swaps atomically, and restarts PM2:

> **Note:** `npm run deploy` runs **OpenNext + Wrangler** (Cloudflare). On VPS, use `npm run build && pm2 restart trafficsource` or `scripts/deploy.sh`.

### Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Since Cloudflare handles SSL, you can use Cloudflare's Origin CA certificate or Full (Strict) mode.

## Adding the Tracking Script

After creating a site in the dashboard, add this to your website's `<head>`:

```html
<script defer src="https://your-domain.com/t.js" data-site="YOUR_SITE_ID"></script>
```

That's it. The script automatically tracks:
- Pageviews (including SPA navigation)
- Referrers and UTM parameters
- Screen dimensions
- Affiliate referrals (`?ref=affiliate-slug`)

## Stripe Conversion Tracking

1. Go to your site's Settings and add your Stripe Secret Key
2. When creating Stripe Checkout Sessions in your app, pass the visitor tracking IDs:

```javascript
const session = await stripe.checkout.sessions.create({
  // ...your checkout config
  metadata: {
    ts_visitor_id: window.__ts.vid,
    ts_session_id: window.__ts.sid(),
  },
});
```

Traffic Source polls Stripe every 60 seconds and automatically matches payments to visitor sessions — no webhook setup required.

On **Cloudflare**, polling is driven by the `/api/cron/stripe-sync` cron endpoint (not `setInterval`).

## Google Search Console

Connect your Google Search Console once and link any site to its property with a single click. Traffic Source keeps the last 90 days of keyword data and surfaces what's actually actionable: winners, losers, opportunities, quick wins, and a keyword explorer that shows pages, countries, and devices for any single query — something GSC's own UI doesn't surface together.

### One-time setup (per Traffic Source instance)

You need a Google Cloud OAuth client. Anyone using this instance shares the same client — you only do this once.

1. **Create a Google Cloud project** — [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate)
2. **Enable the Search Console API** — [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) → Enable
3. **Configure the OAuth consent screen** — [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
   - User type: **External**
   - Add scope: `.../auth/webmasters.readonly`
   - Add yourself (and any other users) under **Test users**
4. **Create OAuth credentials** — [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Under **Authorized redirect URIs**, paste the URI shown in Traffic Source → **Settings → Integrations** (auto-detected from your deployed domain)
5. **Save Client ID + Client Secret in Traffic Source** — Settings → Integrations → paste both → Save
6. **Click "Connect Google Search Console"** — authorize once, done

**Encryption at rest:**

| Deployment | Key storage |
|------------|-------------|
| VPS / Railway (upstream) | Auto-generated `data/.appkey` (back up with the database) |
| Cloudflare Workers | Wrangler secret `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`) |

### Linking a site

On any site → **Search Console** tab → pick the matching property → backfill runs in the background.

| Deployment | How sync runs |
|------------|----------------|
| VPS / Railway | `setInterval` in `instrumentation.js` (hourly) |
| Cloudflare | `waitUntil` on link + `/api/cron/gsc-sync` (configure hourly cron) |

## Affiliate System

1. Go to your site's Affiliates page
2. Create an affiliate with a name, slug, and commission rate
3. Share their referral link: `https://your-site.com?ref=affiliate-slug`
4. Affiliates can view their own public dashboard via a share link

When a visitor arrives via a referral link and later converts, the affiliate is automatically credited.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Random hex string for signing auth tokens |
| `JWT_EXPIRY` | No | `7d` | Auth token expiry duration |
| `NEXT_PUBLIC_APP_URL` | Yes | — | Public URL of your Traffic Source instance |
| `DATABASE_PATH` | VPS | `./data/analytics.db` | Path to SQLite database file |
| `DATABASE_DRIVER` | Cloudflare | — | Set to `d1` on Cloudflare Workers |
| `ALLOW_REGISTRATION` | No | `false` | `true` = anyone can sign up (multi-tenant) |
| `CRON_SECRET` | Cloudflare | — | Secret for protecting cron endpoints |
| `APP_ENCRYPTION_KEY` | Cloudflare | — | Encrypts GSC/Stripe credentials in DB (Wrangler secret) |

## Database

### SQLite (VPS / Railway / local) — upstream default

Traffic Source uses SQLite with WAL mode. The database file lives at `DATABASE_PATH` and includes automatic migrations.

**Backup:**

```bash
cp ./data/analytics.db ./data/analytics-backup-$(date +%Y%m%d).db
```

### Cloudflare D1

Schema lives in `d1/migrations/`. Apply with:

```bash
npx wrangler d1 migrations apply traffic-source-db --remote
```

**Export backup:**

```bash
npx wrangler d1 export traffic-source-db --remote --output=backup.sql
```

All users share one D1 database; **sites, analytics, and affiliates are scoped by `user_id`** so accounts cannot read each other’s data.

## Project Structure

```
├── d1/migrations/              # D1 schema (Cloudflare edition)
├── wrangler.jsonc              # Cloudflare Worker + D1 bindings
├── open-next.config.ts         # OpenNext for Workers
├── DEPLOY.md                   # Cloudflare deployment guide
├── ATTRIBUTION.md              # Upstream credit & fork changelog
├── public/
│   └── t.js                    # Tracking script (served to client sites)
├── scripts/
│   ├── deploy.sh               # Zero-downtime VPS deploy (upstream)
│   └── codemod-async-db.mjs    # D1 migration helpers
├── src/
│   ├── components/             # React components
│   ├── contexts/               # Auth, DateRange, Theme contexts
│   ├── hooks/                  # useAnalytics, custom hooks
│   ├── instrumentation.js      # Background sync (Node only; skipped on D1)
│   ├── lib/
│   │   ├── database/           # SQLite + D1 adapters (Cloudflare fork)
│   │   ├── background-task.js  # ctx.waitUntil helper (Workers)
│   │   ├── registration.js     # ALLOW_REGISTRATION helper
│   │   ├── db.js               # Database connection
│   │   ├── analytics.js        # Analytics query logic
│   │   ├── auth.js             # JWT & password helpers
│   │   ├── stripe-sync.js      # Stripe payment polling
│   │   └── withAuth.js         # Auth middleware for API routes
│   ├── pages/
│   │   ├── api/                # API routes (collect, auth, analytics, cron)
│   │   ├── analytics/          # Dashboard pages
│   │   └── sites/              # Site management
│   └── styles/                 # SASS stylesheets
├── data/                       # SQLite database directory (VPS)
├── .dev.vars.example           # Local Workers preview secrets template
└── .env.local                  # VPS environment config
```

## npm scripts

| Script | Target |
|--------|--------|
| `npm run dev` | Local Next.js (SQLite) |
| `npm run build` / `npm start` | VPS / Railway production |
| `npm run deploy` | **Cloudflare** — OpenNext build + `wrangler deploy` |
| `npm run preview` | Local Workers runtime + D1 |

## Configuration privacy

Do **not** commit `wrangler.jsonc` or `.dev.vars` — they contain your domain, D1 database ID, and secrets. Use `wrangler.jsonc.example` as a template (both are gitignored or example-only).

## License

MIT — same as [upstream Traffic Source](https://github.com/mddanishyusuf/traffic-source). See upstream for original copyright holders.
