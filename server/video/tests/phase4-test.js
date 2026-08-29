/**
 * server/video/tests/phase4-test.js
 *
 * Automated test suite for Phase 4 Live AI Video Provider Integration,
 * Simulation Isolation, Two-Stage Media Router, SHA-256 Asset Integrity, and Regressions.
 */

import { defaultProviderRegistry } from '../providers/provider-registry.js';
import { SoraVideoProvider } from '../providers/sora/sora-provider.js';
import { SimulationVideoProvider } from '../providers/simulation/simulation-provider.js';
import { MediaRouterService } from '../router/media-router.service.js';
import { ProviderRanker } from '../providers/provider-ranker.js';
import { defaultAssetIntegrity } from '../pipeline/asset-integrity.js';
import { validateVideoSpec } from '../creative-director/spec-schema.js';
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

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('RUNNING PHASE 4 LIVE INTEGRATION & SAFETY TESTS');
  console.log('====================================================\n');

  // TEST 1: Simulation Provider Isolation & Labeling
  console.log('Test 1: Simulation Provider Isolation & Explicit Labeling');
  const simProvider = new SimulationVideoProvider();
  featureFlags.SIMULATION_MODE_ENABLED = true;
  assert(simProvider.isAvailable() === true, 'Simulation provider available when SIMULATION_MODE_ENABLED is true');
  
  const simResult = await simProvider.generateScene({ sceneId: 'sim_s1' }, { aspectRatio: '9:16', duration: 5 });
  assert(simResult.provider === 'simulation', 'Simulation output explicitly labeled provider = "simulation"');
  assert(simResult.assetClassification === 'SIMULATION_ASSET', 'Simulation asset explicitly labeled SIMULATION_ASSET');

  featureFlags.SIMULATION_MODE_ENABLED = false;
  assert(simProvider.isAvailable() === false, 'Simulation provider unavailable when SIMULATION_MODE_ENABLED is false');

  // TEST 2: Sora Production Credential Guard & Error Throwing
  console.log('\nTest 2: Sora Production Credential Guard (No Silent Simulation)');
  const soraProvider = new SoraVideoProvider();
  delete process.env.AZURE_OPENAI_VIDEO_API_KEY;
  delete process.env.AZURE_OPENAI_VIDEO_ENDPOINT;
  featureFlags.SIMULATION_MODE_ENABLED = false;

  let thrown = false;
  try {
    await soraProvider.generateScene({ sceneId: 's1' }, { aspectRatio: '9:16', duration: 5 });
  } catch (err) {
    thrown = true;
    assert(err.message.includes('PROVIDER_CONFIGURATION_ERROR'), 'Missing Sora credentials throw PROVIDER_CONFIGURATION_ERROR in production mode');
  }
  assert(thrown === true, 'Sora provider never silently invokes simulation when SIMULATION_MODE_ENABLED=false');

  // TEST 3: Two-Stage Media Router Capability Filtering & Ranking
  console.log('\nTest 3: Two-Stage Media Router Capability Filtering & Ranking');
  featureFlags.SIMULATION_MODE_ENABLED = true; // Enable simulation for dev routing tests
  const mediaRouter = new MediaRouterService(defaultProviderRegistry);
  const spec = validateVideoSpec({ aspectRatio: '9:16', duration: 15 }).normalizedSpec;

  const decision = mediaRouter.routeScene({ sceneId: 'sc1', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, spec);
  assert(decision.selectedProvider !== null, 'Media router selects eligible provider');
  assert(Array.isArray(decision.candidateRankings), 'Media router returns candidate rankings');
  assert(decision.candidateRankings[0].quality === 'UNKNOWN', 'Unknown quality metric preserved as UNKNOWN without disqualification');

  // TEST 4: Hard Capability Constraint Elimination
  console.log('\nTest 4: Hard Capability Constraint Elimination');
  const ranker = new ProviderRanker();
  const oddSpec = { aspectRatio: '21:9', duration: 500 }; // Extreme unsupported aspect & duration
  const evalResult = ranker.evaluateCandidates(defaultProviderRegistry, { generationStrategy: 'GENERATIVE_VIDEO', duration: 500 }, oddSpec);
  assert(evalResult.eligibleCandidates.length === 0, 'Unsupported aspect ratio and duration eliminates candidate');
  assert(evalResult.rejectedCandidates.length > 0, 'Rejected candidates recorded with explicit reasons');

  // TEST 5: No-Provider Scenario Failure Guard
  console.log('\nTest 5: No-Provider Scenario Throws GENERATION_FAILED');
  featureFlags.SIMULATION_MODE_ENABLED = false;
  featureFlags.SORA_ENABLED = false;
  let failThrown = false;
  try {
    mediaRouter.routeScene({ sceneId: 'fail_scene', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, spec);
  } catch (err) {
    failThrown = true;
    assert(err.message.includes('GENERATION_FAILED'), 'No-provider scenario throws GENERATION_FAILED in production');
  }
  assert(failThrown === true, 'Production system never silently returns demo footage when no provider is available');

  // Restore dev flags for asset integrity tests
  featureFlags.SIMULATION_MODE_ENABLED = true;
  featureFlags.SORA_ENABLED = true;

  // TEST 6: SHA-256 Asset Integrity & Duplicate Detection
  console.log('\nTest 6: SHA-256 Asset Integrity & Duplicate Detection');
  const asset1 = { sceneId: 'gen_1', assetUrl: 'https://example.com/video1.mp4', assetClassification: 'GENERATED_ASSET' };
  const asset2 = { sceneId: 'gen_2', assetUrl: 'https://example.com/video1.mp4', assetClassification: 'GENERATED_ASSET' };
  const assetReused1 = { sceneId: 'reused_1', assetUrl: 'https://example.com/brand_intro.mp4', assetClassification: 'REUSED_APPROVED_ASSET' };
  const assetReused2 = { sceneId: 'reused_2', assetUrl: 'https://example.com/brand_intro.mp4', assetClassification: 'REUSED_APPROVED_ASSET' };

  const checkedGenerative = defaultAssetIntegrity.validateCollectionIntegrity([asset1, asset2]);
  assert(checkedGenerative[1].duplicateWarning === true, 'Duplicate GENERATED_ASSET outputs trigger duplicateWarning');
  assert(checkedGenerative[1].integrityStatus === 'DUPLICATE_ASSET_WARNING', 'Integrity status set to DUPLICATE_ASSET_WARNING');

  const checkedReused = defaultAssetIntegrity.validateCollectionIntegrity([assetReused1, assetReused2]);
  assert(checkedReused[1].duplicateWarning === false, 'Duplicate REUSED_APPROVED_ASSET is permitted without warning');

  console.log('\n====================================================');
  console.log(`ALL PHASE 4 TESTS PASSED SUCCESSFULLY (${passedTests}/${totalTests})`);
  console.log('====================================================');
}

runPhase4Tests().catch(err => {
  console.error('\n[PHASE 4 TEST FATAL ERROR]', err);
  process.exit(1);
});
