/**
 * server/video/router/media-router.service.js
 *
 * Two-stage Media Router evaluating scene cards against ProviderRegistry
 * using Stage 1 hard eligibility filtering and Stage 2 metadata ranking.
 */

import { defaultProviderRegistry } from '../providers/provider-registry.js';
import { defaultProviderRanker } from '../providers/provider-ranker.js';

export class MediaRouterService {
  constructor(registry = defaultProviderRegistry, ranker = defaultProviderRanker) {
    this.registry = registry;
    this.ranker = ranker;
  }

  /**
   * Evaluates a scene card and VideoSpec and returns an explainable routing decision.
   */
  routeScene(sceneCard = {}, videoSpec = {}) {
    const sceneId = String(sceneCard.sceneId || `scene_${Date.now()}`).trim();
    const strategy = String(sceneCard.generationStrategy || 'GENERATIVE_VIDEO').toUpperCase().trim();
    const aspectRatio = String(videoSpec.aspectRatio || '9:16').trim();
    const duration = Number(sceneCard.duration) || 5;

    const evaluation = this.ranker.evaluateCandidates(this.registry, sceneCard, videoSpec);
    const eligible = evaluation.eligibleCandidates;

    if (eligible.length === 0) {
      throw new Error(`GENERATION_FAILED: No eligible provider available for scene ${sceneId} (Strategy: ${strategy}, Ratio: ${aspectRatio}, Duration: ${duration}s).`);
    }

    const selected = eligible[0];
    const fallbackChain = eligible.map(c => c.name);

    const capabilitiesMatched = [
      'supportsStrategyMatch',
      'supportedAspectRatios',
      'supportedDurations',
    ];

    const reason = `${selected.name} selected: Top-ranked candidate (Status: ${selected.status}) matching strategy ${strategy}, aspect ratio ${aspectRatio}, and ${duration}s duration.`;

    return {
      sceneId,
      strategy,
      selectedProvider: selected.name,
      selectedModel: selected.model,
      score: selected.status === 'LIVE_VERIFIED' ? 100 : 80,
      reason,
      capabilitiesMatched,
      candidateRankings: eligible.map((c, idx) => ({
        rank: idx + 1,
        provider: c.name,
        model: c.model,
        status: c.status,
        quality: c.quality,
        latency: c.latency,
        cost: c.cost,
      })),
      fallbackChain,
      status: 'planned',
    };
  }
}

export const defaultMediaRouter = new MediaRouterService();
