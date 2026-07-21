#!/usr/bin/env node
/**
 * Kanvis Video - Open Studio Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name) {
  return process.argv.includes(name);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function resolveDirectory(input) {
  const resolved = fs.realpathSync(path.resolve(input));
  if (!fs.statSync(resolved).isDirectory()) fail(`Project directory is not a folder: ${resolved}`);
  return resolved;
}

function relativeInside(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`Studio video must be inside the project directory: ${file}`);
  }
  return relative.replaceAll(path.sep, '/');
}

function readPresenterMode(projectDir) {
  const configFile = path.join(projectDir, 'kanvis-video.config.json');
  if (!fs.existsSync(configFile)) return 'none';
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
  return config.production?.presenter_mode ?? 'none';
}

function studioMode(presenterMode) {
  if (presenterMode === 'avatar') return 'avatar';
  if (presenterMode === 'human') return 'footage';
  return 'animation';
}

const projectDir = resolveDirectory(arg('--project') ?? process.cwd());
const requestedVideo = arg('--video');
const videoFile = requestedVideo
  ? path.resolve(requestedVideo)
  : path.join(projectDir, 'output', 'video.mp4');
const artifactFile = path.join(projectDir, 'visualhyper.artifact.json');
const prepareOnly = flag('--prepare-only');
const forceFlat = flag('--force-flat');
const noBrowser = flag('--no-browser');

let prepared = false;
if ((!fs.existsSync(artifactFile) || forceFlat) && fs.existsSync(videoFile)) {
  if (!fs.statSync(videoFile).isFile()) fail(`Video is not a file: ${videoFile}`);
  const relativeVideo = relativeInside(projectDir, fs.realpathSync(videoFile));
  const now = new Date().toISOString();
  const slug = path.basename(projectDir).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'project';
  const artifact = {
    schemaVersion: '1',
    artifactId: `kanvis-video-${slug}`,
    workflowId: 'kanvis-article-to-video',
    mode: studioMode(readPresenterMode(projectDir)),
    engine: 'hyperframes',
    projectDir: '.',
    sourceRevision: 1,
    editRevision: 0,
    status: 'rendered',
    capabilities: {
      preview: false,
      render: false,
      editableParameters: []
    },
    outputs: [{ kind: 'video', relativePath: relativeVideo, mimeType: 'video/mp4' }],
    editableLayers: [],
    history: [],
    redoStack: [],
    updatedAt: now
  };
  fs.writeFileSync(artifactFile, `${JSON.stringify(artifact, null, 2)}\n`);
  prepared = true;
}

if (requestedVideo && !fs.existsSync(videoFile)) fail(`Video does not exist: ${videoFile}`);

if (prepareOnly) {
  console.log(JSON.stringify({ ok: true, projectDir, artifactFile, prepared }, null, 2));
  process.exit(0);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioCli = path.join(repositoryRoot, 'workbench', 'bin', 'visualhyper.mjs');
const args = [studioCli, 'open', '--project', projectDir];
if (noBrowser) args.push('--no-browser');
const opened = spawnSync(process.execPath, args, {
  cwd: path.join(repositoryRoot, 'workbench'),
  encoding: 'utf8',
  stdio: 'inherit',
  windowsHide: true
});
if (opened.error) throw opened.error;
const exitCode = opened.status ?? 1;
if (exitCode === 0) {
  // 在 JSON 输出之后追加一段人类可读的中文提示，便于 AI 直接转发给最终用户。
  // visualhyper.mjs open 会在 stdout 打印 JSON（包含 url 字段），这里补充友好文案。
  const projectDirDisplay = projectDir;
  const videoDisplay = fs.existsSync(videoFile) ? videoFile : path.join(projectDir, 'output', 'video.mp4');
  console.log('');
  console.log('🎬 Kanvis Studio 已打开');
  console.log(`├── 项目目录: ${projectDirDisplay}`);
  console.log(`└── 视频文件: ${videoDisplay}`);
  console.log('');
  console.log('工作台已在默认浏览器中自动打开。如果浏览器没有弹出，可执行：');
  console.log(`  node ${path.join(repositoryRoot, 'workbench', 'bin', 'visualhyper.mjs')} status --project "${projectDirDisplay}"`);
  console.log('查看当前工作台 URL，然后手动在浏览器中打开。');
  console.log('');
  console.log('在工作台中可以：预览视频 · 切片剪辑 · 字幕微调 · 重新导出。');
}
process.exit(exitCode);
