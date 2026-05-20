#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dirname, '..', 'src/pages/api');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (p.endsWith('.js')) files.push(p);
  }
  return files;
}

function fix(content) {
  let s = content;
  s = s.replace(/(\bconst \w+ = )(?<!await )db\b/g, '$1await db');
  s = s.replace(/(\blet \w+ = )(?<!await )db\b/g, '$1await db');
  s = s.replace(/(\breturn )(?<!await )db\.prepare/g, '$1await db.prepare');
  s = s.replace(/(\n\s+)(?<!await )db\.prepare/g, '$1await db.prepare');
  s = s.replace(/await await /g, 'await ');
  return s;
}

for (const file of walk(ROOT)) {
  const orig = fs.readFileSync(file, 'utf8');
  const next = fix(orig);
  if (next !== orig) {
    fs.writeFileSync(file, next);
    console.log('fixed', path.relative(process.cwd(), file));
  }
}
