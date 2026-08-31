/**
 * server/video/providers/sora/sora-provider.js
 *
 * Sora-2 Provider Adapter isolating Azure OpenAI Sora video rendering logic.
 * Azure OpenAI Sora API official supported durations: '4', '8', '12' seconds.
 */

import fs from 'fs';
import path from 'path';
import { BaseVideoProvider, createProviderCapabilities, normalizeProviderResponse } from '../provider.interface.js';
import { defaultScenePromptBuilder } from '../../scene/scene-prompt-builder.js';
import featureFlags from '../../../config/feature-flags.js';

export function normalizeSoraSeconds(requestedDuration) {
  const req = Number(requestedDuration) || 5;
  if (req <= 4) return '4';
  if (req <= 8) return '8';
  return '12';
}

async function executeDirectAzureSora({ prompt, durationSeconds = 8, aspectRatio = '9:16' }) {
  const videoApiKey = process.env.AZURE_OPENAI_VIDEO_API_KEY;
  const videoEndpoint = process.env.AZURE_OPENAI_VIDEO_ENDPOINT;
  const azureVideoModel = process.env.AZURE_OPENAI_VIDEO_MODEL || 'sora-2';
  const normalizedDurationSeconds = normalizeSoraSeconds(durationSeconds);

  const aspectRatioToSoraSize = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '720x720',
    '4:5': '864x1080',
  };
  const soraSize = aspectRatioToSoraSize[aspectRatio] || '720x1280';

  const baseUrl = String(videoEndpoint || '').replace(/\/+$/, '');
  const requestBody = {
    model: azureVideoModel,
    prompt,
    seconds: normalizedDurationSeconds,
    size: soraSize,
  };

  const requestVideo = async (body) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': videoApiKey,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  let { response, data } = await requestVideo(requestBody);

  let retry429Count = 0;
  while (!response.ok && (response.status === 429 || /too many running tasks|rate limit/i.test(String(data?.error?.message || data?.message || ''))) && retry429Count < 6) {
    retry429Count++;
    const waitSec = retry429Count * 5;
    await new Promise(r => setTimeout(r, waitSec * 1000));
    ({ response, data } = await requestVideo(requestBody));
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Azure Sora API error: ${response.status} ${response.statusText}`);
  }

  const initialStatusUrl = response.headers.get('operation-location') || response.headers.get('Operation-Location') || `${baseUrl}/${encodeURIComponent(data.id || data.video_id || '')}`;
  const videoId = data.id || data.video_id || `sora_${Date.now()}`;

  const pollTimeoutMs = Number(process.env.AZURE_OPENAI_VIDEO_POLL_TIMEOUT_MS || 600000);
  const startedAt = Date.now();
  let completed = false;

  while (Date.now() - startedAt < pollTimeoutMs) {
    await new Promise(r => setTimeout(r, 2500));
    const statusRes = await fetch(initialStatusUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'api-key': videoApiKey },
    });
    const statusData = await statusRes.json().catch(() => ({}));
    const rawStatus = String(statusData?.status || statusData?.state || '').toLowerCase();

    if (['succeeded', 'completed', 'success', 'done'].includes(rawStatus)) {
      completed = true;
      break;
    }
    if (['failed', 'error', 'cancelled', 'rejected'].includes(rawStatus)) {
      throw new Error(statusData?.error?.message || statusData?.message || 'Azure Sora generation failed');
    }
  }

  if (!completed) {
    throw new Error('Azure Sora video generation timed out');
  }

  const contentUrl = `${baseUrl}/${encodeURIComponent(videoId)}/content`;
  let dlRes = await fetch(contentUrl, { headers: { 'api-key': videoApiKey } });
  if (!dlRes.ok) {
    const fallbackDl = `${baseUrl}/${encodeURIComponent(videoId)}/content?variant=video`;
    dlRes = await fetch(fallbackDl, { headers: { 'api-key': videoApiKey } });
  }

  if (!dlRes.ok) {
    throw new Error(`Failed to download Azure Sora video content (${dlRes.status})`);
  }

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const tempDir = path.resolve(process.cwd(), 'server/temp/composition');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const localFileName = `sora_direct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`;
  const localPath = path.join(tempDir, localFileName);
  fs.writeFileSync(localPath, buffer);

  return {
    video_id: videoId,
    video_url: `https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/${localFileName}`,
    localPath,
    status: 'completed',
  };
}

export class SoraVideoProvider extends BaseVideoProvider {
  constructor(generateFn = null) {
    super('sora', 'sora-2');
    this.generateFn = generateFn;
  }

  setGenerateFn(fn) {
    this.generateFn = fn;
  }

  getCapabilities() {
    return createProviderCapabilities({
      supportsTextToVideo: true,
      supportsImageToVideo: false,
      supportsReferenceImages: false,
      supportsCinematicQuality: true,
      supportsPhotorealism: true,
      supportsExactText: false,
      supportsLogos: false,
      supportsGraphics: false,
      supportsExistingMedia: false,
      supportsDeterministicBrand: false,
      supportsAudio: false,
      supportsAsyncGeneration: true,
      supportedAspectRatios: ['9:16', '16:9', '1:1', '4:5'],
      supportedDurations: [4, 8, 12],
      maxDuration: 12,
    });
  }

  isAvailable() {
    const hasCreds = Boolean(process.env.AZURE_OPENAI_VIDEO_API_KEY && process.env.AZURE_OPENAI_VIDEO_ENDPOINT);
    const hasGenerateFn = typeof this.generateFn === 'function';
    return Boolean(featureFlags.SORA_ENABLED && (hasCreds || hasGenerateFn || featureFlags.SIMULATION_MODE_ENABLED));
  }

  getProviderStatus() {
    const hasCreds = Boolean(process.env.AZURE_OPENAI_VIDEO_API_KEY && process.env.AZURE_OPENAI_VIDEO_ENDPOINT);
    if (!featureFlags.SORA_ENABLED) return 'DISABLED';
    if (hasCreds) return 'LIVE_VERIFIED';
    if (featureFlags.SIMULATION_MODE_ENABLED) return 'DEV_ONLY';
    return 'NOT_CONFIGURED';
  }

  async generateScene(sceneCard = {}, videoSpec = {}) {
    const hasCreds = Boolean(process.env.AZURE_OPENAI_VIDEO_API_KEY && process.env.AZURE_OPENAI_VIDEO_ENDPOINT);
    const hasGenerateFn = typeof this.generateFn === 'function';

    if (!hasCreds && !hasGenerateFn && !featureFlags.SIMULATION_MODE_ENABLED) {
      throw new Error('PROVIDER_CONFIGURATION_ERROR: Azure OpenAI Sora API credentials (AZURE_OPENAI_VIDEO_API_KEY / AZURE_OPENAI_VIDEO_ENDPOINT) are missing and SIMULATION_MODE_ENABLED is false.');
    }

    const sceneOrder = Number(sceneCard.order || 1);
    const totalScenes = Array.isArray(videoSpec.scenes) && videoSpec.scenes.length > 0
      ? videoSpec.scenes.length
      : (videoSpec.targetSceneCount || (videoSpec.duration ? Math.ceil(Number(videoSpec.duration) / 10) : 3));
    const prompt = defaultScenePromptBuilder.buildSceneGenerationPrompt(sceneCard, videoSpec, sceneOrder - 1, totalScenes);
    const requestedTimelineDuration = Number(sceneCard.requestedTimelineDuration || sceneCard.duration || 5);
    const providerGenerationDuration = Number(sceneCard.providerGenerationDuration || normalizeSoraSeconds(requestedTimelineDuration));
    const aspectRatio = String(videoSpec.aspectRatio || '9:16');
    const startTime = Date.now();

    if (hasGenerateFn) {
      const result = await this.generateFn({
        prompt,
        durationSeconds: providerGenerationDuration,
        aspectRatio,
        logoUrl: videoSpec.brandContext?.logoUrl || '',
        logoPlacement: videoSpec.brandContext?.logoPlacement || 'none',
      });

      return normalizeProviderResponse({
        provider: this.name,
        model: this.model,
        jobId: result.video_id || `sora-job-${Date.now()}`,
        providerJobId: result.video_id || `sora-job-${Date.now()}`,
        sceneId: sceneCard.sceneId || 'scene_01',
        status: result.status || 'completed',
        assetUrl: result.video_url || null,
        localPath: result.localPath || null,
        thumbnailUrl: result.thumbnail_url || null,
        assetClassification: 'GENERATED_ASSET',
        providerStatus: 'LIVE_VERIFIED',
        requestedTimelineDuration,
        providerGenerationDuration,
        requestedDuration: requestedTimelineDuration,
        providerDuration: providerGenerationDuration,
        duration: providerGenerationDuration,
        actualAssetDuration: null,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
        rawResponse: result,
      });
    }

    if (hasCreds) {
      const result = await executeDirectAzureSora({
        prompt,
        durationSeconds: providerGenerationDuration,
        aspectRatio,
      });

      return normalizeProviderResponse({
        provider: this.name,
        model: this.model,
        jobId: result.video_id || `sora-job-${Date.now()}`,
        providerJobId: result.video_id || `sora-job-${Date.now()}`,
        sceneId: sceneCard.sceneId || 'scene_01',
        status: result.status || 'completed',
        assetUrl: result.video_url || null,
        localPath: result.localPath || null,
        thumbnailUrl: result.thumbnail_url || null,
        assetClassification: 'GENERATED_ASSET',
        providerStatus: 'LIVE_VERIFIED',
        requestedTimelineDuration,
        providerGenerationDuration,
        requestedDuration: requestedTimelineDuration,
        providerDuration: providerGenerationDuration,
        duration: providerGenerationDuration,
        actualAssetDuration: null,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
        rawResponse: result,
      });
    }

    if (featureFlags.SIMULATION_MODE_ENABLED) {
      return normalizeProviderResponse({
        provider: 'simulation',
        model: 'simulation-v1',
        jobId: `sim-job-${Date.now()}`,
        providerJobId: `sim-job-${Date.now()}`,
        sceneId: sceneCard.sceneId || 'scene_01',
        status: 'completed',
        assetUrl: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/sample-video-demo.mp4',
        assetClassification: 'SIMULATION_ASSET',
        providerStatus: 'DEV_ONLY',
        requestedTimelineDuration,
        providerGenerationDuration,
        requestedDuration: requestedTimelineDuration,
        providerDuration: providerGenerationDuration,
        duration: requestedTimelineDuration,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
      });
    }

    throw new Error('PROVIDER_CONFIGURATION_ERROR: Sora provider cannot execute without valid live Azure OpenAI credentials.');
  }

  async getGenerationStatus(jobId) {
    return { provider: this.name, jobId, status: 'completed' };
  }

  async getGeneratedAsset(jobId) {
    return { provider: this.name, jobId, status: 'completed', assetUrl: null };
  }

  async cancelGeneration(jobId) {
    return { provider: this.name, jobId, status: 'cancelled' };
  }
}

export const defaultSoraProvider = new SoraVideoProvider();
