#!/usr/bin/env node
/**
 * Kanvis Video - Project Initialization Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, validateConfig } from './lib/config.mjs';
import { detectHardware, recommendRuntime } from './lib/runtime.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const article = arg('--article');
const out = arg('--out');
const config = arg('--config');
const force = process.argv.includes('--force');
if (!article || !out || !config) {
  console.error('Usage: node init-project.mjs --article <file> --out <dir> --config <json> [--force]');
  process.exit(2);
}

for (const file of [article, config]) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.error(`Missing input file: ${file}`);
    process.exit(2);
  }
}

const articleText = fs.readFileSync(article, 'utf8').replace(/^\uFEFF/, '');
const parsedConfig = readJson(config);
if (!articleText.trim()) throw new Error('Article is empty.');
const validation = validateConfig(parsedConfig);
if (validation.errors.length) {
  throw new Error(`Invalid config:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
}
const normalizedConfig = validation.config;
const runtimeRecommendation = recommendRuntime(normalizedConfig, detectHardware());

const manifestFile = path.join(out, 'project.json');
if (fs.existsSync(manifestFile) && !force) {
  console.error(`${manifestFile} already exists; pass --force to replace the initialized project files.`);
  process.exit(2);
}

for (const dir of ['input', 'work', 'public', 'output']) {
  fs.mkdirSync(path.join(out, dir), { recursive: true });
}
fs.writeFileSync(path.join(out, 'input', 'source.md'), articleText);
fs.writeFileSync(
  path.join(out, 'kanvis-video.config.json'),
  `${JSON.stringify(normalizedConfig, null, 2)}\n`
);

const manifest = {
  version: 1,
  created_at: new Date().toISOString(),
  source_file: path.resolve(article),
  source_sha256: crypto.createHash('sha256').update(articleText).digest('hex'),
  presenter_mode: normalizedConfig.production.presenter_mode,
  runtime: runtimeRecommendation,
  status: 'initialized',
  stages: {}
};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(path.resolve(out));
