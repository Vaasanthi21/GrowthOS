/**
 * server/video/providers/hyperframe-ai/hyperframe-ai-provider.js
 *
 * Integration-Ready Hyperframe.ai Template Studio Adapter Stub.
 */

import { BaseVideoProvider, createProviderCapabilities } from '../provider.interface.js';
import featureFlags from '../../../config/feature-flags.js';

export class HyperframeAIVideoProvider extends BaseVideoProvider {
  constructor() {
    super('hyperframe_ai', 'hyperframe-ai-studio-v1');
  }

  getCapabilities() {
    return createProviderCapabilities({
      supportsGraphics: true,
      supportsExactText: true,
      supportsLogos: true,
      supportsTextToVideo: false,
      supportsImageToVideo: true,
      supportsExistingMedia: true,
      supportedAspectRatios: ['9:16', '16:9', '1:1'],
      supportedDurations: [4, 5, 8, 10, 15, 30],
      maxDuration: 30,
    });
  }

  isAvailable() {
    return Boolean(featureFlags.HYPERFRAME_AI_ENABLED && process.env.HYPERFRAME_AI_API_KEY);
  }

  async generateScene(sceneCard = {}, videoSpec = {}) {
    if (!this.isAvailable()) {
      throw new Error('Hyperframe.ai provider is currently NOT_CONFIGURED or disabled by feature flag HYPERFRAME_AI_ENABLED.');
    }
    throw new Error('Hyperframe.ai API integration pending official API credentials.');
  }
}

export const defaultHyperframeAIProvider = new HyperframeAIVideoProvider();
