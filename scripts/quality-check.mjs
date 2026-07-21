#!/usr/bin/env node
/**
 * Kanvis Video - Quality Check Script
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const video = arg('--video');
const configFile = arg('--config');
const reportFile = arg('--report');
const visualReview = arg('--visual-review') || 'pending';
const visualNotes = arg('--visual-notes') || '';
if (!video || !configFile || !reportFile) {
  console.error('Usage: node quality-check.mjs --video <mp4> --config <json> --report <json> [--visual-review pending|passed|failed] [--visual-notes <text>]');
  process.exit(2);
}
if (!['pending', 'passed', 'failed'].includes(visualReview)) {
  console.error('--visual-review must be pending, passed, or failed');
  process.exit(2);
}
if (!fs.existsSync(video)) {
  console.error(`Video not found: ${video}`);
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error(probe.stderr || 'ffprobe failed');
  process.exit(2);
}

const media = JSON.parse(probe.stdout);
const videoStream = media.streams.find((s) => s.codec_type === 'video');
const audioStream = media.streams.find((s) => s.codec_type === 'audio');
const duration = Number(media.format?.duration || 0);
const expected = config.publishing || {};
const blockers = [];
const visualBlockers = [];
const warnings = [];

if (!videoStream) blockers.push('missing video stream');
if (!audioStream) blockers.push('missing audio stream');
if (videoStream && expected.width && videoStream.width !== expected.width) blockers.push(`width ${videoStream.width} != ${expected.width}`);
if (videoStream && expected.height && videoStream.height !== expected.height) blockers.push(`height ${videoStream.height} != ${expected.height}`);
if (!duration) blockers.push('duration is missing or zero');
if (expected.max_duration_seconds && duration > expected.max_duration_seconds) blockers.push(`duration ${duration.toFixed(2)}s exceeds ${expected.max_duration_seconds}s`);
if (!config.avatar?.consent_confirmed) blockers.push('avatar consent is not confirmed');
if (!config.voice?.consent_confirmed) blockers.push('voice consent is not confirmed');
if (visualReview === 'failed') visualBlockers.push('visual review failed');

const rate = String(videoStream?.avg_frame_rate || videoStream?.r_frame_rate || '0/1').split('/').map(Number);
const fps = rate[1] ? rate[0] / rate[1] : 0;
if (expected.fps && Math.abs(fps - expected.fps) > 0.1) blockers.push(`fps ${fps.toFixed(3)} != ${expected.fps}`);
if ((media.format?.size || 0) < 100000) warnings.push('file size is unusually small');

const publishReady = blockers.length === 0 && visualBlockers.length === 0 && visualReview === 'passed';
const report = {
  version: 1,
  checked_at: new Date().toISOString(),
  file: path.resolve(video),
  duration_seconds: duration,
  width: videoStream?.width || null,
  height: videoStream?.height || null,
  fps,
  has_audio: Boolean(audioStream),
  automated_blockers: blockers,
  visual_review_blockers: visualBlockers,
  warnings,
  visual_review_status: visualReview,
  visual_review_notes: visualNotes,
  publish_ready: publishReady
};

fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exit(publishReady ? 0 : 1);
