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
 * The scheduled handler dispatches through the WORKER_SELF_REFERENCE service
 * binding rather than calling the sync library directly: the Next.js request
 * context (D1 binding, env, AsyncLocalStorage) is set up by OpenNext's fetch
 * path, and is not available in a raw scheduled invocation.
 */
import worker from "./.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

const CRON_ROUTES = {
	// Google Search Console sync. syncAllConnections() skips any site synced in
	// the last 12h, so running every 6h just means a missed run heals quickly.
	"0 */6 * * *": "/api/cron/gsc-sync",
};

export default {
	fetch: worker.fetch,

	async scheduled(controller, env, ctx) {
		const path = CRON_ROUTES[controller.cron];
		if (!path) {
			console.error(`[cron] no route for schedule "${controller.cron}"`);
			return;
		}

		const base = env.NEXT_PUBLIC_APP_URL || "https://analytics.widgetsflow.com";
		const request = new Request(new URL(path, base).toString(), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(env.CRON_SECRET ? { "x-cron-secret": env.CRON_SECRET } : {}),
			},
		});

		const dispatch = env.WORKER_SELF_REFERENCE
			? env.WORKER_SELF_REFERENCE.fetch(request)
			: worker.fetch(request, env, ctx);

		try {
			const response = await dispatch;
			const body = await response.text();
			console.log(`[cron] ${path} -> ${response.status} ${body.slice(0, 500)}`);
		} catch (err) {
			console.error(`[cron] ${path} failed:`, err?.message || err);
		}
	},
};
