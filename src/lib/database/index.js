import { getCloudflareContext } from '@opennextjs/cloudflare';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from '../migrations';
import { createSqliteClient, createD1Client } from './client';

const DB_PATH = process.env.DATABASE_PATH || './data/analytics.db';

let sqliteRaw;
let sqliteClient;

function shouldUseSqlite() {
  if (process.env.DATABASE_DRIVER === 'd1') return false;
  if (process.env.DATABASE_DRIVER === 'sqlite') return true;
  return process.env.USE_LOCAL_DB === '1';
}

function getSqliteRaw() {
  if (!sqliteRaw) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    sqliteRaw = new Database(DB_PATH);
    sqliteRaw.pragma('journal_mode = WAL');
    sqliteRaw.pragma('foreign_keys = ON');
    sqliteRaw.pragma('busy_timeout = 5000');
    runMigrations(sqliteRaw);
    sqliteClient = createSqliteClient(sqliteRaw);
  }
  return sqliteClient;
}

export async function getDb() {
  if (shouldUseSqlite()) {
    return getSqliteRaw();
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.DB) {
      return createD1Client(env.DB);
    }
  } catch {
    /* build / missing binding */
  }

  if (process.env.DATABASE_DRIVER === 'd1') {
    throw new Error('D1 binding DB is not available. Check wrangler.jsonc and deploy configuration.');
  }

  return getSqliteRaw();
}

export function isD1(db) {
  return db?.driver === 'd1';
}

export function resetDb() {
  if (sqliteRaw) {
    try {
      sqliteRaw.close();
    } catch {
      /* ignore */
    }
  }
  sqliteRaw = null;
  sqliteClient = null;
}
