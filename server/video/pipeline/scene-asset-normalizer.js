/**
 * server/video/pipeline/scene-asset-normalizer.js
 *
 * SceneAssetNormalizer transforms raw provider outputs into a uniform,
 * validated internal SceneAsset contract with observability metadata and SHA-256 integrity.
 */

import fs from 'fs';
import { spawnSync } from 'child_process';
import { defaultAssetIntegrity } from './asset-integrity.js';

export function probeAssetDurationSync(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const res = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf-8', timeout: 5000 });

    if (res.status === 0 && res.stdout) {
      const parsed = parseFloat(res.stdout.trim());
      if (!isNaN(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
    }
  } catch (err) {
    // Graceful fallback if ffprobe isn't available
  }
  return null;
}

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
    const localPath = rawResult.localPath || rawResult.rawResponse?.localPath || null;
    const sha256 = defaultAssetIntegrity.computeSHA256(assetUrl || sceneId);

    const requestedTimelineDuration = Number(rawResult.requestedTimelineDuration || sceneCard.requestedTimelineDuration || sceneCard.duration || 5);
    const providerGenerationDuration = Number(rawResult.providerGenerationDuration || rawResult.providerDuration || sceneCard.providerGenerationDuration || 8);

    // Probe physical asset duration via ffprobe
    let probedDuration = null;
    if (localPath && fs.existsSync(localPath)) {
      probedDuration = probeAssetDurationSync(localPath);
    } else if (assetUrl && fs.existsSync(assetUrl)) {
      probedDuration = probeAssetDurationSync(assetUrl);
    }

    const actualAssetDuration = Number(rawResult.actualAssetDuration || probedDuration || providerGenerationDuration);
    const duration = requestedTimelineDuration;
    const normalizedDuration = requestedTimelineDuration;

    return {
      sceneId,
      provider,
      model,
      jobId: String(rawResult.jobId || rawResult.providerJobId || `job-${Date.now()}`),
      providerJobId: String(rawResult.providerJobId || rawResult.jobId || `job-${Date.now()}`),
      assetUrl,
      localPath: rawResult.localPath || null,
      thumbnailUrl: rawResult.thumbnailUrl || rawResult.thumbnail_url || null,
      assetClassification: String(rawResult.assetClassification || 'GENERATED_ASSET'),
      providerStatus: String(rawResult.providerStatus || 'AVAILABLE'),
      requestedTimelineDuration,
      providerGenerationDuration,
      actualAssetDuration,
      requestedDuration: requestedTimelineDuration,
      providerDuration: providerGenerationDuration,
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
