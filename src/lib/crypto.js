import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_PATH = path.join(path.dirname(process.env.DATABASE_PATH || './data/analytics.db'), '.appkey');

let cachedKey;

function getKey() {
  if (cachedKey) return cachedKey;
  try {
    cachedKey = Buffer.from(fs.readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
    if (cachedKey.length !== 32) throw new Error('bad key');
  } catch {
    cachedKey = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, cachedKey.toString('hex'), { mode: 0o600 });
  }
  return cachedKey;
}

export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload) {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
