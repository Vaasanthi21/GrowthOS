/**
 * server/video/tests/scene-level-independence-test.js
 *
 * Dedicated regression test suite for independent scene-level provider generation,
 * duration separation (15s requested -> 5s+5s+5s scenes -> 15.0s final MP4),
 * distinct Sora providerJobIds, distinct SHA-256 hashes, and fallbackToMaster = false.
 */

import dotenv from 'dotenv';
dotenv.config();

import featureFlags from '../../config/feature-flags.js';
import { defaultCreativeDirector } from '../creative-director/creative-director.service.js';
import { defaultStoryboardService } from '../storyboard/storyboard.service.js';
import { defaultJobOrchestrator } from '../jobs/job-orchestrator.service.js';
import { defaultSoraProvider } from '../providers/sora/sora-provider.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' SCENE-LEVEL INDEPENDENCE & DURATION PRESERVATION REGRESSION TEST');
  console.log('======================================================\n');

  featureFlags.SCENE_LEVEL_GENERATION_ENABLED = true;
  featureFlags.MEDIA_ROUTER_ENABLED = true;
  featureFlags.COMPOSITION_ENGINE_ENABLED = true;

  // Register mock Sora generateFn returning distinct providerJobIds
  defaultSoraProvider.setGenerateFn(async ({ prompt, durationSeconds }) => {
    const id = `sora_live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      video_id: id,
      video_url: `https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/${id}.mp4`,
      thumbnail_url: `https://creative-os-assets.s3.ap-south-1.amazonaws.com/thumbnails/${id}.png`,
      status: 'completed',
    };
  });

  const prompt = 'Create a 15-second GrowthOS launch advertisement for Instagram in Brand Persona Mode.';
  const reqDuration = 15;
  const aspectRatio = '9:16';

  console.log('[1] Creating VideoSpec...');
  const videoSpec = await defaultCreativeDirector.createVideoSpec({
    prompt,
    platform: 'instagram',
    aspectRatio,
    duration: reqDuration,
    mode: 'brand',
  });

  assert(videoSpec.duration === 15, 'VideoSpec.duration is preserved at 15');
  assert(videoSpec.requestedDuration === 15, 'VideoSpec.requestedDuration is preserved at 15');

  console.log('\n[2] Generating Storyboard...');
  const storyboard = await defaultStoryboardService.generateStoryboard(videoSpec, prompt);

  assert(Array.isArray(storyboard), 'Storyboard is an array');
  assert(storyboard.length === 3, 'Storyboard contains 3 scenes for 15s budget');
  const totalBudget = storyboard.reduce((sum, s) => sum + s.duration, 0);
  assert(totalBudget === 15, `Storyboard scenes sum to exactly 15s (got ${totalBudget}s)`);

  console.log('\n[3] Executing Scene-Level Pipeline...');
  const result = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec,
    storyboard,
    jobId: 'test_independence_job_101',
    onStatus: (st) => console.log(`   [STATUS] ${st.phase} (${st.progress}%)`),
  });

  assert(result.fallbackToMaster === false, 'fallbackToMaster is false on successful scene-level execution');
  assert(result.fallbackReason === null, 'fallbackReason is null');
  assert(Array.isArray(result.scenes), 'Result contains scenes array');
  assert(result.scenes.length === 3, 'Result contains metadata for 3 completed scenes');

  const scene1 = result.scenes[0];
  const scene2 = result.scenes[1];
  const scene3 = result.scenes[2];

  console.log('\n[4] Verifying Scene 01 Metadata...');
  assert(scene1.selectedProvider === 'sora', 'Scene 01 provider is sora');
  assert(scene1.selectedModel === 'sora-2', 'Scene 01 model is sora-2');
  assert(scene1.assetClassification === 'GENERATED_ASSET', 'Scene 01 assetClassification is GENERATED_ASSET');
  assert(Boolean(scene1.providerJobId), `Scene 01 providerJobId exists (${scene1.providerJobId})`);
  assert(scene1.requestedDuration === 5, 'Scene 01 requestedDuration is 5');
  assert(scene1.providerDuration === 4, 'Scene 01 providerDuration is 4 (Azure Sora bound)');
  assert(scene1.normalizedDuration === 5, 'Scene 01 normalizedDuration is 5');

  console.log('\n[5] Verifying Scene 02 Metadata...');
  assert(scene2.selectedProvider === 'sora', 'Scene 02 provider is sora');
  assert(scene2.selectedModel === 'sora-2', 'Scene 02 model is sora-2');
  assert(scene2.assetClassification === 'GENERATED_ASSET', 'Scene 02 assetClassification is GENERATED_ASSET');
  assert(Boolean(scene2.providerJobId), `Scene 02 providerJobId exists (${scene2.providerJobId})`);
  assert(scene2.requestedDuration === 5, 'Scene 02 requestedDuration is 5');
  assert(scene2.providerDuration === 4, 'Scene 02 providerDuration is 4 (Azure Sora bound)');
  assert(scene2.normalizedDuration === 5, 'Scene 02 normalizedDuration is 5');

  console.log('\n[6] Verifying Scene 03 Metadata...');
  assert(scene3.selectedProvider === 'graphics', 'Scene 03 provider is graphics');
  assert(scene3.assetClassification === 'PROGRAMMATIC_ASSET', 'Scene 03 assetClassification is PROGRAMMATIC_ASSET');
  assert(scene3.normalizedDuration === 5, 'Scene 03 normalizedDuration is 5');

  console.log('\n[7] Verifying Independent Scene Asset Uniqueness...');
  assert(scene1.providerJobId !== scene2.providerJobId, 'Scene 01 providerJobId !== Scene 02 providerJobId');
  assert(scene1.assetUrl !== scene2.assetUrl, 'Scene 01 assetUrl !== Scene 02 assetUrl');
  assert(scene1.sha256 !== scene2.sha256, 'Scene 01 sha256 !== Scene 02 sha256');

  console.log('\n[8] Verifying Final Composed Video Output...');
  assert(result.composition !== null, 'Composition result exists');
  assert(result.composition.outputDuration === 15, 'Composed video outputDuration is exactly 15.0s');
  assert(result.composition.outputResolution === '720x1280', 'Composed video outputResolution is 720x1280 (9:16)');
  assert(Boolean(result.result.video_url), 'Final video_url is present');

  console.log('\n======================================================');
  console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
