#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dirname, '..', 'src');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (p.endsWith('.js')) files.push(p);
  }
  return files;
}

function transform(content, file) {
  if (file.includes('database/') || file.includes('migrations.js')) return content;

  let s = content;

  // withAuth handlers
  s = s.replace(/withAuth\(function\s/g, 'withAuth(async function ');
  s = s.replace(/withAuth\(\(req,\s*res\)\s*=>/g, 'withAuth(async (req, res) =>');

  // default export handlers
  if (file.includes('/api/') || file.includes('/pages/api/')) {
    s = s.replace(/export default function handler/g, 'export default async function handler');
    s = s.replace(/export default async async function/g, 'export default async function');
  }

  // lib exports that use getDb
  const libAsyncFns = [
    'export function parseDateRange',
    'export function verifySiteOwnership',
    'export function getBreakdown',
    'export function getBackupConfig',
    'export function saveBackupConfig',
    'export function deleteBackupConfig',
    'export function createSnapshot',
    'export function getBackupHistory',
    'export function computeTrends',
    'export function saveUserConnection',
    'export function deleteUserConnection',
    'export function getSiteLink',
    'export function linkSiteProperty',
    'export function unlinkSite',
    'export function isGscConfigured',
    'export function getUserConnection',
    'export function getGscCredentials',
    'export function saveGscCredentials',
    'export function pruneOldData',
    'export function runVacuum',
  ];
  for (const sig of libAsyncFns) {
    s = s.replace(sig, sig.replace('export function', 'export async function'));
  }

  s = s.replace(/const db = getDb\(\)/g, 'const db = await getDb()');
  s = s.replace(/let db = getDb\(\)/g, 'let db = await getDb()');

  // await prepare chains (avoid double-await)
  s = s.replace(/await await /g, 'await ');

  const chainPatterns = [
    [/([^.]|^)(db\.prepare\([^)]+\)\.(?:get|all|run)\()/g, '$1await $2'],
    [/([^.]|^)(upsert\.run\()/g, '$1await $2'],
    [/([^.]|^)(insert\.run\()/g, '$1await $2'],
    [/([^.]|^)(stmt\.run\()/g, '$1await $2'],
    [/([^.]|^)(upsertQuery\.run\()/g, '$1await $2'],
    [/([^.]|^)(upsertPage\.run\()/g, '$1await $2'],
    [/([^.]|^)(upsertTotal\.run\()/g, '$1await $2'],
    [/([^.]|^)(upsertCountry\.run\()/g, '$1await $2'],
    [/([^.]|^)(upsertDevice\.run\()/g, '$1await $2'],
  ];

  for (const [re, repl] of chainPatterns) {
    s = s.replace(re, repl);
  }

  // tx() calls after transaction
  s = s.replace(/(\s+)tx\(\)/g, '$1await tx()');

  // transaction definitions that call sync tx
  s = s.replace(/const tx = db\.transaction\(\(\) => \{/g, 'const tx = () => db.transaction(async () => {');
  s = s.replace(/const tx = db\.transaction\(\(rows\) => \{/g, 'const tx = (rows) => db.transaction(async () => {');

  return s;
}

for (const file of walk(ROOT)) {
  const rel = path.relative(path.join(import.meta.dirname, '..'), file);
  const orig = fs.readFileSync(file, 'utf8');
  const next = transform(orig, file);
  if (next !== orig) {
    fs.writeFileSync(file, next);
    console.log('updated', rel);
  }
}
