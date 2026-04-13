export async function register() {
  // Only run on the Node.js server, not during builds or in the browser
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const SYNC_INTERVAL = 60 * 1000; // 60 seconds

    const runSync = async () => {
      try {
        const { syncStripePayments } = await import('./src/lib/stripe-sync.js');
        const result = await syncStripePayments();
        if (result.conversions > 0 || result.refunds > 0) {
          console.log(`[Stripe Sync] ${result.conversions} new conversions, ${result.refunds} refunds across ${result.sites} sites`);
        }
      } catch (err) {
        // Don't crash the server — just log and retry next interval
        if (!err.message?.includes('no such table')) {
          console.error('[Stripe Sync] Error:', err.message);
        }
      }
    };

    // Initial sync after a short delay to let the server fully start
    setTimeout(runSync, 5000);

    // Then sync every 60 seconds
    setInterval(runSync, SYNC_INTERVAL);

    // ── Google Search Console sync (runs every hour, internally throttled to once/12h per site) ──
    const GSC_INTERVAL = 60 * 60 * 1000; // 1 hour
    const runGscSync = async () => {
      try {
        const { syncAllConnections } = await import('./src/lib/gsc-sync.js');
        const result = await syncAllConnections();
        if (result.synced > 0) {
          console.log(`[GSC Sync] Synced ${result.synced} site(s)`);
        }
      } catch (err) {
        if (!err.message?.includes('no such table')) {
          console.error('[GSC Sync] Error:', err.message);
        }
      }
    };
    setTimeout(runGscSync, 15000);
    setInterval(runGscSync, GSC_INTERVAL);

    // ── Scheduled database backup ──
    const BACKUP_CHECK_INTERVAL = 60 * 60 * 1000; // check every hour
    const runScheduledBackup = async () => {
      try {
        const { getBackupConfig, getBackupHistory, runBackup } = await import('./src/lib/backup.js');
        const config = getBackupConfig();
        if (!config.endpoint || !config.bucket || !config.access_key_id || !config.secret_access_key) return;

        const schedule = config.schedule || 'daily';
        const history = getBackupHistory(1);
        const lastBackup = history[0]?.completed_at ? new Date(history[0].completed_at + 'Z') : null;
        const now = new Date();

        let shouldBackup = !lastBackup;
        if (lastBackup) {
          const hoursSince = (now - lastBackup) / (1000 * 60 * 60);
          if (schedule === 'daily' && hoursSince >= 24) shouldBackup = true;
          if (schedule === 'weekly' && hoursSince >= 168) shouldBackup = true;
          if (schedule === '12h' && hoursSince >= 12) shouldBackup = true;
        }

        if (shouldBackup) {
          const result = await runBackup();
          console.log(`[Backup] Completed: ${result.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB)`);
        }
      } catch (err) {
        if (!err.message?.includes('no such table')) {
          console.error('[Backup] Error:', err.message);
        }
      }
    };
    setTimeout(runScheduledBackup, 30000);
    setInterval(runScheduledBackup, BACKUP_CHECK_INTERVAL);
  }
}
