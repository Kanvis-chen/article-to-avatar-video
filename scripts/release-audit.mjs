#!/usr/bin/env node
/**
 * Kanvis Video - Release Audit Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const allowPlaceholders = process.argv.includes('--allow-placeholders');
const repositoryUrlPlaceholder = '<' + 'repository-url' + '>';

const requiredFiles = [
  'README.md',
  'README.en.md',
  'SKILL.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'CHANGELOG.md',
  'LAUNCH_PLAYBOOK.md',
  'docs/repository-setup.md',
  'docs/launch-copy.md',
  'docs/good-first-issues.md',
  'docs/social-preview-brief.md',
  'docs/positioning-vs-talking-head-skills.md',
  'docs/kanvis-video-suite.md',
  'docs/naming-and-launch-modes.md',
  'docs/production-modes.md',
  'docs/local-runtime.md',
  'docs/jianying-capcut-export.md',
  'docs/star-growth-plan.md',
  'docs/roadmap.md',
  'docs/faq.md',
  'docs/demo-video-script.md',
  'examples/knowledge-video/article.md',
  'examples/knowledge-video/content-brief.json',
  'examples/knowledge-video/scene-plan.json',
  'examples/knowledge-video/kanvis-video.config.json',
  'examples/modes/human-enhancement.config.json',
  'examples/modes/faceless-visual.config.json',
  'examples/modes/avatar-lipsync.config.json',
  'examples/knowledge-video/kanvis-video-project.json',
  'examples/knowledge-video/quality-report.example.json',
  'assets/kanvis-video-project.schema.json',
  'assets/kanvis-video.config.example.json',
  'assets/social-preview.svg',
  'assets/workbench-preview.png',
  'scripts/set-repository-url.mjs',
  'scripts/detect-runtime.mjs',
  'scripts/open-studio.mjs',
  'workbench/README.md',
  'workbench/LICENSE',
  'workbench/THIRD_PARTY_NOTICES.md',
  'workbench/package.json',
  'workbench/pnpm-lock.yaml',
  'workbench/packages/ui/src/App.tsx',
  'workbench/packages/ui/src/components/EditorShell.tsx',
  'workbench/packages/ui/src/components/ArtifactCanvas.tsx',
  'workbench/packages/ui/src/components/ArtifactTimeline.tsx',
  'workbench/packages/server/src/panel-server.ts',
  'workbench/skills/kanvis-studio/SKILL.md',
  'workbench/docs/ADR-001-open-source-workbench.md',
  '.github/workflows/ci.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml'
];

const textExtensions = new Set([
  '.md',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.gitignore',
  '.gitattributes'
]);

const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function isTextFile(file) {
  const base = path.basename(file);
  const ext = path.extname(file);
  return textExtensions.has(ext) || textExtensions.has(base);
}

const errors = [];
const warnings = [];

const forbiddenTrackedPaths = [
  { name: 'environment file', pattern: /(^|\/)\.env(?:\.|$)/i },
  { name: 'Kanvis Studio runtime state', pattern: /(^|\/)\.visualhyper\//i },
  { name: 'local agent configuration', pattern: /(^|\/)(?:\.codex|\.claude|\.obsidian)\//i },
  { name: 'credential or session file', pattern: /(^|\/)[^/]*(?:credential|cookie|session|secret)[^/]*\.(?:json|ya?ml|txt)$/i },
  { name: 'private key or credential store', pattern: /\.(?:pem|key|p12|pfx|kdbx|keystore)$/i },
  { name: 'local database', pattern: /\.(?:sqlite3?|db)$/i }
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`required file missing: ${file}`);
  }
}

if (fs.existsSync(path.join(root, '.git'))) {
  const trackedResult = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (trackedResult.status !== 0) {
    errors.push(`could not list tracked files: ${trackedResult.stderr.trim()}`);
  } else {
    const trackedFiles = trackedResult.stdout.split('\0').filter(Boolean);
    for (const trackedFile of trackedFiles) {
      for (const item of forbiddenTrackedPaths) {
        if (item.pattern.test(trackedFile)) errors.push(`${item.name} is tracked by git: ${trackedFile}`);
      }
    }
  }
  for (const file of requiredFiles) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', file], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true
    });
    if (tracked.status !== 0) errors.push(`required file is not tracked by git: ${file}`);
  }
}

let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (packageJson.private === true) {
    errors.push('package.json must not set "private": true for the public release package');
  }
  if (packageJson.license !== 'MIT') {
    errors.push('package.json license must be MIT');
  }
} catch (error) {
  errors.push(`package.json is invalid: ${error.message}`);
}

const forbiddenPatterns = [
  { name: 'OpenAI-style API key', pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI project API key', pattern: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { name: 'Anthropic-style API key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub personal access token', pattern: /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/ },
  { name: 'AWS access key ID', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'Google API key', pattern: /AIza[A-Za-z0-9_-]{30,}/ },
  { name: 'Bearer token', pattern: new RegExp('Bear' + 'er' + String.raw`\s+[A-Za-z0-9._-]{20,}`, 'i') },
  { name: 'Authorization header', pattern: new RegExp(String.raw`\b` + 'Author' + 'ization' + String.raw`\s*:\s*[A-Za-z0-9._-]{8,}`, 'i') },
  { name: 'private key material', pattern: new RegExp('BEGIN' + String.raw`\s+(?:RSA\s+|OPENSSH\s+|EC\s+|DSA\s+)?PRIVATE\s+KEY`) },
  { name: 'Windows user directory', pattern: /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/i },
  { name: 'Unix user directory', pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+\// },
  { name: 'mainland China mobile number', pattern: /(^|\D)1[3-9]\d{9}(\D|$)/ },
  { name: 'mainland China identity number', pattern: /(^|\D)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:[0-2]\d|3[0-1])\d{3}[0-9Xx](\D|$)/ },
  { name: 'email address', pattern: /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i },
  { name: 'competitor proper name', pattern: new RegExp(['Jin' + 'gyi', 'Rich' + 'ael', 'Rach' + 'el'].join('|'), 'i') },
  { name: 'session cookie file reference', pattern: new RegExp(['session_' + 'cookies', 'cookies' + String.raw`\.json`].join('|'), 'i') }
];

const files = walk(root).filter(isTextFile);
for (const file of files) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  const text = fs.readFileSync(file, 'utf8');
  if (!allowPlaceholders && text.includes(repositoryUrlPlaceholder)) {
    errors.push(`repository URL placeholder remains in ${rel}`);
  }
  for (const item of forbiddenPatterns) {
    if (item.pattern.test(text)) {
      errors.push(`${item.name} found in ${rel}`);
    }
  }
}

if (allowPlaceholders) {
  const placeholderFiles = files
    .filter((file) => fs.readFileSync(file, 'utf8').includes(repositoryUrlPlaceholder))
    .map((file) => path.relative(root, file).replaceAll(path.sep, '/'));
  if (placeholderFiles.length) {
    warnings.push(`repository URL placeholders allowed in local mode: ${placeholderFiles.join(', ')}`);
  }
}

const report = {
  ok: errors.length === 0,
  mode: allowPlaceholders ? 'local-prepublish' : 'public-release',
  checked_files: files.length,
  errors,
  warnings,
  reminder: 'Before a public push, also run a full-history secret scanner and inspect image/video metadata.'
};

console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
