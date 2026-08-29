/**
 * server/video/jobs/job-orchestrator.service.js
 *
 * Job Orchestrator managing VideoSpec, Storyboard, Scene-Level Provider Execution,
 * Two-Stage Media Router, Scene Asset Normalization/Validation, SHA-256 Integrity,
 * and strict Production Safety Net.
 */

import { defaultMediaRouter } from '../router/media-router.service.js';
import { defaultProviderRegistry } from '../providers/provider-registry.js';
import { defaultSceneAssetNormalizer } from '../pipeline/scene-asset-normalizer.js';
import { defaultSceneAssetValidator } from '../pipeline/scene-asset-validator.js';
import { defaultAssetIntegrity } from '../pipeline/asset-integrity.js';
import { defaultCompositionEngine } from '../pipeline/composition-engine.js';
import { defaultFinalVideoValidator } from '../pipeline/final-video-validator.js';
import featureFlags from '../../config/feature-flags.js';

export class JobOrchestratorService {
  mapToFrontendStatus(internalState) {
    const statusMap = {
      CREATED: 'queued',
      PLANNING: 'queued',
      STORYBOARD_READY: 'processing',
      GENERATING: 'processing',
      PROCESSING: 'processing',
      COMPLETED: 'completed',
      FAILED: 'failed',
    };
    return statusMap[internalState] || 'processing';
  }

  buildDbUpdatePayload({ internalState, phase, progress, videoSpec = null, storyboard = null, scenes = null, composition = null, result = null, error = null }) {
    const payload = {
      internal_state: internalState,
      status: this.mapToFrontendStatus(internalState),
      phase: phase || 'Processing video generation job',
      updated_at: new Date().toISOString(),
    };

    if (progress !== undefined && progress !== null) payload.progress = progress;
    if (videoSpec) payload.video_spec = videoSpec;
    if (storyboard) payload.storyboard = storyboard;
    if (scenes) payload.scenes = scenes;
    if (composition) payload.composition = composition;
    if (result) {
      if (result.video_url) payload.video_url = result.video_url;
      if (result.thumbnail_url) payload.thumbnail_url = result.thumbnail_url;
    }
    if (error) {
      payload.error = typeof error === 'string' ? error : error.message || 'Job execution failed';
    }

    return payload;
  }

  /**
   * Executes scene-level generation pipeline across storyboard scenes.
   */
  async executeSceneLevelPipeline({ videoSpec, storyboard, jobId, onStatus }) {
    if (!featureFlags.SCENE_LEVEL_GENERATION_ENABLED) {
      console.log(`[JOB ORCHESTRATOR] Scene-level generation disabled, skipping to master fallback for ${jobId}`);
      return { fallbackToMaster: true };
    }

    console.log(`[JOB ORCHESTRATOR] Starting parallel scene-level generation pipeline for job ${jobId}...`);
    const rawNormalizedAssets = new Array(storyboard.length);
    const scenesTracking = new Array(storyboard.length);
    let completedCount = 0;
    let fallbackTriggered = null;

    onStatus?.({
      status: 'processing',
      phase: `Planning ${storyboard.length} storyboard scene clips (Budget: ${videoSpec.duration || 15}s total)`,
      progress: 10,
    });

    const processSingleScene = async (i) => {
      if (fallbackTriggered) return;
      const scene = storyboard[i];
      const sceneId = scene.sceneId || `scene_${i + 1}`;

      console.log(`[SCENE_START] ${sceneId}`);

      let decision;
      try {
        decision = defaultMediaRouter.routeScene(scene, videoSpec);
        console.log(`[ROUTER_DECISION] ${sceneId} provider=${decision.selectedProvider} model=${decision.selectedModel}`);
      } catch (routerErr) {
        console.warn(`[ROUTER ERROR] Scene ${sceneId} routing failed: ${routerErr.message}`);
        fallbackTriggered = routerErr.message;
        return;
      }

      let providerInstance = defaultProviderRegistry.getProvider(decision.selectedProvider);

      let retryCount = 0;
      let rawResult = null;
      let normalizedAsset = null;
      let validation = { valid: false };

      while (retryCount <= 3 && !validation.valid && !fallbackTriggered) {
        try {
          if (!providerInstance || !providerInstance.isAvailable()) {
            throw new Error(`Provider ${decision.selectedProvider} unavailable`);
          }

          if (decision.selectedProvider === 'sora') {
            console.log(`[SORA_SUBMIT] ${sceneId} provider=sora model=sora-2 prompt="${(scene.visualDescription || '').slice(0, 60)}..."`);
          } else if (decision.selectedProvider === 'veo') {
            console.log(`[VEO_SUBMIT] ${sceneId} provider=veo model=veo-2.0-generate-001 prompt="${(scene.visualDescription || '').slice(0, 60)}..."`);
          }

          rawResult = await providerInstance.generateScene(scene, videoSpec);

          if (decision.selectedProvider === 'sora') {
            console.log(`[SORA_COMPLETE] ${sceneId} providerJobId=${rawResult.providerJobId || rawResult.jobId}`);
            console.log(`[ASSET_DOWNLOADED] ${sceneId} url=${rawResult.assetUrl || rawResult.video_url}`);
          } else if (decision.selectedProvider === 'veo') {
            console.log(`[VEO_COMPLETE] ${sceneId} providerJobId=${rawResult.providerJobId || rawResult.jobId}`);
            console.log(`[VEO_ASSET_DOWNLOADED] ${sceneId} url=${rawResult.assetUrl || rawResult.video_url}`);
          }

          normalizedAsset = defaultSceneAssetNormalizer.normalize(rawResult, scene, videoSpec);
          if (decision.selectedProvider === 'veo') {
            console.log(`[VEO_ASSET_SHA256] ${sceneId} sha256=${normalizedAsset.sha256}`);
          }
          console.log(`[ASSET_SHA256] ${sceneId} sha256=${normalizedAsset.sha256}`);
          console.log(`[SCENE_NORMALIZED] ${sceneId} duration=${normalizedAsset.duration}s requestedDuration=${normalizedAsset.requestedDuration}s providerDuration=${normalizedAsset.providerDuration}s`);

          validation = defaultSceneAssetValidator.validate(normalizedAsset, videoSpec);
          console.log(`[SCENE_VALIDATED] ${sceneId} status=${validation.valid ? 'valid' : 'invalid'}`);

          if (validation.valid) break;
        } catch (err) {
          console.warn(`[SCENE RETRY] Scene ${sceneId} attempt ${retryCount + 1} failed on ${decision.selectedProvider}: ${err.message}`);
        }

        retryCount++;
        if (retryCount >= 2 && decision.fallbackChain && decision.fallbackChain.length > 1) {
          const fallbackProviderName = decision.fallbackChain[1];
          console.log(`[SCENE FALLBACK] Switching scene ${sceneId} to fallback provider '${fallbackProviderName}'`);
          decision.selectedProvider = fallbackProviderName;
          providerInstance = defaultProviderRegistry.getProvider(fallbackProviderName);
        }
      }

      if (!validation.valid || !normalizedAsset) {
        console.warn(`[JOB ORCHESTRATOR] Scene ${sceneId} failed all retries. Triggering master fallback.`);
        fallbackTriggered = `Scene ${sceneId} execution failed retries`;
        return;
      }

      console.log(`[SCENE_COMPLETE] ${sceneId}`);
      normalizedAsset.retryCount = retryCount;
      rawNormalizedAssets[i] = normalizedAsset;
      scenesTracking[i] = {
        ...decision,
        ...normalizedAsset,
        status: 'completed',
      };

      completedCount++;
      onStatus?.({
        status: 'processing',
        phase: `Rendered scene clip ${completedCount} of ${storyboard.length} (Parallel acceleration)`,
        progress: 20 + Math.floor((completedCount / storyboard.length) * 45),
      });
    };

    // Execute all scenes sequentially (concurrency 1) to respect Azure OpenAI Sora active task quota
    for (let i = 0; i < storyboard.length; i++) {
      if (fallbackTriggered) break;
      await processSingleScene(i);
    }

    if (fallbackTriggered) {
      return { fallbackToMaster: true, fallbackReason: fallbackTriggered };
    }

    // Pre-composition Assertions & Collection Integrity Check (Step 3)
    onStatus?.({
      status: 'processing',
      phase: 'Inspecting clip durations, resolution & SHA-256 checksums',
      progress: 68,
    });

    if (rawNormalizedAssets.length !== storyboard.length) {
      throw new Error(`PRE_COMPOSITION_ASSERTION_FAILED: Expected ${storyboard.length} scene assets, but got ${rawNormalizedAssets.length}`);
    }

    const genAssets = rawNormalizedAssets.filter(a => a.assetClassification === 'GENERATED_ASSET');
    if (genAssets.length >= 2) {
      const jobIds = new Set(genAssets.map(a => a.providerJobId));
      if (jobIds.size < genAssets.length) {
        throw new Error(`PRE_COMPOSITION_ASSERTION_FAILED: Generative scenes reused the same providerJobId (${[...jobIds].join(', ')})`);
      }
      const urls = new Set(genAssets.map(a => a.assetUrl));
      if (urls.size < genAssets.length) {
        throw new Error(`PRE_COMPOSITION_ASSERTION_FAILED: Generative scenes reused the same physical assetUrl`);
      }
    }

    const checkedAssets = defaultAssetIntegrity.validateCollectionIntegrity(rawNormalizedAssets);

    // Hand off normalized assets to FFmpeg Composition Engine (Step 4 & 5)
    if (!featureFlags.COMPOSITION_ENGINE_ENABLED) {
      console.log(`[JOB ORCHESTRATOR] Composition engine disabled, returning clips for ${jobId}`);
      return { fallbackToMaster: false, fallbackReason: null, scenes: scenesTracking, composition: null };
    }

    onStatus?.({
      status: 'processing',
      phase: 'HyperFrames timeline engine assembling scene cuts & watermark (FFmpeg)',
      progress: 78,
    });

    const compositionResult = await defaultCompositionEngine.composeVideo(checkedAssets, videoSpec, { storyboard });

    onStatus?.({
      status: 'processing',
      phase: 'Cloud S3 upload & final duration threshold verification',
      progress: 92,
    });

    const finalValidation = defaultFinalVideoValidator.validateFinalVideo(compositionResult, videoSpec, storyboard);

    if (!finalValidation.valid) {
      console.warn('[JOB ORCHESTRATOR] Final video validation failed:', finalValidation.errors);
      return { fallbackToMaster: true, fallbackReason: 'Final video composition validation failed' };
    }

    onStatus?.({
      status: 'completed',
      phase: 'Video generation complete',
      progress: 100,
    });

    return {
      fallbackToMaster: false,
      fallbackReason: null,
      scenes: scenesTracking,
      composition: compositionResult,
      result: {
        video_url: compositionResult.finalVideoUrl,
        thumbnail_url: compositionResult.thumbnailUrl,
        status: 'completed',
      },
    };
  }
}

export const defaultJobOrchestrator = new JobOrchestratorService();
