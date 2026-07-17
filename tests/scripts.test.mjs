import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../scripts/lib/config.mjs';
import { recommendRuntime } from '../scripts/lib/runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runNode(script, args = []) {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8'
  });
}

function commandExists(command) {
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

test('privacy-safe example passes preflight and scene validation', () => {
  const preflight = runNode('scripts/preflight.mjs', [
    '--article', 'examples/knowledge-video/article.md',
    '--config', 'examples/knowledge-video/kanvis-cut.config.json'
  ]);
  assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);
  assert.equal(JSON.parse(preflight.stdout).ok, true);

  const scenePlan = runNode('scripts/validate-scene-plan.mjs', [
    'examples/knowledge-video/scene-plan.json'
  ]);
  assert.equal(scenePlan.status, 0, scenePlan.stderr || scenePlan.stdout);
  assert.match(scenePlan.stdout, /OK: 6 scenes/);
});

test('paid preflight refuses a config with paid calls disabled', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'article-avatar-paid-'));
  try {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'assets/avatar-video.config.example.json')));
    source.runtime.mode = 'cloud';
    source.avatar.provider = 'heygen';
    source.avatar.avatar_id = 'authorized-test-avatar';
    source.avatar.consent_confirmed = true;
    source.voice.provider = 'heygen';
    source.voice.voice_id = 'authorized-test-voice';
    source.voice.consent_confirmed = true;
    source.cost.paid_calls = 'off';
    const config = path.join(temp, 'config.json');
    fs.writeFileSync(config, JSON.stringify(source));
    const result = runNode('scripts/preflight.mjs', [
      '--article', 'examples/knowledge-video/article.md',
      '--config', config,
      '--paid'
    ]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.ok(report.errors.includes('cost.paid_calls is off'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('three presenter modes share one validated production contract', () => {
  for (const file of [
    'examples/modes/human-enhancement.config.json',
    'examples/modes/faceless-visual.config.json',
    'examples/modes/avatar-lipsync.config.json'
  ]) {
    const config = JSON.parse(fs.readFileSync(path.join(root, file)));
    const validation = validateConfig(config);
    assert.deepEqual(validation.errors, [], file);
  }
});

test('auto runtime falls back without forcing paid cloud generation', () => {
  const config = {
    production: { presenter_mode: 'avatar' },
    runtime: { mode: 'auto', allow_cloud_fallback: false },
    avatar: { source_type: 'performance_lipsync' }
  };
  const cpu = { profile: 'cpu', gpu: 'not-detected', gpu_memory_gb: 0 };
  assert.equal(recommendRuntime(config, cpu).selected, 'mock');

  config.runtime.allow_cloud_fallback = true;
  assert.equal(recommendRuntime(config, cpu).selected, 'cloud');
});

test('invalid scene plans fail with actionable errors', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'article-avatar-scene-'));
  try {
    const file = path.join(temp, 'invalid.json');
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      target_duration_seconds: 5,
      scenes: [{
        id: 'scene-01',
        purpose: 'hook',
        voiceover: 'REPLACE_ME',
        visual_role: 'unknown',
        graphic_type: 'hero',
        avatar_layout: 'center',
        source_refs: [],
        estimated_seconds: 8
      }]
    }));
    const result = runNode('scripts/validate-scene-plan.mjs', [file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /visual_role is invalid/);
    assert.match(result.stderr, /source_refs must identify source support/);
    assert.match(result.stderr, /contains a placeholder/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('project initialization is deterministic and protects existing work', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'article-avatar-init-'));
  try {
    const out = path.join(temp, 'project');
    const args = [
      '--article', 'examples/knowledge-video/article.md',
      '--config', 'examples/knowledge-video/kanvis-cut.config.json',
      '--out', out
    ];
    const first = runNode('scripts/init-project.mjs', args);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'project.json'), 'utf8'));
    assert.equal(manifest.status, 'initialized');
    assert.equal(manifest.presenter_mode, 'none');
    assert.ok(manifest.runtime.selected);
    assert.match(manifest.source_sha256, /^[a-f0-9]{64}$/);
    assert.ok(fs.existsSync(path.join(out, 'input', 'source.md')));
    assert.ok(fs.existsSync(path.join(out, 'kanvis-cut.config.json')));

    const second = runNode('scripts/init-project.mjs', args);
    assert.equal(second.status, 2);
    assert.match(second.stderr, /already exists/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('repository URL helper replaces placeholders only for the expected repo', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'article-avatar-url-'));
  try {
    const repositoryPlaceholder = '<' + 'repository-url' + '>';
    fs.mkdirSync(path.join(temp, 'docs'));
    fs.mkdirSync(path.join(temp, 'scripts'));
    for (const file of [
      'README.md',
      'README.en.md',
      'LAUNCH_PLAYBOOK.md',
      'docs/launch-copy.md',
      'docs/repository-setup.md'
    ]) {
      const full = path.join(temp, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `clone ${repositoryPlaceholder}\n`);
    }
    fs.copyFileSync(
      path.join(root, 'scripts/set-repository-url.mjs'),
      path.join(temp, 'scripts/set-repository-url.mjs')
    );

    const bad = spawnSync(process.execPath, [
      path.join(temp, 'scripts/set-repository-url.mjs'),
      'https://github.com/example/wrong-name'
    ], { cwd: temp, encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /article-to-avatar-video/);

    const good = spawnSync(process.execPath, [
      path.join(temp, 'scripts/set-repository-url.mjs'),
      'https://github.com/example/article-to-avatar-video'
    ], { cwd: temp, encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr || good.stdout);
    const report = JSON.parse(good.stdout);
    assert.equal(report.replacements, 5);

    for (const file of [
      'README.md',
      'README.en.md',
      'LAUNCH_PLAYBOOK.md',
      'docs/launch-copy.md',
      'docs/repository-setup.md'
    ]) {
      const text = fs.readFileSync(path.join(temp, file), 'utf8');
      assert.match(text, /https:\/\/github\.com\/example\/article-to-avatar-video/);
      assert.equal(text.includes(repositoryPlaceholder), false);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('quality gate requires both media checks and visual approval', (t) => {
  if (!commandExists('ffmpeg') || !commandExists('ffprobe')) {
    t.skip('ffmpeg and ffprobe are required for the media gate test');
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'article-avatar-quality-'));
  try {
    const video = path.join(temp, 'sample.mp4');
    const config = path.join(temp, 'config.json');
    const pendingReport = path.join(temp, 'pending.json');
    const passedReport = path.join(temp, 'passed.json');
    fs.writeFileSync(config, JSON.stringify({
      publishing: { width: 320, height: 240, fps: 24, max_duration_seconds: 2 },
      avatar: { consent_confirmed: true },
      voice: { consent_confirmed: true }
    }));

    const generated = spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
      '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', video
    ], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);

    const pending = runNode('scripts/quality-check.mjs', [
      '--video', video, '--config', config, '--report', pendingReport
    ]);
    assert.equal(pending.status, 1);
    assert.equal(JSON.parse(fs.readFileSync(pendingReport)).publish_ready, false);

    const passed = runNode('scripts/quality-check.mjs', [
      '--video', video,
      '--config', config,
      '--report', passedReport,
      '--visual-review', 'passed'
    ]);
    assert.equal(passed.status, 0, passed.stderr || passed.stdout);
    const report = JSON.parse(fs.readFileSync(passedReport));
    assert.deepEqual(report.automated_blockers, []);
    assert.equal(report.visual_review_status, 'passed');
    assert.equal(report.publish_ready, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
