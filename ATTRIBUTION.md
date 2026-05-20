# Attribution

## Upstream project

This repository is a **fork and extension** of [Traffic Source](https://github.com/mddanishyusuf/traffic-source) by the SuperDevPro team.

- **Original repo:** https://github.com/mddanishyusuf/traffic-source  
- **Original license:** MIT (see [LICENSE](./LICENSE) if present in tree)

Use the upstream repository if you want the stock VPS/Railway + SQLite deployment without Cloudflare-specific changes.

## Cloudflare edition

This repository is a community fork. Deploy your own instance — see [DEPLOY.md](./DEPLOY.md). There is no bundled demo or hosted analytics service in this codebase.

### Additions in this fork

| Area | Upstream | This fork |
|------|----------|-----------|
| Hosting | VPS, Railway, Node `npm start` | **Cloudflare Workers** via OpenNext |
| Database | SQLite file (`better-sqlite3`) | **Cloudflare D1** + optional SQLite for local dev |
| Background jobs | `setInterval` in `instrumentation.js` | **HTTP cron** + `ctx.waitUntil()` on Workers |
| GSC backfill | Fire-and-forget after link | **`waitUntil`** + `/api/cron/gsc-sync` |
| Registration | First user only | Configurable **`ALLOW_REGISTRATION`** (multi-tenant) |
| Encryption key | `data/.appkey` on disk | **`APP_ENCRYPTION_KEY`** Wrangler secret on Cloudflare |
| Deploy | PM2 / Railway | `npm run deploy` (Wrangler) — see [DEPLOY.md](./DEPLOY.md) |

Core product features (analytics, Stripe sync, affiliates, GSC UI, tracking script) come from Traffic Source; Cloudflare support is added in this fork without replacing the original deployment paths where possible.
