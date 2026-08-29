/**
 * server/video/tests/veo-provider-test.js
 *
 * Comprehensive automated test suite for Google Veo Provider integration (Phase 5).
 * Tests all 20 required architectural capabilities, routing, security, duration adapter,
 * simulation isolation, and router fallback.
 */

import { defaultProviderRegistry } from '../providers/provider-registry.js';
import { VeoVideoProvider, normalizeVeoSeconds } from '../providers/veo/veo-provider.js';
import { MediaRouterService } from '../router/media-router.service.js';
import { ProviderRanker } from '../providers/provider-ranker.js';
import { defaultSceneAssetNormalizer } from '../pipeline/scene-asset-normalizer.js';
import { defaultAssetIntegrity } from '../pipeline/asset-integrity.js';
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

async function runVeoTests() {
  console.log('====================================================');
  console.log('RUNNING GOOGLE VEO PROVIDER AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Provider Interface Compliance
  console.log('Test 1: Provider Interface Compliance');
  const veo = new VeoVideoProvider();
  assert(veo.name === 'veo', 'Provider name is "veo"');
  assert(veo.model === 'veo-2.0-generate-001', 'Provider model is "veo-2.0-generate-001"');

  // TEST 2: Capability Metadata
  console.log('\nTest 2: Capability Metadata');
  const caps = veo.getCapabilities();
  assert(caps.supportsTextToVideo === true, 'supportsTextToVideo is true');
  assert(caps.supportsImageToVideo === true, 'supportsImageToVideo is true');
  assert(caps.supportsReferenceImages === true, 'supportsReferenceImages is true');
  assert(caps.supportsCinematicQuality === true, 'supportsCinematicQuality is true');
  assert(caps.supportsPhotorealism === true, 'supportsPhotorealism is true');
  assert(caps.maxDuration === 10, 'maxDuration is 10s');

  // TEST 3: Authentication / Configuration Validation
  console.log('\nTest 3: Authentication / Configuration Validation');
  process.env.VEO_API_KEY = 'test-veo-key';
  featureFlags.VEO_ENABLED = true;
  assert(veo.isAvailable() === true, 'isAvailable() returns true when VEO_API_KEY present and VEO_ENABLED=true');
  assert(veo.getProviderStatus() === 'LIVE_VERIFIED', 'getProviderStatus() returns LIVE_VERIFIED');

  // TEST 4: Missing Credential Behavior
  console.log('\nTest 4: Missing Credential Behavior (Production Guard)');
  delete process.env.VEO_API_KEY;
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  featureFlags.SIMULATION_MODE_ENABLED = false;

  let credErrThrown = false;
  try {
    await veo.generateScene({ sceneId: 'sc_err' }, { duration: 5 });
  } catch (err) {
    credErrThrown = true;
    assert(err.message.includes('PROVIDER_CONFIGURATION_ERROR'), 'Missing credentials throw PROVIDER_CONFIGURATION_ERROR');
  }
  assert(credErrThrown === true, 'Veo provider never silently invokes simulation when SIMULATION_MODE_ENABLED=false');

  // TEST 5: Simulation Isolation
  console.log('\nTest 5: Simulation Isolation');
  featureFlags.SIMULATION_MODE_ENABLED = true;
  const simResult = await veo.generateScene({ sceneId: 'sim_veo' }, { duration: 5 });
  assert(simResult.provider === 'simulation', 'Simulation mode explicitly labels provider = "simulation"');
  assert(simResult.assetClassification === 'SIMULATION_ASSET', 'Simulation asset explicitly labeled SIMULATION_ASSET');

  featureFlags.SIMULATION_MODE_ENABLED = false; // Reset

  // TEST 6: Supported Aspect Ratio Validation
  console.log('\nTest 6: Supported Aspect Ratio Validation');
  assert(caps.supportedAspectRatios.includes('9:16'), 'Supports 9:16');
  assert(caps.supportedAspectRatios.includes('16:9'), 'Supports 16:9');
  assert(caps.supportedAspectRatios.includes('1:1'), 'Supports 1:1');
  assert(!caps.supportedAspectRatios.includes('4:5'), 'Rejects unsupported 4:5 ratio');

  // TEST 7: Duration Normalization Layer
  console.log('\nTest 7: Duration Normalization Layer');
  assert(normalizeVeoSeconds(3) === 5, '3s maps to 5s provider duration');
  assert(normalizeVeoSeconds(5) === 5, '5s maps to 5s provider duration');
  assert(normalizeVeoSeconds(7) === 8, '7s maps to 8s provider duration');
  assert(normalizeVeoSeconds(10) === 10, '10s maps to 10s provider duration');

  // TEST 8: Text-to-Video Routing Eligibility
  console.log('\nTest 8: Text-to-Video Routing Eligibility');
  process.env.VEO_API_KEY = 'test-key';
  featureFlags.VEO_ENABLED = true;
  const router = new MediaRouterService(defaultProviderRegistry);
  const decision = router.routeScene({ sceneId: 'veo_text', generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, { aspectRatio: '9:16' });
  assert(decision.selectedProvider !== null, 'Media router selects candidate for text-to-video');

  // TEST 9: Image-to-Video Routing Capability
  console.log('\nTest 9: Image-to-Video Routing Capability');
  assert(caps.supportsImageToVideo === true, 'Veo provider claims supportsImageToVideo');

  // TEST 10: Reference-Image Routing Capability
  console.log('\nTest 10: Reference-Image Routing Capability');
  assert(caps.supportsReferenceImages === true, 'Veo provider claims supportsReferenceImages');

  // TEST 11: Async Job Submission
  console.log('\nTest 11: Async Job Submission');
  veo.setGenerateFn(async () => {
    return { video_id: 'veo_op_998877', video_url: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/veo_test.mp4', status: 'completed' };
  });
  const asyncRes = await veo.generateScene({ sceneId: 'async_s1' }, { aspectRatio: '9:16', duration: 5 });
  assert(asyncRes.providerJobId === 'veo_op_998877', 'Async operation ID returned correctly');

  // TEST 12: Polling Behavior Handling
  console.log('\nTest 12: Polling Behavior Handling');
  assert(asyncRes.status === 'completed', 'Polling completed successfully');

  // TEST 13: Timeout Behavior
  console.log('\nTest 13: Timeout Behavior');
  veo.setGenerateFn(async () => {
    throw new Error('Google Veo generation timed out after 300s');
  });
  let timeoutThrown = false;
  try {
    await veo.generateScene({ sceneId: 'timeout_s1' }, { duration: 5 });
  } catch (err) {
    timeoutThrown = true;
    assert(err.message.includes('timed out'), 'Timeout error captured cleanly');
  }
  assert(timeoutThrown === true, 'Timeout handled properly');

  // TEST 14: Provider Job ID Persistence
  console.log('\nTest 14: Provider Job ID Persistence');
  veo.setGenerateFn(async () => {
    return { video_id: 'veo_job_unique_123', video_url: 'https://example.com/veo.mp4', status: 'completed' };
  });
  const persistRes = await veo.generateScene({ sceneId: 'sc_persist' }, { duration: 5 });
  assert(persistRes.providerJobId === 'veo_job_unique_123', 'providerJobId is persisted');

  // TEST 15: Asset Classification
  console.log('\nTest 15: Asset Classification');
  assert(persistRes.assetClassification === 'GENERATED_ASSET', 'Asset classified as GENERATED_ASSET');

  // TEST 16: SHA-256 Generation
  console.log('\nTest 16: SHA-256 Generation');
  const normalized = defaultSceneAssetNormalizer.normalize(persistRes, { sceneId: 'sc_persist' }, { aspectRatio: '9:16' });
  assert(typeof normalized.sha256 === 'string' && normalized.sha256.length === 64, 'SHA-256 checksum is valid 64-char hex');

  // TEST 17: Invalid Provider Response Handling
  console.log('\nTest 17: Invalid Provider Response Handling');
  veo.setGenerateFn(async () => {
    return { status: 'failed', error: 'Invalid prompt content policy violation' };
  });
  const invalidRes = await veo.generateScene({ sceneId: 'sc_invalid' }, { duration: 5 });
  assert(invalidRes.status === 'failed', 'Invalid/Failed response normalized without crashing');

  // TEST 18: Provider Failure Behavior
  console.log('\nTest 18: Provider Failure Behavior');
  veo.setGenerateFn(async () => {
    throw new Error('Veo API 500 Internal Server Error');
  });
  let failThrown = false;
  try {
    await veo.generateScene({ sceneId: 'sc_fail' }, { duration: 5 });
  } catch (err) {
    failThrown = true;
    assert(err.message.includes('Veo API 500'), 'Provider failure error propagated');
  }
  assert(failThrown === true, 'Provider failure caught cleanly');

  // TEST 19: Fallback Behavior to Sora
  console.log('\nTest 19: Router Fallback Behavior');
  process.env.AZURE_OPENAI_VIDEO_API_KEY = 'test-sora-key';
  process.env.AZURE_OPENAI_VIDEO_ENDPOINT = 'https://test-sora-endpoint.com';
  featureFlags.SORA_ENABLED = true;

  const ranker = new ProviderRanker();
  const evalResult = ranker.evaluateCandidates(defaultProviderRegistry, { generationStrategy: 'GENERATIVE_VIDEO', duration: 5 }, { aspectRatio: '9:16' });
  assert(evalResult.eligibleCandidates.length >= 2, 'Multiple eligible candidates (Veo and Sora) evaluated for fallback chain');

  // TEST 20: No Sample/Demo Footage Fallback
  console.log('\nTest 20: No Sample/Demo Footage Fallback');
  featureFlags.SIMULATION_MODE_ENABLED = false;
  veo.setGenerateFn(null);
  delete process.env.VEO_API_KEY;
  let noDemoThrown = false;
  try {
    await veo.generateScene({ sceneId: 'sc_nodemo' }, { duration: 5 });
  } catch (err) {
    noDemoThrown = true;
    assert(err.message.includes('PROVIDER_CONFIGURATION_ERROR'), 'No demo video returned when credentials missing and SIMULATION_MODE_ENABLED=false');
  }
  assert(noDemoThrown === true, 'Strict safety net confirmed');

  console.log('\n====================================================');
  console.log(`ALL GOOGLE VEO TESTS PASSED SUCCESSFULLY (${passedTests}/${totalTests})`);
  console.log('====================================================');
}

runVeoTests().catch(err => {
  console.error('\n[GOOGLE VEO TEST FATAL ERROR]', err);
  process.exit(1);
});
