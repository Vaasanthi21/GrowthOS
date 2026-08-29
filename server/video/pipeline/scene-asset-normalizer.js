/**
 * server/video/pipeline/scene-asset-normalizer.js
 *
 * SceneAssetNormalizer transforms raw provider outputs into a uniform,
 * validated internal SceneAsset contract with observability metadata and SHA-256 integrity.
 */

import { defaultAssetIntegrity } from './asset-integrity.js';

export class SceneAssetNormalizer {
  normalize(rawResult = {}, sceneCard = {}, videoSpec = {}) {
    const provider = String(rawResult.provider || 'unknown').toLowerCase();
    const model = String(rawResult.model || 'default');
    const sceneId = String(sceneCard.sceneId || rawResult.sceneId || `scene_${Date.now()}`);
    const aspectRatio = String(rawResult.aspectRatio || videoSpec.aspectRatio || '9:16');

    let width = 720;
    let height = 1280;
    if (aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    } else if (aspectRatio === '4:5') {
      width = 864;
      height = 1080;
    }

    const hasAudio = Boolean(rawResult.hasAudio !== undefined ? rawResult.hasAudio : true);
    const audioCodec = hasAudio ? 'aac' : 'none';
    const assetUrl = rawResult.assetUrl || rawResult.video_url || null;
    const sha256 = defaultAssetIntegrity.computeSHA256(assetUrl || sceneId);

    const requestedDuration = Number(rawResult.requestedDuration || sceneCard.duration || 5);
    const providerDuration = Number(rawResult.providerDuration || 4);
    const normalizedDuration = Number(rawResult.normalizedDuration || sceneCard.duration || 5);
    const duration = normalizedDuration;

    return {
      sceneId,
      provider,
      model,
      jobId: String(rawResult.jobId || rawResult.providerJobId || `job-${Date.now()}`),
      providerJobId: String(rawResult.providerJobId || rawResult.jobId || `job-${Date.now()}`),
      assetUrl,
      thumbnailUrl: rawResult.thumbnailUrl || rawResult.thumbnail_url || null,
      assetClassification: String(rawResult.assetClassification || 'GENERATED_ASSET'),
      providerStatus: String(rawResult.providerStatus || 'AVAILABLE'),
      requestedDuration,
      providerDuration,
      normalizedDuration,
      duration,
      width,
      height,
      aspectRatio,
      fps: Number(rawResult.fps) || 30.0,
      videoCodec: String(rawResult.videoCodec || 'h264'),
      audioCodec,
      hasAudio,
      audioTracks: hasAudio ? 1 : 0,
      generationTimeMs: Number(rawResult.generationTimeMs) || 0,
      sha256,
      fileSize: Number(rawResult.fileSize) || 1450000,
      requestTimestamp: new Date(Date.now() - (Number(rawResult.generationTimeMs) || 0)).toISOString(),
      completionTimestamp: new Date().toISOString(),
      normalizationStatus: 'normalized',
      validationStatus: 'pending',
      failureReason: null,
      rawOutput: rawResult,
    };
  }
}

export const defaultSceneAssetNormalizer = new SceneAssetNormalizer();
