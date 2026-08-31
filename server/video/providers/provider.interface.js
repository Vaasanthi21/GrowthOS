/**
 * server/video/providers/provider.interface.js
 *
 * Base interface and schema helpers for all Creative OS video providers.
 * Enforces standardized capability schema, provider status states, and response normalization.
 */

export function createProviderCapabilities(custom = {}) {
  return {
    supportsTextToVideo: Boolean(custom.supportsTextToVideo),
    supportsImageToVideo: Boolean(custom.supportsImageToVideo),
    supportsReferenceImages: Boolean(custom.supportsReferenceImages),
    supportsCinematicQuality: Boolean(custom.supportsCinematicQuality),
    supportsPhotorealism: Boolean(custom.supportsPhotorealism),
    supportsExactText: Boolean(custom.supportsExactText),
    supportsLogos: Boolean(custom.supportsLogos),
    supportsGraphics: Boolean(custom.supportsGraphics),
    supportsExistingMedia: Boolean(custom.supportsExistingMedia),
    supportsDeterministicBrand: Boolean(custom.supportsDeterministicBrand),
    supportsAudio: Boolean(custom.supportsAudio),
    supportsAsyncGeneration: Boolean(custom.supportsAsyncGeneration !== undefined ? custom.supportsAsyncGeneration : true),
    supportedAspectRatios: Array.isArray(custom.supportedAspectRatios)
      ? custom.supportedAspectRatios
      : ['9:16', '16:9', '1:1', '4:5'],
    supportedDurations: Array.isArray(custom.supportedDurations)
      ? custom.supportedDurations
      : [4, 5, 8, 10, 12, 15, 20, 30, 60],
    maxDuration: Number(custom.maxDuration) || 60,
    ...custom,
  };
}

export function normalizeProviderResponse(raw = {}) {
  const reqTimeDur = Number(raw.requestedTimelineDuration || raw.requestedDuration || raw.duration || 5);
  const provGenDur = Number(raw.providerGenerationDuration || raw.providerDuration || raw.duration || 4);
  const actAssetDur = (raw.actualAssetDuration !== undefined && raw.actualAssetDuration !== null) ? Number(raw.actualAssetDuration) : null;

  return {
    provider: String(raw.provider || 'unknown').toLowerCase(),
    model: String(raw.model || 'unknown'),
    jobId: String(raw.jobId || raw.providerJobId || `job-${Date.now()}`),
    providerJobId: String(raw.providerJobId || raw.jobId || `job-${Date.now()}`),
    sceneId: String(raw.sceneId || 'scene_01'),
    status: String(raw.status || 'completed').toLowerCase(),
    assetUrl: raw.assetUrl || raw.video_url || null,
    localPath: raw.localPath || raw.rawResponse?.localPath || null,
    thumbnailUrl: raw.thumbnailUrl || raw.thumbnail_url || null,
    assetClassification: String(raw.assetClassification || 'GENERATED_ASSET'),
    providerStatus: String(raw.providerStatus || 'AVAILABLE'),
    requestedTimelineDuration: reqTimeDur,
    providerGenerationDuration: provGenDur,
    actualAssetDuration: actAssetDur,
    requestedDuration: reqTimeDur,
    providerDuration: provGenDur,
    duration: Number(raw.duration) || provGenDur,
    aspectRatio: String(raw.aspectRatio || '9:16'),
    generationTimeMs: Number(raw.generationTimeMs) || 0,
    rawResponse: raw.rawResponse || null,
    error: raw.error || null,
  };
}

export class BaseVideoProvider {
  constructor(name = 'base-provider', model = 'default-model') {
    this.name = name;
    this.model = model;
  }

  getCapabilities() {
    return createProviderCapabilities();
  }

  isAvailable() {
    return true;
  }

  getProviderStatus() {
    return this.isAvailable() ? 'AVAILABLE' : 'NOT_CONFIGURED';
  }

  async generateScene(sceneCard, videoSpec) {
    throw new Error(`generateScene() not implemented on ${this.name}`);
  }

  async getGenerationStatus(jobId) {
    throw new Error(`getGenerationStatus() not implemented on ${this.name}`);
  }

  async downloadResult(assetUrl) {
    throw new Error(`downloadResult() not implemented on ${this.name}`);
  }

  async cancelGeneration(jobId) {
    return { status: 'cancelled', jobId };
  }
}
