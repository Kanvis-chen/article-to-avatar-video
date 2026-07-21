#!/usr/bin/env node
/**
 * Kanvis Video - Runtime Detection Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import { readJson, validateConfig } from './lib/config.mjs';
import { detectHardware, recommendRuntime } from './lib/runtime.mjs';

const index = process.argv.indexOf('--config');
const configFile = index >= 0 ? process.argv[index + 1] : undefined;
if (!configFile) {
  console.error('Usage: node detect-runtime.mjs --config <json>');
  process.exit(2);
}

try {
  const validation = validateConfig(readJson(configFile));
  if (validation.errors.length) {
    console.error(validation.errors.map((error) => `- ${error}`).join('\n'));
    process.exit(1);
  }
  console.log(JSON.stringify(recommendRuntime(validation.config, detectHardware()), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
