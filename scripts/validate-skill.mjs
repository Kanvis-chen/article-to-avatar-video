#!/usr/bin/env node
/**
 * Kanvis Video - Skill Validation Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillFile = path.join(root, 'SKILL.md');
const text = fs.readFileSync(skillFile, 'utf8').replace(/^\uFEFF/, '');
const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
const errors = [];

if (!match) {
  errors.push('SKILL.md must start with YAML frontmatter');
} else {
  const lines = match[1].split(/\r?\n/).filter((line) => line.trim());
  const fields = new Map();
  for (const line of lines) {
    const field = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!field) {
      errors.push(`invalid frontmatter line: ${line}`);
      continue;
    }
    fields.set(field[1], field[2].trim());
  }
  for (const key of fields.keys()) {
    if (!['name', 'description'].includes(key)) errors.push(`unsupported frontmatter field: ${key}`);
  }
  if (fields.get('name') !== 'kanvis-article-to-video') errors.push('name must be kanvis-article-to-video');
  if (!fields.get('description')) errors.push('description is required');
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('Skill is valid: kanvis-article-to-video');
