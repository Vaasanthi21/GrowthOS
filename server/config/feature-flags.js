/**
 * server/config/feature-flags.js
 *
 * Safe feature flags controlling Creative OS video provider architecture.
 * Default SIMULATION_MODE_ENABLED is false in production to prevent silent simulation.
 */

export const featureFlags = {
  VIDEO_PROVIDER_ARCHITECTURE_ENABLED: process.env.VIDEO_PROVIDER_ARCHITECTURE_ENABLED !== 'false',
  MEDIA_ROUTER_ENABLED: process.env.MEDIA_ROUTER_ENABLED !== 'false',
  SCENE_LEVEL_GENERATION_ENABLED: process.env.SCENE_LEVEL_GENERATION_ENABLED !== 'false',
  COMPOSITION_ENGINE_ENABLED: process.env.COMPOSITION_ENGINE_ENABLED !== 'false',
  SIMULATION_MODE_ENABLED: process.env.SIMULATION_MODE_ENABLED === 'true',

  SORA_ENABLED: process.env.SORA_ENABLED !== 'false',
  VEO_ENABLED: process.env.VEO_ENABLED === 'true',
  HYPERFRAMES_ENABLED: process.env.HYPERFRAMES_ENABLED === 'true',
  HYPERFRAME_AI_ENABLED: process.env.HYPERFRAME_AI_ENABLED === 'true',
};

export default featureFlags;
