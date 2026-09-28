/**
 * Cloudflare Worker entry point.
 *
 * OpenNext generates .open-next/worker.js with only a fetch handler, so a
 * Cron Trigger has nothing to call and scheduled work never runs on Cloudflare.
 * (instrumentation.js runs the periodic GSC sync, but it bails out when
 * DATABASE_DRIVER === 'd1', which is exactly the Cloudflare deployment.)
 *
 * This wraps the generated worker and adds scheduled(), keeping fetch and the
 * Durable Object exports untouched.
 *
 * The scheduled handler calls OpenNext's fetch() with the cron env and ctx.
 * That is what installs the D1 request context. Do not await a service binding
 * back into this same Worker: the scheduled invocation deadlocks and the sync
 * route never runs.
 */
import worker from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const CRON_ROUTES = {
	// Google Search Console sync. syncAllConnections() skips any site synced in
	// the last 12h, so running every 6h just means a missed run heals quickly.
	"0 */6 * * *": "/api/cron/gsc-sync",
	// Bing keyword and page stats refresh weekly. A daily pull is enough.
	"15 4 * * *": "/api/cron/bing-sync",
};

export default {
	fetch: worker.fetch,

	async scheduled(controller, env, ctx) {
		let path = CRON_ROUTES[controller.cron];
		if (!path) {
			const only = Object.entries(CRON_ROUTES);
			// Cloudflare sometimes hands the cron back in a normalized form that
			// no longer matches the key in wrangler.jsonc. With a single job,
			// run that job instead of returning and leaving Search Console stale.
			if (only.length === 1) {
				console.error(`[cron] schedule "${controller.cron}" did not match "${only[0][0]}"; running ${only[0][1]}`);
				path = only[0][1];
			} else {
				console.error(`[cron] no route for schedule "${controller.cron}"`);
				return;
			}
		}

		const base = env.NEXT_PUBLIC_APP_URL || "https://analytics.widgetsflow.com";
		const request = new Request(new URL(path, base).toString(), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(env.CRON_SECRET ? { "x-cron-secret": env.CRON_SECRET } : {}),
			},
			body: "{}",
		});

		// Call OpenNext's fetch directly. Awaiting WORKER_SELF_REFERENCE.fetch()
		// here deadlocks: that binding is this same Worker, and a scheduled
		// invocation that waits on itself never reaches /api/cron/gsc-sync.
		// OpenNext's fetch sets up the D1 request context from env and ctx.
		try {
			const response = await worker.fetch(request, env, ctx);
			const body = await response.text();
			console.log(`[cron] ${path} -> ${response.status} ${body.slice(0, 500)}`);
		} catch (err) {
			console.error(`[cron] ${path} failed:`, err?.message || err);
		}
	},
};
