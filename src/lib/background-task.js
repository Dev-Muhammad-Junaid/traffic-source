/**
 * Run work after the HTTP response on Cloudflare Workers (ctx.waitUntil).
 * On local Node, runs as fire-and-forget (instrumentation handles periodic sync).
 */
export function scheduleBackgroundTask(task) {
  const run = () =>
    Promise.resolve(task()).catch((err) => {
      console.error('[background]', err?.message || err);
    });

  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    const { ctx } = getCloudflareContext();
    if (ctx?.waitUntil) {
      ctx.waitUntil(run());
      return;
    }
  } catch {
    // Not on Cloudflare runtime
  }

  run();
}
