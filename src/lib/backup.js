import fs from 'fs';
import path from 'path';
import os from 'os';
import { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getDb, resetDb, isD1 } from './db';
import { encrypt, decrypt } from './crypto';

const SETTINGS_KEYS = [
  'backup_endpoint',
  'backup_region',
  'backup_bucket',
  'backup_access_key_id',
  'backup_secret_access_key',
  'backup_prefix',
  'backup_provider',
  'backup_schedule',
];

const ENCRYPTED_KEYS = ['backup_access_key_id', 'backup_secret_access_key'];

export async function getBackupConfig() {
  const db = await getDb();
  const rows = await db
    .prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'backup_%'`)
    .all();

  const config = {};
  for (const row of rows) {
    const val = ENCRYPTED_KEYS.includes(row.key)
      ? decrypt(row.value)
      : row.value;
    const shortKey = row.key.replace('backup_', '');
    config[shortKey] = val;
  }
  return config;
}

export async function saveBackupConfig(config) {
  const db = await getDb();
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );

  await db.transaction(async () => {
    for (const fullKey of SETTINGS_KEYS) {
      const shortKey = fullKey.replace('backup_', '');
      const rawVal = config[shortKey];
      if (rawVal === undefined) continue;
      const val = ENCRYPTED_KEYS.includes(fullKey) ? encrypt(rawVal) : rawVal;
      await upsert.run(fullKey, val);
    }
  });
}

export async function deleteBackupConfig() {
  const db = await getDb();
  await db.prepare(`DELETE FROM app_settings WHERE key LIKE 'backup_%'`).run();
}

function buildS3Client(config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'auto',
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
    forcePathStyle: true,
  });
}

export async function testConnection(config) {
  const client = buildS3Client(config);
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  return true;
}

export async function createSnapshot() {
  const db = await getDb();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `trafficsource-backup-${timestamp}.db`;
  const tmpPath = path.join(os.tmpdir(), filename);

  if (isD1(db)) {
    throw new Error(
      'SQLite file snapshots are not available on Cloudflare D1. Use D1 Time Travel in the dashboard, or export via wrangler d1 export.'
    );
  }

  await db.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
  const stats = fs.statSync(tmpPath);
  return { tmpPath, filename, sizeBytes: stats.size };
}

export async function uploadToS3(filePath, filename, config) {
  const client = buildS3Client(config);
  const prefix = config.prefix ? config.prefix.replace(/\/+$/, '') + '/' : '';
  const key = `${prefix}${filename}`;

  const body = fs.readFileSync(filePath);
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: 'application/x-sqlite3',
  }));

  return key;
}

export async function runBackup() {
  const db = await getDb();
  const config = await getBackupConfig();

  if (!config.endpoint || !config.bucket || !config.access_key_id || !config.secret_access_key) {
    throw new Error('Backup not configured');
  }

  const entry = await db
    .prepare(`INSERT INTO backup_history (filename, storage_provider, status) VALUES ('', ?, 'running')`)
    .run(config.provider || 'custom');
  const backupId = entry.lastInsertRowid;

  try {
    const { tmpPath, filename, sizeBytes } = await createSnapshot();

    await db.prepare(`UPDATE backup_history SET filename = ?, size_bytes = ? WHERE id = ?`)
      .run(filename, sizeBytes, backupId);

    await uploadToS3(tmpPath, filename, config);
    fs.unlinkSync(tmpPath);

    await db.prepare(`UPDATE backup_history SET status = 'completed', completed_at = datetime('now') WHERE id = ?`)
      .run(backupId);

    return { id: backupId, filename, sizeBytes, status: 'completed' };
  } catch (err) {
    await db.prepare(`UPDATE backup_history SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(err.message, backupId);
    throw err;
  }
}

export async function getBackupHistory(limit = 20) {
  const db = await getDb();
  return db
    .prepare(`SELECT * FROM backup_history ORDER BY started_at DESC LIMIT ?`)
    .all(limit);
}

export async function listRemoteBackups() {
  const config = await getBackupConfig();
  if (!config.endpoint || !config.bucket || !config.access_key_id || !config.secret_access_key) {
    throw new Error('Backup not configured');
  }

  const client = buildS3Client(config);
  const prefix = config.prefix ? config.prefix.replace(/\/+$/, '') + '/' : '';

  const result = await client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: prefix,
  }));

  return (result.Contents || [])
    .filter(obj => obj.Key.endsWith('.db'))
    .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
    .map(obj => ({
      key: obj.Key,
      filename: obj.Key.split('/').pop(),
      size: obj.Size,
      lastModified: obj.LastModified.toISOString(),
    }));
}

async function downloadFromS3(key, destPath, config) {
  const client = buildS3Client(config);
  const result = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));

  const chunks = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }
  fs.writeFileSync(destPath, Buffer.concat(chunks));
}

export async function restoreBackup(key) {
  const db = await getDb();
  if (isD1(db)) {
    throw new Error(
      'SQLite file restore is not supported on Cloudflare D1. Restore via wrangler d1 import or D1 Time Travel.'
    );
  }

  const config = await getBackupConfig();
  if (!config.endpoint || !config.bucket || !config.access_key_id || !config.secret_access_key) {
    throw new Error('Backup not configured');
  }

  const DB_PATH = process.env.DATABASE_PATH || './data/analytics.db';
  const dbDir = path.dirname(DB_PATH);
  const filename = key.split('/').pop();
  const tmpPath = path.join(os.tmpdir(), `restore-${filename}`);

  await downloadFromS3(key, tmpPath, config);

  const Database = (await import('better-sqlite3')).default;
  const testDb = new Database(tmpPath, { readonly: true });
  try {
    testDb.pragma('integrity_check');
    const tables = testDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    const tableNames = tables.map(t => t.name);
    if (!tableNames.includes('sessions') || !tableNames.includes('sites')) {
      throw new Error('Invalid backup: missing required tables');
    }
  } finally {
    testDb.close();
  }

  const safetyFilename = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
  const safetyPath = path.join(dbDir, safetyFilename);
  await db.exec(`VACUUM INTO '${safetyPath.replace(/'/g, "''")}'`);

  if (db.raw?.close) db.raw.close();

  const walPath = DB_PATH + '-wal';
  const shmPath = DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  fs.copyFileSync(tmpPath, DB_PATH);
  fs.unlinkSync(tmpPath);

  resetDb();

  return { restored: filename, safetyBackup: safetyFilename };
}
