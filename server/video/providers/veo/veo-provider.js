/**
 * server/video/providers/veo/veo-provider.js
 *
 * Production Google Veo Provider Adapter implementing Google's official Veo-2 API contract.
 * Model: 'veo-2.0-generate-001' (Google Gemini API / Vertex AI Veo 2.0).
 * Official supported durations: 5, 8, 10 seconds.
 * Official supported aspect ratios: '16:9', '9:16', '1:1'.
 */

import { BaseVideoProvider, createProviderCapabilities, normalizeProviderResponse } from '../provider.interface.js';
import { defaultScenePromptBuilder } from '../../scene/scene-prompt-builder.js';
import featureFlags from '../../../config/feature-flags.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function normalizeVeoSeconds(requestedDuration) {
  const req = Number(requestedDuration) || 5;
  if (req <= 5) return 5;
  if (req <= 8) return 8;
  return 10;
}

export class VeoVideoProvider extends BaseVideoProvider {
  constructor(generateFn = null) {
    super('veo', 'veo-2.0-generate-001');
    this.generateFn = generateFn;
  }

  setGenerateFn(fn) {
    this.generateFn = fn;
  }

  getCapabilities() {
    return createProviderCapabilities({
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsReferenceImages: true,
      supportsCinematicQuality: true,
      supportsPhotorealism: true,
      supportsExactText: false,
      supportsLogos: false,
      supportsGraphics: false,
      supportsExistingMedia: false,
      supportsDeterministicBrand: false,
      supportsAudio: false,
      supportsAsyncGeneration: true,
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
      supportedDurations: [5, 8, 10],
      maxDuration: 10,
    });
  }

  isAvailable() {
    const hasCreds = Boolean(
      process.env.VEO_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY
    );
    const hasGenerateFn = typeof this.generateFn === 'function';
    return Boolean(featureFlags.VEO_ENABLED && (hasCreds || hasGenerateFn || featureFlags.SIMULATION_MODE_ENABLED));
  }

  getProviderStatus() {
    const hasCreds = Boolean(
      process.env.VEO_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY
    );
    if (!featureFlags.VEO_ENABLED) return 'DISABLED';
    if (hasCreds) return 'LIVE_VERIFIED';
    if (featureFlags.SIMULATION_MODE_ENABLED) return 'DEV_ONLY';
    return 'NOT_CONFIGURED';
  }

  async generateScene(sceneCard = {}, videoSpec = {}) {
    const apiKey = process.env.VEO_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    const hasCredsOrFn = (typeof this.generateFn === 'function') || Boolean(apiKey);

    if (!hasCredsOrFn && !featureFlags.SIMULATION_MODE_ENABLED) {
      throw new Error('PROVIDER_CONFIGURATION_ERROR: Google Veo API credentials (VEO_API_KEY / GOOGLE_GENAI_API_KEY) are missing and SIMULATION_MODE_ENABLED is false.');
    }

    const sceneId = sceneCard.sceneId || 'scene_01';
    const totalScenes = Array.isArray(videoSpec.scenes) && videoSpec.scenes.length > 0
      ? videoSpec.scenes.length
      : (videoSpec.targetSceneCount || (videoSpec.duration ? Math.ceil(Number(videoSpec.duration) / 10) : 3));
    const prompt = defaultScenePromptBuilder.buildSceneGenerationPrompt(sceneCard, videoSpec, sceneOrder - 1, totalScenes);
    const requestedDuration = Number(sceneCard.duration || 5);
    const providerDuration = normalizeVeoSeconds(requestedDuration);
    const aspectRatio = String(videoSpec.aspectRatio || '9:16');
    const startTime = Date.now();

    console.log(`[VEO_SCENE_START] ${sceneId}`);

    // Delegate to bound generator handler if set
    if (typeof this.generateFn === 'function' && hasCredsOrFn) {
      console.log(`[VEO_SUBMIT] ${sceneId} provider=veo model=${this.model} prompt="${prompt.slice(0, 60)}..." duration=${providerDuration}s`);
      const result = await this.generateFn({
        prompt,
        durationSeconds: providerDuration,
        aspectRatio,
        sceneId,
      });

      console.log(`[VEO_COMPLETE] ${sceneId} providerJobId=${result.video_id || result.jobId}`);
      console.log(`[VEO_ASSET_DOWNLOADED] ${sceneId} url=${result.video_url || result.assetUrl}`);

      return normalizeProviderResponse({
        provider: this.name,
        model: this.model,
        jobId: result.video_id || result.jobId || `veo-job-${Date.now()}`,
        providerJobId: result.video_id || result.providerJobId || result.jobId || `veo-job-${Date.now()}`,
        sceneId,
        status: result.status || 'completed',
        assetUrl: result.video_url || result.assetUrl || null,
        thumbnailUrl: result.thumbnail_url || result.thumbnailUrl || null,
        assetClassification: 'GENERATED_ASSET',
        providerStatus: 'LIVE_VERIFIED',
        requestedDuration,
        providerDuration,
        duration: requestedDuration,
        normalizedDuration: requestedDuration,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
        rawResponse: result,
      });
    }

    // Real REST API invocation against Google Gemini / Veo API
    if (apiKey) {
      console.log(`[VEO_SUBMIT] ${sceneId} provider=veo model=${this.model} prompt="${prompt.slice(0, 60)}..." duration=${providerDuration}s`);
      
      const submitEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${apiKey}`;
      const payload = {
        instances: [{
          prompt,
        }],
        parameters: {
          aspectRatio,
          durationSeconds: providerDuration,
          sampleCount: 1,
        },
      };

      const submitRes = await fetch(submitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        throw new Error(`Google Veo API error (${submitRes.status}): ${errorText}`);
      }

      const operation = await submitRes.json();
      const operationName = operation.name || `operations/veo-${Date.now()}`;
      console.log(`[VEO_POLL] ${sceneId} operation=${operationName}`);

      let pollResult = operation;
      let polls = 0;
      const maxPolls = 60; // Up to 5 minutes

      while (!pollResult.done && polls < maxPolls) {
        await new Promise(r => setTimeout(r, 5000));
        polls++;

        const pollEndpoint = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
        const pollRes = await fetch(pollEndpoint);
        if (pollRes.ok) {
          pollResult = await pollRes.json();
          console.log(`[VEO_POLL] ${sceneId} poll #${polls} status=${pollResult.done ? 'DONE' : 'PENDING'}`);
        }
      }

      if (!pollResult.done) {
        throw new Error(`Google Veo generation timed out after ${polls * 5}s for operation ${operationName}`);
      }

      if (pollResult.error) {
        throw new Error(`Google Veo generation failed: ${pollResult.error.message || JSON.stringify(pollResult.error)}`);
      }

      // Extract video URL or base64 data from response
      const videoUri = pollResult.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
                       pollResult.response?.videos?.[0]?.uri ||
                       pollResult.response?.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri;

      let finalAssetUrl = videoUri;

      // Upload to S3 if raw content returned
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_BUCKET_NAME && videoUri && videoUri.startsWith('http')) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client({
            region: process.env.AWS_REGION || 'ap-south-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          });
          const rawVidRes = await fetch(videoUri);
          const vidBuffer = Buffer.from(await rawVidRes.arrayBuffer());
          const s3Key = `videos/veo_${Date.now()}_${sceneId}.mp4`;
          await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: vidBuffer,
            ContentType: 'video/mp4',
          }));
          finalAssetUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`;
        } catch (s3Err) {
          console.warn('[VEO S3 UPLOAD WARNING]', s3Err.message);
        }
      }

      console.log(`[VEO_COMPLETE] ${sceneId} providerJobId=${operationName}`);
      console.log(`[VEO_ASSET_DOWNLOADED] ${sceneId} url=${finalAssetUrl}`);

      return normalizeProviderResponse({
        provider: this.name,
        model: this.model,
        jobId: operationName,
        providerJobId: operationName,
        sceneId,
        status: 'completed',
        assetUrl: finalAssetUrl,
        assetClassification: 'GENERATED_ASSET',
        providerStatus: 'LIVE_VERIFIED',
        requestedDuration,
        providerDuration,
        duration: requestedDuration,
        normalizedDuration: requestedDuration,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
        rawResponse: pollResult,
      });
    }

    if (featureFlags.SIMULATION_MODE_ENABLED) {
      return normalizeProviderResponse({
        provider: 'simulation',
        model: 'simulation-v1',
        jobId: `sim-job-${Date.now()}`,
        providerJobId: `sim-job-${Date.now()}`,
        sceneId,
        status: 'completed',
        assetUrl: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/sample-video-demo.mp4',
        assetClassification: 'SIMULATION_ASSET',
        providerStatus: 'DEV_ONLY',
        duration: requestedDuration,
        aspectRatio,
        generationTimeMs: Date.now() - startTime,
      });
    }

    throw new Error('PROVIDER_CONFIGURATION_ERROR: Google Veo provider cannot execute without valid live credentials.');
  }

  async getGenerationStatus(jobId) {
    return { provider: this.name, jobId, status: 'completed' };
  }
}

export const defaultVeoProvider = new VeoVideoProvider();
