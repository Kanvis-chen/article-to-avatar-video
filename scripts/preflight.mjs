#!/usr/bin/env node
/**
 * Kanvis Video - Preflight Check Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson, validateConfig } from './lib/config.mjs';
import { detectHardware, recommendRuntime } from './lib/runtime.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const article = arg('--article');
const configFile = arg('--config');
const paid = process.argv.includes('--paid');

if (!article || !configFile) {
  console.error('Usage: node preflight.mjs --article <file> --config <json> [--paid]');
  process.exit(2);
}

const errors = [];
const warnings = [];
let articleText = '';
let config;
let runtimeRecommendation;

if (!fs.existsSync(article) || !fs.statSync(article).isFile()) {
  errors.push(`article does not exist: ${article}`);
} else {
  articleText = fs.readFileSync(article, 'utf8').replace(/^\uFEFF/, '');
  if (!articleText.trim()) errors.push('article is empty');
  if (!['.md', '.txt'].includes(path.extname(article).toLowerCase())) {
    errors.push('article must be a .md or .txt file');
  }
}

try {
  config = readJson(configFile);
  const result = validateConfig(config, { paid });
  config = result.config;
  errors.push(...result.errors);
  warnings.push(...result.warnings);
  if (!result.errors.length) runtimeRecommendation = recommendRuntime(config, detectHardware());
} catch (error) {
  errors.push(error.message);
}

const report = {
  ok: errors.length === 0,
  mode: paid ? 'paid-readiness' : 'structural',
  article: path.resolve(article),
  article_characters: articleText.length,
  config: path.resolve(configFile),
  presenter_mode: config?.production?.presenter_mode,
  runtime: runtimeRecommendation,
  errors,
  warnings
};

console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
