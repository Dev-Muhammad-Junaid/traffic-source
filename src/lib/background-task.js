import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Run work after the HTTP response has been sent.
 *
 * On Cloudflare Workers this MUST go through ctx.waitUntil(): anything left
 * pending when the response is returned is cancelled, which is how a long
 * backfill could silently die part-way through. getCloudflareContext is
 * imported statically — the previous require() of this ESM-only package threw
 * inside the bundled worker, so the waitUntil branch was never taken and every
 * background task was fire-and-forget.
 *
 * On local Node there is no context and the task simply runs detached;
 * instrumentation.js handles periodic work there.
 */
export function scheduleBackgroundTask(task) {
  const run = () =>
    Promise.resolve(task()).catch((err) => {
      console.error('[background]', err?.message || err);
    });

  try {
    const { ctx } = getCloudflareContext();
    if (ctx?.waitUntil) {
      ctx.waitUntil(run());
      return;
    }
  } catch {
    // Not on the Cloudflare runtime (dev server, VPS/Node deploy).
  }

  run();
}
