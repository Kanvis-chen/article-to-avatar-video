#!/usr/bin/env node
/**
 * Kanvis Video - Repository URL Setter Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const url = process.argv[2];
const placeholder = '<' + 'repository-url' + '>';

const targetFiles = [
  'README.md',
  'README.en.md',
  'docs/launch-copy.md',
  'docs/repository-setup.md',
  'LAUNCH_PLAYBOOK.md'
];

function usage() {
  console.error('Usage: node scripts/set-repository-url.mjs https://github.com/<owner>/kanvis-video');
}

if (!url) {
  usage();
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`Invalid URL: ${url}`);
  process.exit(2);
}

if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
  console.error('Repository URL must be an https://github.com/... URL.');
  process.exit(2);
}

const pathParts = parsed.pathname.split('/').filter(Boolean);
if (pathParts.length !== 2 || pathParts[1] !== 'kanvis-video') {
  console.error('Repository URL should look like https://github.com/<owner>/kanvis-video');
  process.exit(2);
}

let replacements = 0;
const touched = [];

for (const file of targetFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing file: ${file}`);
    process.exit(1);
  }
  const before = fs.readFileSync(full, 'utf8');
  const count = before.split(placeholder).length - 1;
  if (count > 0) {
    fs.writeFileSync(full, before.replaceAll(placeholder, url));
    replacements += count;
    touched.push({ file, replacements: count });
  }
}

console.log(JSON.stringify({
  ok: true,
  repository_url: url,
  replacements,
  files: touched
}, null, 2));
