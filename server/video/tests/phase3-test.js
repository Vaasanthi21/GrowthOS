/**
 * server/video/tests/phase3-test.js
 *
 * Automated test suite for Phase 3 Scene-Level Video Generation, Scene Continuity Context,
 * Scene Asset Normalization/Validation, Audio Mixer, Composition Engine, Final Video Validation,
 * and Emergency Single-Master Sora Fallback.
 */

import { validateVideoSpec } from '../creative-director/spec-schema.js';
import { createSceneContinuityContext } from '../context/scene-continuity.context.js';
import { defaultSceneAssetNormalizer } from '../pipeline/scene-asset-normalizer.js';
import { defaultSceneAssetValidator } from '../pipeline/scene-asset-validator.js';
import { defaultAudioMixer } from '../pipeline/audio-mixer.js';
import { defaultCompositionEngine } from '../pipeline/composition-engine.js';
import { defaultFinalVideoValidator } from '../pipeline/final-video-validator.js';
import { defaultJobOrchestrator } from '../jobs/job-orchestrator.service.js';
import { defaultProviderRegistry } from '../providers/provider-registry.js';
import { defaultMediaRouter } from '../router/media-router.service.js';
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

async function runPhase3Tests() {
  featureFlags.SIMULATION_MODE_ENABLED = true;
  console.log('====================================================');
  console.log('RUNNING PHASE 3 SCENE GENERATION & COMPOSITION TESTS');
  console.log('====================================================\n');

  // TEST 1: SceneContinuityContext Creation & Propagation
  console.log('Test 1: SceneContinuityContext Creation & Propagation');
  const spec = validateVideoSpec({
    aspectRatio: '9:16',
    duration: 15,
    mode: 'brand',
    brandContext: { brandName: 'GrowthOS', logoUrl: 'https://example.com/logo.png', logoPlacement: 'top-right' },
  }).normalizedSpec;

  const continuity = createSceneContinuityContext(spec, 'Launch product video');
  assert(continuity.characterIdentity.name.includes('GrowthOS'), 'Continuity context includes brand character identity');
  assert(Array.isArray(continuity.environment.colorPalette), 'Color palette array present');
  assert(continuity.brandVisualIdentity.logoPlacement === 'top-right', 'Logo placement context preserved');

  // TEST 2: SceneAssetNormalizer Contract
  console.log('\nTest 2: SceneAssetNormalizer Contract');
  const rawProviderOutput = {
    provider: 'sora',
    model: 'sora-2',
    jobId: 'job-123',
    assetUrl: 'https://example.com/scene1.mp4',
    duration: 5,
    aspectRatio: '9:16',
    generationTimeMs: 1200,
  };
  const sceneCard = { sceneId: 'scene_01', duration: 5 };
  const normalizedAsset = defaultSceneAssetNormalizer.normalize(rawProviderOutput, sceneCard, spec);

  assert(normalizedAsset.sceneId === 'scene_01', 'Normalized asset retains sceneId');
  assert(normalizedAsset.provider === 'sora', 'Normalized asset retains provider');
  assert(normalizedAsset.width === 720 && normalizedAsset.height === 1280, 'Normalized asset sets 9:16 dimensions (720x1280)');
  assert(normalizedAsset.normalizationStatus === 'normalized', 'Normalization status is normalized');

  // TEST 3: SceneAssetValidator Constraint Checks
  console.log('\nTest 3: SceneAssetValidator Constraint Checks');
  const validationResult = defaultSceneAssetValidator.validate(normalizedAsset, spec);
  assert(validationResult.valid === true, 'Valid SceneAsset passes validation');
  assert(validationResult.validatedAsset.validationStatus === 'valid', 'Validation status is valid');

  const invalidAsset = { ...normalizedAsset, assetUrl: null, provider: 'sora' };
  const invalidValidation = defaultSceneAssetValidator.validate(invalidAsset, spec);
  assert(invalidValidation.valid === false, 'Asset missing URL fails validation');
  assert(invalidValidation.errors.length > 0, 'Validation errors recorded');

  // TEST 4: AudioMixer Track Preparation & Silent Track Injection
  console.log('\nTest 4: AudioMixer Track Preparation & Silent Track Injection');
  const silentAsset = { ...normalizedAsset, sceneId: 'scene_silent', hasAudio: false };
  const audioResult = defaultAudioMixer.prepareAudioTracks([normalizedAsset, silentAsset], spec);

  assert(audioResult.status === 'mixed', 'AudioMixer status is mixed');
  assert(audioResult.silentTracksInjected === 1, 'AudioMixer injected silent track for silent clip');
  assert(audioResult.tracks[1].audioCodec === 'anullsrc', 'Silent clip assigned anullsrc audio stream');

  // TEST 5: CompositionEngine Multi-Scene Rendering & Watermark Handling
  console.log('\nTest 5: CompositionEngine Multi-Scene Rendering & Watermark');
  const sceneAssets = [
    normalizedAsset,
    { ...normalizedAsset, sceneId: 'scene_02' },
    { ...normalizedAsset, sceneId: 'scene_03' },
  ];
  const compResult = await defaultCompositionEngine.composeVideo(sceneAssets, spec, {
    mockUrl: 'https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/test-comp.mp4',
  });

  assert(compResult.status === 'completed', 'Composition status is completed');
  assert(compResult.clipsCount === 3, 'Composition rendered 3 clips');
  assert(compResult.outputDuration === 15, 'Composition output duration equals 15s');
  assert(compResult.watermarkApplied === true, 'Single global brand watermark applied during composition');

  // TEST 6: FinalVideoValidator Verification
  console.log('\nTest 6: FinalVideoValidator Verification');
  const finalValidation = defaultFinalVideoValidator.validateFinalVideo(compResult, spec, [{}, {}, {}]);
  assert(finalValidation.valid === true, 'Final video passes quality validation');
  assert(finalValidation.validationStatus === 'valid', 'Validation status is valid');

  // TEST 7: Scene-Level Pipeline Execution with Verified Providers
  console.log('\nTest 7: Scene-Level Pipeline Execution with Verified Providers');
  const storyboard = [
    { sceneId: 's1', duration: 5, generationStrategy: 'GENERATIVE_VIDEO' },
    { sceneId: 's2', duration: 5, generationStrategy: 'REUSE_EXISTING_MEDIA' },
    { sceneId: 's3', duration: 5, generationStrategy: 'PROGRAMMATIC_GRAPHICS' },
  ];

  const pipelineResult = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: spec,
    storyboard,
    jobId: 'test-phase3-job',
    onStatus: () => {},
  });

  assert(pipelineResult.fallbackToMaster === false, 'Scene pipeline executed successfully without emergency fallback');
  assert(pipelineResult.scenes.length === 3, 'All 3 scenes executed and tracked');
  assert(pipelineResult.composition.status === 'completed', 'Final composition rendered successfully');

  // TEST 8: Emergency Single-Master Sora Fallback
  console.log('\nTest 8: Emergency Single-Master Sora Fallback');
  const corruptStoryboard = [
    { sceneId: 'err_s1', duration: 5, generationStrategy: 'INVALID_STRATEGY_TRIGGER_FALLBACK' },
  ];

  // Disable feature flag to force fallback verification
  featureFlags.SCENE_LEVEL_GENERATION_ENABLED = false;
  const fallbackResult = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: spec,
    storyboard: corruptStoryboard,
    jobId: 'fallback-job',
    onStatus: () => {},
  });
  featureFlags.SCENE_LEVEL_GENERATION_ENABLED = true;

  assert(fallbackResult.fallbackToMaster === true, 'Feature flag disabled clean emergency fallback to master prompt');

  console.log('\n====================================================');
  console.log(`ALL PHASE 3 TESTS PASSED SUCCESSFULLY (${passedTests}/${totalTests})`);
  console.log('====================================================');
}

runPhase3Tests().catch(err => {
  console.error('\n[PHASE 3 TEST FATAL ERROR]', err);
  process.exit(1);
});
