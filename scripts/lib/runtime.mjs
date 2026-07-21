/**
 * Kanvis Video - Runtime Library
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function detectNvidiaMemoryMb() {
  const result = spawnSync('nvidia-smi', [
    '--query-gpu=memory.total',
    '--format=csv,noheader,nounits'
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  const values = result.stdout
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function detectHardware() {
  const gpuMemoryMb = detectNvidiaMemoryMb();
  const gpuMemoryGb = gpuMemoryMb ? Math.round((gpuMemoryMb / 1024) * 10) / 10 : 0;
  let profile = 'cpu';
  if (gpuMemoryGb >= 18) profile = 'high';
  else if (gpuMemoryGb >= 8) profile = 'standard';
  else if (gpuMemoryGb >= 4) profile = 'preview';

  return {
    profile,
    gpu: gpuMemoryMb ? 'nvidia' : 'not-detected',
    gpu_memory_gb: gpuMemoryGb,
    system_memory_gb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    platform: process.platform,
    arch: process.arch
  };
}

export function recommendRuntime(config, hardware = detectHardware()) {
  const presenterMode = config?.production?.presenter_mode ?? (config?.avatar ? 'avatar' : 'none');
  const requested = config?.runtime?.mode ?? 'auto';
  const cloudAllowed = config?.runtime?.allow_cloud_fallback === true;
  const sourceType = config?.avatar?.source_type;

  if (requested !== 'auto') {
    return { requested, selected: requested, reason: 'explicit runtime selection', hardware };
  }
  if (presenterMode === 'human' || presenterMode === 'none') {
    return { requested, selected: 'local', reason: 'editing and graphics can run locally without avatar generation', hardware };
  }
  if (sourceType === 'performance_lipsync' && ['preview', 'standard', 'high'].includes(hardware.profile)) {
    return { requested, selected: 'local', reason: `local lip sync is suitable for the ${hardware.profile} GPU profile`, hardware };
  }
  if (sourceType === 'generated_avatar' && hardware.profile === 'high') {
    return { requested, selected: 'local', reason: 'high GPU profile can attempt local avatar generation', hardware };
  }
  if (cloudAllowed) {
    return { requested, selected: 'cloud', reason: 'local hardware is below the recommended avatar profile', hardware };
  }
  return { requested, selected: 'mock', reason: 'use a mock preview and export project assets without a paid call', hardware };
}
