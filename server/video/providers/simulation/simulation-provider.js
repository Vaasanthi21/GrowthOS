/**
 * server/video/providers/simulation/simulation-provider.js
 *
 * Explicit Simulation Provider adapter for development and testing.
 * Executes ONLY when featureFlags.SIMULATION_MODE_ENABLED === true.
 * Always identifies output as provider = "simulation" and assetClassification = "SIMULATION_ASSET".
 */

import { BaseVideoProvider, createProviderCapabilities, normalizeProviderResponse } from '../provider.interface.js';
import featureFlags from '../../../config/feature-flags.js';

export class SimulationVideoProvider extends BaseVideoProvider {
  constructor() {
    super('simulation', 'simulation-v1');
  }

  getCapabilities() {
    return createProviderCapabilities({
      supportsTextToVideo: true,
      supportsImageToVideo: true,
      supportsReferenceImages: true,
      supportsExactText: true,
      supportsLogos: true,
      supportsGraphics: true,
      supportsExistingMedia: true,
      supportsAudio: true,
      supportedAspectRatios: ['9:16', '16:9', '1:1', '4:5'],
      supportedDurations: [1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 30, 60],
      maxDuration: 60,
    });
  }

  isAvailable() {
    return Boolean(featureFlags.SIMULATION_MODE_ENABLED);
  }

  async generateScene(sceneCard = {}, videoSpec = {}) {
    if (!this.isAvailable()) {
      throw new Error('PROVIDER_CONFIGURATION_ERROR: Simulation provider is disabled in production (SIMULATION_MODE_ENABLED=false).');
    }

    const startTime = Date.now();
    const duration = Number(sceneCard.duration || videoSpec.duration || 5);
    const aspectRatio = String(videoSpec.aspectRatio || '9:16');

    return normalizeProviderResponse({
      provider: 'simulation',
      model: 'simulation-v1',
      jobId: `sim-job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sceneId: sceneCard.sceneId || 'scene_01',
      status: 'completed',
      assetUrl: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/sample-video-demo.mp4',
      thumbnailUrl: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/thumbnails/sample-video-demo.png',
      assetClassification: 'SIMULATION_ASSET',
      duration,
      aspectRatio,
      generationTimeMs: Date.now() - startTime,
      providerStatus: 'DEV_ONLY',
    });
  }

  async getGenerationStatus(jobId) {
    return { provider: 'simulation', jobId, status: 'completed' };
  }
}

export const defaultSimulationProvider = new SimulationVideoProvider();
