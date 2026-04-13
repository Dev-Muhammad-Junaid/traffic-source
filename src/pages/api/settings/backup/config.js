import { withAuth } from '@/lib/withAuth';
import { getBackupConfig, saveBackupConfig, deleteBackupConfig, testConnection } from '@/lib/backup';

export default withAuth(async function handler(req, res) {
  if (req.method === 'GET') {
    const config = getBackupConfig();
    // Mask sensitive keys
    if (config.access_key_id) {
      config.access_key_id = config.access_key_id.slice(0, 4) + '****';
    }
    if (config.secret_access_key) {
      config.secret_access_key = '****';
    }
    return res.json({ config });
  }

  if (req.method === 'POST') {
    const { endpoint, region, bucket, access_key_id, secret_access_key, prefix, provider, schedule } = req.body;
    if (!endpoint || !bucket || !access_key_id || !secret_access_key) {
      return res.status(400).json({ error: 'Missing required fields: endpoint, bucket, access_key_id, secret_access_key' });
    }
    saveBackupConfig({ endpoint, region, bucket, access_key_id, secret_access_key, prefix, provider, schedule });
    return res.json({ ok: true });
  }

  if (req.method === 'PUT') {
    // Test connection
    const config = getBackupConfig();
    // Allow overriding with body values for testing before saving
    const testConfig = {
      endpoint: req.body.endpoint || config.endpoint,
      region: req.body.region || config.region,
      bucket: req.body.bucket || config.bucket,
      access_key_id: req.body.access_key_id || config.access_key_id,
      secret_access_key: req.body.secret_access_key || config.secret_access_key,
    };
    try {
      await testConnection(testConfig);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: `Connection failed: ${err.message}` });
    }
  }

  if (req.method === 'DELETE') {
    deleteBackupConfig();
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
