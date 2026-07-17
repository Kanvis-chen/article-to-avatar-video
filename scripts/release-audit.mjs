#!/usr/bin/env node
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
  'docs/kanvis-cut-suite.md',
  'docs/production-modes.md',
  'docs/local-runtime.md',
  'docs/release-series.zh-CN.md',
  'docs/open-core-boundary.md',
  'docs/obsidian-workbench-pro.md',
  'docs/jianying-capcut-export.md',
  'docs/star-growth-plan.md',
  'docs/roadmap.md',
  'docs/faq.md',
  'docs/demo-video-script.md',
  'examples/knowledge-video/article.md',
  'examples/knowledge-video/content-brief.json',
  'examples/knowledge-video/scene-plan.json',
  'examples/knowledge-video/kanvis-cut.config.json',
  'examples/modes/human-enhancement.config.json',
  'examples/modes/faceless-visual.config.json',
  'examples/modes/avatar-lipsync.config.json',
  'examples/knowledge-video/kanvis-cut-project.json',
  'examples/knowledge-video/quality-report.example.json',
  'assets/kanvis-cut-project.schema.json',
  'assets/kanvis-cut.config.example.json',
  'assets/social-preview.svg',
  'scripts/set-repository-url.mjs',
  'scripts/detect-runtime.mjs',
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

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`required file missing: ${file}`);
  }
}

if (fs.existsSync(path.join(root, '.git'))) {
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
  { name: 'Bearer token', pattern: new RegExp('Bear' + 'er' + String.raw`\s+[A-Za-z0-9._-]{20,}`, 'i') },
  { name: 'Authorization header', pattern: new RegExp('Author' + 'ization' + String.raw`\s*:\s*[A-Za-z0-9._-]{8,}`, 'i') },
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
  warnings
};

console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
