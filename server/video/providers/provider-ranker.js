/**
 * server/video/providers/provider-ranker.js
 *
 * Two-stage provider ranker evaluating candidate providers:
 * - Stage 1: Hard capability eligibility filter (strategy, ratio, duration, text/logo/ref, status)
 * - Stage 2: Ranking of eligible candidates using verified metadata (unknown metrics remain UNKNOWN)
 */

import featureFlags from '../../config/feature-flags.js';

export class ProviderRanker {
  /**
   * Filters and ranks registered providers for a given scene requirement set.
   */
  evaluateCandidates(registry, sceneCard = {}, videoSpec = {}) {
    let strategy = String(sceneCard.generationStrategy || 'GENERATIVE_VIDEO').toUpperCase().trim();
    if (!['GENERATIVE_VIDEO', 'PROGRAMMATIC_GRAPHICS', 'REUSE_EXISTING_MEDIA', 'HYBRID'].includes(strategy)) {
      strategy = 'GENERATIVE_VIDEO';
    }

    const aspectRatio = String(videoSpec.aspectRatio || '9:16').trim();
    const duration = Number(sceneCard.duration) || 5;

    const reqs = {
      strategy,
      aspectRatio,
      duration,
      requiresExactText: strategy === 'PROGRAMMATIC_GRAPHICS' || Boolean(sceneCard.exactText),
      requiresLogos: Boolean(videoSpec.brandContext?.logoRequired || sceneCard.brandRequirements?.length > 0),
      requiresGraphics: strategy === 'PROGRAMMATIC_GRAPHICS' || strategy === 'HYBRID',
      requiresExistingMedia: strategy === 'REUSE_EXISTING_MEDIA',
    };

    const eligibleCandidates = [];
    const rejectedCandidates = [];

    for (const name of registry.getRegisteredNames()) {
      const provider = registry.getProvider(name);
      if (!provider) continue;

      // Development simulation isolation filter
      if (name === 'simulation' && !featureFlags.SIMULATION_MODE_ENABLED) {
        rejectedCandidates.push({ name, reason: 'SIMULATION_MODE_ENABLED is false' });
        continue;
      }

      if (!provider.isAvailable()) {
        rejectedCandidates.push({ name, reason: `Provider status is ${provider.getProviderStatus()}` });
        continue;
      }

      const caps = provider.getCapabilities();

      // Hard capability constraints
      const supportsAspect = caps.supportedAspectRatios.includes(aspectRatio);
      const supportsDur = duration <= caps.maxDuration;
      
      let satisfiesStrategy = false;
      if (strategy === 'PROGRAMMATIC_GRAPHICS' && (name === 'graphics' || name === 'hyperframes')) satisfiesStrategy = true;
      else if (strategy === 'REUSE_EXISTING_MEDIA' && caps.supportsExistingMedia) satisfiesStrategy = true;
      else if (strategy === 'HYBRID' && (name === 'hybrid' || name === 'hyperframe_ai')) satisfiesStrategy = true;
      else if (strategy === 'GENERATIVE_VIDEO' && caps.supportsTextToVideo && name !== 'hybrid') satisfiesStrategy = true;

      let satisfiesTextLogo = true;
      if (reqs.requiresExactText && !caps.supportsExactText) satisfiesTextLogo = false;
      if (reqs.requiresLogos && !caps.supportsLogos && strategy === 'PROGRAMMATIC_GRAPHICS') satisfiesTextLogo = false;

      if (supportsAspect && supportsDur && satisfiesStrategy && satisfiesTextLogo) {
        eligibleCandidates.push({
          name,
          provider,
          model: provider.model,
          capabilities: caps,
          status: provider.getProviderStatus(),
          quality: 'UNKNOWN',
          latency: 'UNKNOWN',
          cost: 'UNKNOWN',
        });
      } else {
        rejectedCandidates.push({
          name,
          reason: !satisfiesStrategy
            ? `Strategy mismatch (${strategy})`
            : !supportsAspect
              ? `Unsupported aspect ratio (${aspectRatio})`
              : !supportsDur
                ? `Unsupported duration (${duration}s)`
                : 'Text/Logo capability mismatch',
        });
      }
    }

    // Resilient fallback: If no candidate matched the strict strategy, fallback to a compatible visual engine matching the generation strategy
    if (eligibleCandidates.length === 0) {
      let fallback = null;
      if (strategy === 'GENERATIVE_VIDEO') {
        fallback = registry.getProvider('sora') || registry.getProvider('veo') || (featureFlags.SIMULATION_MODE_ENABLED ? registry.getProvider('simulation') : null);
      } else if (strategy === 'PROGRAMMATIC_GRAPHICS') {
        fallback = registry.getProvider('graphics') || registry.getProvider('hyperframes');
      } else {
        fallback = registry.getProvider('sora') || registry.getProvider('graphics') || (featureFlags.SIMULATION_MODE_ENABLED ? registry.getProvider('simulation') : null);
      }

      if (fallback && fallback.isAvailable()) {
        const caps = fallback.getCapabilities();
        eligibleCandidates.push({
          name: fallback.name,
          provider: fallback,
          model: fallback.model,
          capabilities: caps,
          status: fallback.getProviderStatus(),
          quality: 'UNKNOWN',
          latency: 'UNKNOWN',
          cost: 'UNKNOWN',
        });
      }
    }

    // Stage 2: Ranking of eligible candidates
    eligibleCandidates.sort((a, b) => {
      // Prioritize LIVE_VERIFIED over DEV_ONLY
      if (a.status === 'LIVE_VERIFIED' && b.status !== 'LIVE_VERIFIED') return -1;
      if (b.status === 'LIVE_VERIFIED' && a.status !== 'LIVE_VERIFIED') return 1;
      return 0;
    });

    return {
      eligibleCandidates,
      rejectedCandidates,
    };
  }
}

export const defaultProviderRanker = new ProviderRanker();
