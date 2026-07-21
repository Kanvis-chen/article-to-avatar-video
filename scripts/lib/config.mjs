/**
 * Kanvis Video - Config Library
 * Copyright (c) 2026 Kanvis Chen
 * MIT License - https://opensource.org/licenses/MIT
 */
import fs from 'node:fs';

export const PRESENTER_MODES = ['human', 'none', 'avatar'];
export const RUNTIME_MODES = ['auto', 'local', 'cloud', 'mock', 'byo'];

export function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

export function normalizeConfig(config) {
  const normalized = structuredClone(config ?? {});
  normalized.production ??= {};
  normalized.production.presenter_mode ??= normalized.avatar ? 'avatar' : 'none';
  normalized.runtime ??= { mode: 'auto', allow_cloud_fallback: false };
  normalized.runtime.mode ??= 'auto';
  normalized.effects ??= { enabled: true };
  normalized.workbench ??= {};
  normalized.workbench.enabled ??= true;
  normalized.workbench.project_format ??= 'kanvis-video-project';
  normalized.workbench.open_after_render ??= true;
  return normalized;
}

export function validateConfig(input, { paid = false } = {}) {
  const config = normalizeConfig(input);
  const errors = [];
  const warnings = [];
  const production = config.production;
  const publishing = config.publishing;
  const runtime = config.runtime;
  const avatar = config.avatar;
  const human = config.human;
  const voice = config.voice;
  const cost = config.cost;
  const workbench = config.workbench;
  const presenterMode = production?.presenter_mode;

  if (!PRESENTER_MODES.includes(presenterMode)) {
    errors.push(`production.presenter_mode must be one of: ${PRESENTER_MODES.join(', ')}`);
  }
  if (!RUNTIME_MODES.includes(runtime?.mode)) {
    errors.push(`runtime.mode must be one of: ${RUNTIME_MODES.join(', ')}`);
  }
  if (!publishing || typeof publishing !== 'object') errors.push('publishing section is required');
  if (!voice || typeof voice !== 'object') errors.push('voice section is required');
  if (!cost || typeof cost !== 'object') errors.push('cost section is required');

  for (const key of ['width', 'height', 'fps', 'max_duration_seconds']) {
    if (publishing && (!Number.isFinite(publishing[key]) || publishing[key] <= 0)) {
      errors.push(`publishing.${key} must be a positive number`);
    }
  }

  if (publishing?.aspect_ratio && publishing?.width && publishing?.height) {
    const match = String(publishing.aspect_ratio).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) {
      errors.push('publishing.aspect_ratio must look like 9:16, 16:9, or 1:1');
    } else {
      const declared = Number(match[1]) / Number(match[2]);
      const actual = publishing.width / publishing.height;
      if (Math.abs(declared - actual) > 0.01) errors.push('publishing dimensions do not match aspect_ratio');
    }
  }

  const voiceStrategy = voice?.strategy ?? 'clone';
  if (!['original', 'tts', 'clone'].includes(voiceStrategy)) {
    errors.push('voice.strategy must be original, tts, or clone');
  }
  if (voiceStrategy !== 'original' && (typeof voice?.provider !== 'string' || !voice.provider.trim())) {
    errors.push('voice.provider is required for tts or clone voice strategies');
  }

  if (presenterMode === 'human') {
    if (!human || typeof human !== 'object') errors.push('human section is required in human presenter mode');
    if (!human?.source_video) warnings.push('human.source_video is not configured');
  }

  if (presenterMode === 'avatar') {
    if (!avatar || typeof avatar !== 'object') {
      errors.push('avatar section is required in avatar presenter mode');
    } else {
      if (!['generated_avatar', 'performance_lipsync'].includes(avatar.source_type)) {
        errors.push('avatar.source_type must be generated_avatar or performance_lipsync');
      }
      if (typeof avatar.provider !== 'string' || !avatar.provider.trim()) {
        errors.push('avatar.provider is required in avatar presenter mode');
      }
      if (avatar.source_type === 'performance_lipsync' && !avatar.source_video) {
        warnings.push('avatar.source_video is not configured for performance_lipsync');
      }
    }
  }

  const paidPolicy = cost?.paid_calls;
  if (cost && !['auto', 'confirm', 'off'].includes(paidPolicy)) {
    errors.push('cost.paid_calls must be auto, confirm, or off');
  }
  if (Number.isFinite(cost?.cost_limit_per_video) && cost.cost_limit_per_video < 0) {
    errors.push('cost.cost_limit_per_video must not be negative');
  }
  if (typeof workbench?.enabled !== 'boolean') {
    errors.push('workbench.enabled must be a boolean');
  }
  if (typeof workbench?.open_after_render !== 'boolean') {
    errors.push('workbench.open_after_render must be a boolean');
  }
  if (workbench?.project_format !== 'kanvis-video-project') {
    errors.push('workbench.project_format must be kanvis-video-project');
  }

  const placeholder = (value) => !value || String(value).includes('REPLACE_ME');
  const usesExternalVoice = voiceStrategy !== 'original' && !['local', 'mock', 'off'].includes(voice?.provider);
  const usesExternalAvatar = presenterMode === 'avatar' && !['local', 'mock', 'off', 'musetalk', 'latentsync'].includes(avatar?.provider);

  if (paid) {
    if (presenterMode === 'human' && !human?.consent_confirmed) {
      errors.push('human performance consent must be confirmed before paid generation');
    }
    if (presenterMode === 'avatar' && !avatar?.consent_confirmed) {
      errors.push('avatar consent must be confirmed before paid generation');
    }
    if (voiceStrategy !== 'original' && !voice?.consent_confirmed) {
      errors.push('voice consent must be confirmed before paid generation');
    }
    if (usesExternalAvatar && placeholder(avatar?.avatar_id)) {
      errors.push('avatar.avatar_id must be configured before paid external generation');
    }
    if (usesExternalVoice && placeholder(voice?.voice_id)) {
      errors.push('voice.voice_id must be configured before paid external generation');
    }
    if ((usesExternalAvatar || usesExternalVoice || runtime?.mode === 'cloud') && paidPolicy === 'off') {
      errors.push('cost.paid_calls is off');
    }
  } else {
    if (presenterMode === 'human' && !human?.consent_confirmed) warnings.push('human performance consent is not confirmed');
    if (presenterMode === 'avatar' && !avatar?.consent_confirmed) warnings.push('avatar consent is not confirmed');
    if (voiceStrategy !== 'original' && !voice?.consent_confirmed) warnings.push('voice consent is not confirmed');
    if (usesExternalAvatar && placeholder(avatar?.avatar_id)) warnings.push('avatar.avatar_id is still a placeholder');
    if (usesExternalVoice && placeholder(voice?.voice_id)) warnings.push('voice.voice_id is still a placeholder');
  }

  return { config, errors, warnings };
}
