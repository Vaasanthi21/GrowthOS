/**
 * server/video/tests/phase1-test.js
 *
 * Automated verification test suite for Phase 1 Creative Director & Storyboard Engine.
 */

import { validateVideoSpec, validateSceneCard } from '../creative-director/spec-schema.js';
import { CreativeDirectorService } from '../creative-director/creative-director.service.js';
import { StoryboardService } from '../storyboard/storyboard.service.js';
import { ScenePromptBuilder } from '../scene/scene-prompt-builder.js';
import { JobOrchestratorService } from '../jobs/job-orchestrator.service.js';

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

async function runPhase1Tests() {
  console.log('====================================================');
  console.log('RUNNING PHASE 1 INTEGRATION & UNIT TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Schema Validation (VideoSpec & Scene Cards)
  console.log('Test 1: VideoSpec & Scene Card Schema Validation');
  const validSpecResult = validateVideoSpec({
    version: '1.0',
    objective: 'Launch modern AI product',
    audience: 'Tech leaders',
    tone: 'Confident',
    visualStyle: 'Cinematic studio key light',
    duration: 30,
    aspectRatio: '16:9',
    platform: 'youtube',
    mode: 'brand',
    brandContext: { brandName: 'GrowthOS', colors: ['#2563EB'] },
  });
  assert(validSpecResult.valid === true, 'Valid VideoSpec passes schema validation');
  assert(validSpecResult.normalizedSpec.duration === 30, 'VideoSpec duration preserved');

  const validSceneResult = validateSceneCard({
    sceneId: 'scene_01',
    order: 1,
    duration: 5,
    purpose: 'hook',
    visualDescription: 'Dramatic close-up of AI neural dashboard',
    generationStrategy: 'GENERATIVE_VIDEO',
  }, 0);
  assert(validSceneResult.valid === true, 'Valid SceneCard passes validation');
  assert(validSceneResult.normalizedScene.generationStrategy === 'GENERATIVE_VIDEO', 'Generation strategy preserved');

  // TEST 2: Dynamic Storyboard Scene Budgeting & Duration Consistency (15s, 30s, 60s)
  console.log('\nTest 2: Dynamic Scene Budgeting & Duration Consistency');
  const storyboardService = new StoryboardService();
  
  const budget15 = storyboardService.calculateSceneBudget(15);
  const sum15 = budget15.sceneDurations.reduce((a, b) => a + b, 0);
  assert(budget15.targetSceneCount === 3, '15-second video creates 3 scenes');
  assert(sum15 === 15, '15-second storyboard scene durations sum exactly to 15s');

  const budget30 = storyboardService.calculateSceneBudget(30);
  const sum30 = budget30.sceneDurations.reduce((a, b) => a + b, 0);
  assert(budget30.targetSceneCount === 3, '30-second video creates 3 scenes');
  assert(sum30 === 30, '30-second storyboard scene durations sum exactly to 30s');

  const budget60 = storyboardService.calculateSceneBudget(60);
  const sum60 = budget60.sceneDurations.reduce((a, b) => a + b, 0);
  assert(budget60.targetSceneCount === 6, '60-second video creates 6 scenes');
  assert(sum60 === 60, '60-second storyboard scene durations sum exactly to 60s');

  // TEST 3: Creative Director Fallback & Deterministic Spec Generation
  console.log('\nTest 3: Creative Director Deterministic Fallback');
  const creativeDirector = new CreativeDirectorService();
  const fallbackSpec = creativeDirector.createFallbackVideoSpec({
    prompt: 'Launch enterprise cloud analytics',
    platform: 'linkedin',
    aspectRatio: '16:9',
    duration: 15,
    mode: 'brand',
    brandContext: { brandName: 'CloudMetrics', voice: 'Authoritative' },
  });
  assert(fallbackSpec.mode === 'brand', 'Fallback spec retains brand mode');
  assert(fallbackSpec.brandContext.brandName === 'CloudMetrics', 'Fallback spec retains brand context');
  assert(fallbackSpec.duration === 15, 'Fallback spec duration preserved as 15s');

  // TEST 4: Fallback Storyboard Generation
  console.log('\nTest 4: Fallback Storyboard Generation');
  const fallbackScenes = storyboardService.createFallbackStoryboard(fallbackSpec, 'Launch enterprise cloud analytics');
  const fallbackSum = fallbackScenes.reduce((acc, s) => acc + s.duration, 0);
  assert(fallbackScenes.length === 3, 'Fallback storyboard creates correct number of scenes for 15s');
  assert(fallbackSum === 15, 'Fallback storyboard scene total equals VideoSpec.duration (15s)');
  assert(fallbackScenes[0].purpose === 'hook', 'First scene purpose is hook');
  assert(fallbackScenes[fallbackScenes.length - 1].generationStrategy === 'PROGRAMMATIC_GRAPHICS', 'Last brand scene defaults to PROGRAMMATIC_GRAPHICS CTA card');

  // TEST 5: Scene Prompt Builder Integration with buildVideoPrompt()
  console.log('\nTest 5: Scene Prompt Builder Master Prompt Generation');
  const scenePromptBuilder = new ScenePromptBuilder();
  const masterPromptResult = scenePromptBuilder.buildMasterScenePrompt({
    videoSpec: fallbackSpec,
    scenes: fallbackScenes,
    rawTopic: 'Launch enterprise cloud analytics',
    platformObj: { label: 'LinkedIn', id: 'linkedin' },
    companyPersona: null,
  });
  assert(typeof masterPromptResult.masterPrompt === 'string' && masterPromptResult.masterPrompt.length > 50, 'Master prompt string generated');
  assert(masterPromptResult.masterPrompt.includes('Shot 1'), 'Master prompt contains structured shot-by-shot narrative');

  // TEST 6: Aspect Ratio Consistency Tests (9:16 + Instagram, 16:9 + YouTube, 1:1)
  console.log('\nTest 6: Aspect Ratio Consistency');
  const spec916 = validateVideoSpec({ aspectRatio: '9:16', platform: 'instagram', duration: 15 }).normalizedSpec;
  const scenes916 = storyboardService.createFallbackStoryboard(spec916, 'Test 9:16');
  const master916 = scenePromptBuilder.buildMasterScenePrompt({
    videoSpec: spec916,
    scenes: scenes916,
    rawTopic: 'Test 9:16',
    platformObj: { label: 'Instagram', id: 'instagram' },
  }).masterPrompt;
  assert(spec916.aspectRatio === '9:16', 'VideoSpec.aspectRatio is 9:16');
  assert(master916.includes('Aspect ratio: 9:16'), 'Master prompt contains Aspect ratio: 9:16');
  assert(!master916.includes('4:5'), 'Master prompt contains NO conflicting 4:5 instruction for 9:16 Instagram');

  const spec169 = validateVideoSpec({ aspectRatio: '16:9', platform: 'youtube', duration: 30 }).normalizedSpec;
  const scenes169 = storyboardService.createFallbackStoryboard(spec169, 'Test 16:9');
  const master169 = scenePromptBuilder.buildMasterScenePrompt({
    videoSpec: spec169,
    scenes: scenes169,
    rawTopic: 'Test 16:9',
    platformObj: { label: 'YouTube', id: 'youtube' },
  }).masterPrompt;
  assert(spec169.aspectRatio === '16:9', 'VideoSpec.aspectRatio is 16:9');
  assert(master169.includes('Aspect ratio: 16:9'), 'Master prompt contains Aspect ratio: 16:9');

  const spec11 = validateVideoSpec({ aspectRatio: '1:1', platform: 'instagram', duration: 15 }).normalizedSpec;
  const scenes11 = storyboardService.createFallbackStoryboard(spec11, 'Test 1:1');
  const master11 = scenePromptBuilder.buildMasterScenePrompt({
    videoSpec: spec11,
    scenes: scenes11,
    rawTopic: 'Test 1:1',
    platformObj: { label: 'Instagram', id: 'instagram' },
  }).masterPrompt;
  assert(spec11.aspectRatio === '1:1', 'VideoSpec.aspectRatio is 1:1');
  assert(master11.includes('Aspect ratio: 1:1'), 'Master prompt contains Aspect ratio: 1:1');
  assert(!master11.includes('4:5'), 'Master prompt contains NO conflicting 4:5 instruction for 1:1');

  // TEST 7: Job Orchestrator Status Mapping
  console.log('\nTest 7: Job Orchestrator Frontend Status Mapping');
  const orchestrator = new JobOrchestratorService();
  assert(orchestrator.mapToFrontendStatus('CREATED') === 'queued', 'CREATED maps to queued');
  assert(orchestrator.mapToFrontendStatus('PLANNING') === 'queued', 'PLANNING maps to queued');
  assert(orchestrator.mapToFrontendStatus('STORYBOARD_READY') === 'processing', 'STORYBOARD_READY maps to processing');
  assert(orchestrator.mapToFrontendStatus('COMPLETED') === 'completed', 'COMPLETED maps to completed');

  console.log('\n====================================================');
  console.log(`ALL PHASE 1 TESTS PASSED SUCCESSFULLY (${passedTests}/${totalTests})`);
  console.log('====================================================');
}

runPhase1Tests().catch((err) => {
  console.error('\n[TEST RUNNER FATAL ERROR]', err);
  process.exit(1);
});
