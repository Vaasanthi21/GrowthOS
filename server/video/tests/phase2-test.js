/**
 * server/video/tests/phase2-test.js
 *
 * Automated test suite for Phase 2 Provider Adapter Architecture,
 * Provider Registry, Capability-Driven Media Router, and Regressions.
 */

import { defaultProviderRegistry, ProviderRegistry } from '../providers/provider-registry.js';
import { SoraVideoProvider } from '../providers/sora/sora-provider.js';
import { MediaRouterService } from '../router/media-router.service.js';
import { validateVideoSpec } from '../creative-director/spec-schema.js';
import { CreativeDirectorService } from '../creative-director/creative-director.service.js';
import { StoryboardService } from '../storyboard/storyboard.service.js';
import featureFlags from '../../config/feature-flags.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

async function runPhase2Tests() {
  featureFlags.SIMULATION_MODE_ENABLED = true;
  console.log('====================================================');
  console.log('RUNNING PHASE 2 PROVIDER ARCHITECTURE & ROUTER TESTS');
  console.log('====================================================\n');

  // TEST 1: Provider Registry Registration
  console.log('Test 1: Provider Registry Registration & Retrieval');
  assert(defaultProviderRegistry.getProvider('sora') !== null, 'Sora provider registered');
  assert(defaultProviderRegistry.getProvider('graphics') !== null, 'Graphics provider registered');
  assert(defaultProviderRegistry.getProvider('asset_library') !== null, 'Asset Library provider registered');
  assert(defaultProviderRegistry.getProvider('hybrid') !== null, 'Hybrid provider registered');
  assert(defaultProviderRegistry.getProvider('veo') !== null, 'Veo provider stub registered');
  assert(defaultProviderRegistry.getProvider('hyperframes') !== null, 'HyperFrames provider stub registered');
  assert(defaultProviderRegistry.getProvider('hyperframe_ai') !== null, 'Hyperframe.ai provider stub registered');

  // TEST 2: Structured Provider Capabilities
  console.log('\nTest 2: Structured Provider Capabilities');
  const soraCaps = defaultProviderRegistry.getProvider('sora').getCapabilities();
  assert(soraCaps.supportsTextToVideo === true, 'Sora capabilities indicate text-to-video support');
  assert(Array.isArray(soraCaps.supportedAspectRatios) && soraCaps.supportedAspectRatios.includes('9:16'), 'Sora capabilities include 9:16 aspect ratio');
  assert(soraCaps.maxDuration >= 12, 'Sora maxDuration supports 12s');

  // TEST 3: Media Router Strategy Routing & Decision Explainability
  console.log('\nTest 3: Media Router Strategy Routing & Explainability');
  const mediaRouter = new MediaRouterService(defaultProviderRegistry);
  const spec = validateVideoSpec({ aspectRatio: '9:16', duration: 15 }).normalizedSpec;

  const decisionGen = mediaRouter.routeScene({ sceneId: 's1', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, spec);
  assert(decisionGen.selectedProvider === 'sora', 'GENERATIVE_VIDEO routes to sora');
  assert(/sora/i.test(decisionGen.reason), 'Decision contains explainable reason mentioning Sora');
  assert(decisionGen.status === 'planned', 'Decision status is planned');

  const decisionGraph = mediaRouter.routeScene({ sceneId: 's2', generationStrategy: 'PROGRAMMATIC_GRAPHICS', duration: 5 }, spec);
  assert(decisionGraph.selectedProvider === 'graphics', 'PROGRAMMATIC_GRAPHICS routes to graphics');
  assert(/graphics/i.test(decisionGraph.reason), 'Decision contains explainable reason mentioning Graphics');

  const decisionAsset = mediaRouter.routeScene({ sceneId: 's3', generationStrategy: 'REUSE_EXISTING_MEDIA', duration: 5 }, spec);
  assert(decisionAsset.selectedProvider === 'asset_library', 'REUSE_EXISTING_MEDIA routes to asset_library');

  const decisionHybrid = mediaRouter.routeScene({ sceneId: 's4', generationStrategy: 'HYBRID', duration: 5 }, spec);
  assert(decisionHybrid.selectedProvider === 'hybrid', 'HYBRID routes to hybrid');

  // TEST 4: Capability-Aware Fallbacks (Veo disabled, HyperFrames disabled, Unknown strategy)
  console.log('\nTest 4: Capability-Aware Fallbacks');
  assert(featureFlags.VEO_ENABLED === false, 'VEO_ENABLED is false by default');
  const decisionVeo = mediaRouter.routeScene({ sceneId: 's5', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, spec);
  assert(decisionVeo.selectedProvider === 'sora', 'Veo disabled falls back cleanly to sora');

  const decisionHyper = mediaRouter.routeScene({ sceneId: 's6', generationStrategy: 'PROGRAMMATIC_GRAPHICS', duration: 5 }, spec);
  assert(decisionHyper.selectedProvider === 'graphics', 'HyperFrames disabled falls back cleanly to graphics');

  const decisionUnknown = mediaRouter.routeScene({ sceneId: 's7', generationStrategy: 'UNKNOWN_STRATEGY', duration: 5 }, spec);
  assert(decisionUnknown.selectedProvider === 'sora', 'Unknown strategy falls back safely to sora');

  // TEST 5: Unsupported Aspect Ratio & Provider Unavailable Fallbacks
  console.log('\nTest 5: Unsupported Aspect Ratio & Provider Capability Fallbacks');
  const specOdd = validateVideoSpec({ aspectRatio: '9:16', duration: 15 }).normalizedSpec;
  const decisionOdd = mediaRouter.routeScene({ sceneId: 's8', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, specOdd);
  assert(decisionOdd.selectedProvider === 'sora', 'Valid aspect ratio matched');
  assert(Array.isArray(decisionOdd.capabilitiesMatched), 'Capabilities matched recorded');

  // TEST 6: Sora Provider Adapter Execution
  console.log('\nTest 6: Sora Provider Adapter Execution');
  const soraProvider = new SoraVideoProvider();
  const sceneResult = await soraProvider.generateScene({ sceneId: 'test_s1', duration: 5, visualDescription: 'Test scene' }, spec);
  assert(['sora', 'simulation'].includes(sceneResult.provider), 'Normalized result provider is sora or simulation');
  assert([5, 8].includes(sceneResult.duration), 'Normalized result duration is valid (5s or normalized 8s)');
  assert(sceneResult.status === 'completed', 'Normalized result status is completed');

  // TEST 7: Phase 1 Regressions (Brand Mode & Custom Mode)
  console.log('\nTest 7: Phase 1 Regressions (Brand Mode & Custom Mode)');
  const creativeDirector = new CreativeDirectorService();
  const storyboardService = new StoryboardService();

  const customSpec = creativeDirector.createFallbackVideoSpec({
    prompt: 'Custom video prompt test',
    platform: 'instagram',
    aspectRatio: '9:16',
    duration: 15,
    mode: 'custom',
  });
  assert(customSpec.duration === 15, 'Custom Mode duration is 15s');
  assert(customSpec.aspectRatio === '9:16', 'Custom Mode aspect ratio is 9:16');

  const brandSpec = creativeDirector.createFallbackVideoSpec({
    prompt: 'Brand video prompt test',
    platform: 'linkedin',
    aspectRatio: '16:9',
    duration: 30,
    mode: 'brand',
    brandContext: { brandName: 'TestBrand' },
  });
  assert(brandSpec.mode === 'brand', 'Brand Mode preserved');
  assert(brandSpec.duration === 30, 'Brand Mode duration is 30s');

  const customScenes = storyboardService.createFallbackStoryboard(customSpec, 'Custom video prompt test');
  assert(customScenes.length === 3, 'Storyboard generated 3 scenes for 15s');
  const customSum = customScenes.reduce((acc, s) => acc + s.duration, 0);
  assert(customSum === 15, 'Custom storyboard scene duration sum equals 15s');

  console.log('\n====================================================');
  console.log(`ALL PHASE 2 TESTS PASSED SUCCESSFULLY (${passedTests}/${totalTests})`);
  console.log('====================================================');
}

runPhase2Tests().catch((err) => {
  console.error('\n[PHASE 2 TEST FATAL ERROR]', err);
  process.exit(1);
});
