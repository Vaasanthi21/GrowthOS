/**
 * server/video/providers/provider-registry.js
 *
 * Central registry managing all video provider instances and stubs.
 * Media Router requests providers through this registry rather than direct imports.
 */

import { defaultSoraProvider } from './sora/sora-provider.js';
import { defaultGraphicsProvider } from './graphics/graphics-provider.js';
import { defaultAssetProvider } from './asset-library/asset-provider.js';
import { defaultHybridProvider } from './hybrid/hybrid-provider.js';
import { defaultVeoProvider } from './veo/veo-provider.js';
import { defaultHyperFramesProvider } from './hyperframes/hyperframes-provider.js';
import { defaultHyperframeAIProvider } from './hyperframe-ai/hyperframe-ai-provider.js';
import { defaultSimulationProvider } from './simulation/simulation-provider.js';

export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.registerProvider('sora', defaultSoraProvider);
    this.registerProvider('graphics', defaultGraphicsProvider);
    this.registerProvider('asset_library', defaultAssetProvider);
    this.registerProvider('hybrid', defaultHybridProvider);
    this.registerProvider('veo', defaultVeoProvider);
    this.registerProvider('hyperframes', defaultHyperFramesProvider);
    this.registerProvider('hyperframe_ai', defaultHyperframeAIProvider);
    this.registerProvider('simulation', defaultSimulationProvider);
  }

  registerProvider(name, providerInstance) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }
    if (!providerInstance) {
      throw new Error(`Provider instance for "${name}" cannot be null or undefined`);
    }
    this.providers.set(name.toLowerCase().trim(), providerInstance);
  }

  getProvider(name) {
    if (!name) return null;
    return this.providers.get(String(name).toLowerCase().trim()) || null;
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }

  getRegisteredNames() {
    return Array.from(this.providers.keys());
  }
}

export const defaultProviderRegistry = new ProviderRegistry();
