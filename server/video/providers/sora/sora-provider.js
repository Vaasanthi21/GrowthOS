/**
 * server/video/providers/sora/sora-provider.js
 *
 * Sora-2 Provider Adapter isolating Azure OpenAI Sora video rendering logic.
 * Azure OpenAI Sora API official supported durations: '4', '8', '12' seconds.
 */

import { BaseVideoProvider, createProviderCapabilities, normalizeProviderResponse } from '../provider.interface.js';
import { defaultScenePromptBuilder } from '../../scene/scene-prompt-builder.js';
import featureFlags from '../../../config/feature-flags.js';

export function normalizeSoraSeconds(requestedDuration) {
  const req = Number(requestedDuration) || 5;
  if (req <= 4) return '4';
  if (req <= 8) return '8';
  return '12';
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
    const hasCredsOrFn = (typeof this.generateFn === 'function') || Boolean(process.env.AZURE_OPENAI_VIDEO_API_KEY && process.env.AZURE_OPENAI_VIDEO_ENDPOINT);

    if (!hasCredsOrFn && !featureFlags.SIMULATION_MODE_ENABLED) {
      throw new Error('PROVIDER_CONFIGURATION_ERROR: Azure OpenAI Sora API credentials (AZURE_OPENAI_VIDEO_API_KEY / AZURE_OPENAI_VIDEO_ENDPOINT) are missing and SIMULATION_MODE_ENABLED is false.');
    }

    const sceneOrder = Number(sceneCard.order || 1);
    const totalScenes = Array.isArray(videoSpec.scenes) && videoSpec.scenes.length > 0
      ? videoSpec.scenes.length
      : (videoSpec.targetSceneCount || (videoSpec.duration ? Math.ceil(Number(videoSpec.duration) / 10) : 3));
    const prompt = defaultScenePromptBuilder.buildSceneGenerationPrompt(sceneCard, videoSpec, sceneOrder - 1, totalScenes);
    const requestedDuration = Number(sceneCard.duration || 5);
    const durationSeconds = normalizeSoraSeconds(requestedDuration);
    const providerDuration = Number(durationSeconds);
    const aspectRatio = String(videoSpec.aspectRatio || '9:16');
    const startTime = Date.now();

    if (typeof this.generateFn === 'function' && hasCredsOrFn) {
      const result = await this.generateFn({
        prompt,
        durationSeconds: providerDuration,
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
        thumbnailUrl: result.thumbnail_url || null,
        assetClassification: 'GENERATED_ASSET',
        providerStatus: 'LIVE_VERIFIED',
        requestedDuration,
        providerDuration,
        duration: providerDuration,
        normalizedDuration: providerDuration,
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
        duration: requestedDuration,
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
