export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.DATABASE_DRIVER === 'd1') return;
  if (process.env.DISABLE_BACKGROUND_SYNC === '1') return;

  const SYNC_INTERVAL = 60 * 1000;

  const runSync = async () => {
    try {
      const { syncStripePayments } = await import('./lib/stripe-sync.js');
      const result = await syncStripePayments();
      if (result.conversions > 0 || result.refunds > 0) {
        console.log(`[Stripe Sync] ${result.conversions} new conversions, ${result.refunds} refunds across ${result.sites} sites`);
      }
    } catch (err) {
      if (!err.message?.includes('no such table')) {
        console.error('[Stripe Sync] Error:', err.message);
      }
    }
  };

  setTimeout(runSync, 5000);
  setInterval(runSync, SYNC_INTERVAL);

  const GSC_INTERVAL = 60 * 60 * 1000;
  const runGscSync = async () => {
    try {
      const { syncAllConnections } = await import('./lib/gsc-sync.js');
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

  const BACKUP_CHECK_INTERVAL = 60 * 60 * 1000;
  const runScheduledBackup = async () => {
    try {
      const { getBackupConfig, getBackupHistory, runBackup } = await import('./lib/backup.js');
      const config = await getBackupConfig();
      if (!config.endpoint || !config.bucket || !config.access_key_id || !config.secret_access_key) return;

      const schedule = config.schedule || 'daily';
      const history = await getBackupHistory(1);
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
