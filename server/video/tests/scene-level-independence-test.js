/**
 * server/video/tests/scene-level-independence-test.js
 *
 * Full Comprehensive Test Suite for Video Studio Generation Pipeline:
 * - Test 1: 15-Second Promotional Video
 * - Test 2: 30-Second Cinematic Nature Video (Misty pine forest at sunrise)
 * - Test 3: 60-Second Video (Narrative progression & dynamic planning)
 * - Test 4: 120-Second Masterclass (Long-form multi-scene structure & Character Bible)
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import featureFlags from '../../config/feature-flags.js';
import { defaultCreativeDirector } from '../creative-director/creative-director.service.js';
import { defaultStoryboardService } from '../storyboard/storyboard.service.js';
import { defaultScenePromptBuilder } from '../scene/scene-prompt-builder.js';
import { defaultJobOrchestrator } from '../jobs/job-orchestrator.service.js';
import { defaultSoraProvider } from '../providers/sora/sora-provider.js';
import { CONTENT_ARCHETYPES, classifyContentType, isSceneryOrSubjectWithoutPresenter } from '../context/scene-continuity.context.js';

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

async function runComprehensiveTests() {
  console.log('\n======================================================');
  console.log(' VIDEO STUDIO COMPREHENSIVE PIPELINE VERIFICATION SUITE');
  console.log('======================================================\n');

  featureFlags.SCENE_LEVEL_GENERATION_ENABLED = true;
  featureFlags.MEDIA_ROUTER_ENABLED = true;
  featureFlags.COMPOSITION_ENGINE_ENABLED = true;

  const localTestClip = path.resolve('client/dist/video-preview.mp4');

  let jobCounter = 1;
  const recordedSoraCalls = [];

  defaultSoraProvider.setGenerateFn(async ({ prompt, durationSeconds, aspectRatio }) => {
    recordedSoraCalls.push({ prompt, durationSeconds, aspectRatio });
    const id = `sora_gen_${Date.now()}_${jobCounter++}_${Math.random().toString(36).substring(2, 6)}`;
    return {
      video_id: id,
      video_url: `https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/${id}.mp4`,
      thumbnail_url: `https://creative-os-assets.s3.ap-south-1.amazonaws.com/thumbnails/${id}.png`,
      localPath: localTestClip,
      status: 'completed',
      duration: durationSeconds,
      providerGenerationDuration: durationSeconds,
      aspectRatio,
    };
  });

  // --------------------------------------------------------------------------
  // TEST 1: 15-Second Promotional Video
  // --------------------------------------------------------------------------
  console.log('------------------------------------------------------');
  console.log(' TEST 1: 15-Second Promotional Video');
  console.log('------------------------------------------------------');

  const promoPrompt = 'Create a 15-second high-energy promotional launch video for GrowthOS marketing automation.';
  const promoClassification = classifyContentType(promoPrompt, 'custom');
  assert(promoClassification === CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO, `Classification is PROMOTIONAL_VIDEO (got ${promoClassification})`);

  const promoSpec = await defaultCreativeDirector.createVideoSpec({
    prompt: promoPrompt,
    platform: 'instagram',
    aspectRatio: '9:16',
    duration: 15,
    mode: 'custom',
  });
  assert(promoSpec.duration === 15, 'Promo VideoSpec duration is 15s');

  const promoStoryboard = await defaultStoryboardService.generateStoryboard(promoSpec, promoPrompt);
  assert(Array.isArray(promoStoryboard), 'Promo Storyboard is an array');
  assert(promoStoryboard.length === 2, `Promo Storyboard has 2 scenes for 15s budget (got ${promoStoryboard.length})`);
  
  const promoTimelineSec = promoStoryboard.reduce((acc, s) => acc + (s.requestedTimelineDuration || s.duration), 0);
  assert(promoTimelineSec === 15, `Promo timeline durations sum to exactly 15s (got ${promoTimelineSec}s)`);
  assert(promoStoryboard.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'All promo scenes use valid Sora generation durations [4, 8, 12]');
  assert(promoStoryboard.every(s => s.generationStrategy === 'GENERATIVE_VIDEO'), 'All promo scenes use GENERATIVE_VIDEO');

  const promoScenePrompt = defaultScenePromptBuilder.buildSceneGenerationPrompt(promoStoryboard[0], promoSpec, 0, 2);
  assert(promoScenePrompt.includes('[BRAND & PURPOSE]') || promoScenePrompt.includes('[PRIMARY SUBJECT]'), 'Promo scene prompt contains Tier 1 Directive');
  assert(promoScenePrompt.includes('[SEQUENCE CONTINUITY]'), 'Promo scene prompt contains Tier 5 Sequence Continuity');

  const promoResult = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: promoSpec,
    storyboard: promoStoryboard,
    jobId: 'promo_15s_test',
  });
  assert(promoResult.fallbackToMaster === false, 'Promo pipeline executed without falling back to master');
  assert(promoResult.scenes.length === 2, 'Promo rendered exactly 2 scene clips');
  assert(promoResult.scenes.every(s => s.selectedProvider === 'sora'), 'All promo scenes routed to Sora generative video');
  assert(promoResult.scenes.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'Every promo scene asset records valid providerGenerationDuration (4, 8, 12s)');
  assert(promoResult.scenes.every(s => typeof s.actualAssetDuration === 'number' && s.actualAssetDuration > 0), 'Every promo scene asset records probed actualAssetDuration');

  // --------------------------------------------------------------------------
  // TEST 2: 30-Second Cinematic Nature Video
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(' TEST 2: 30-Second Cinematic Nature Video');
  console.log('------------------------------------------------------');

  const naturePrompt = 'A 30-second cinematic journey through a misty pine forest at sunrise, with soft golden rays piercing through tall evergreen trees, morning dew glistening on emerald moss, and gentle aerial tracking over a crystal-clear mountain stream.';
  
  const natureClassification = classifyContentType(naturePrompt, 'custom');
  assert(natureClassification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY, `Classification is CINEMATIC_NATURE_JOURNEY (got ${natureClassification})`);

  const natureIsSceneryOnly = isSceneryOrSubjectWithoutPresenter(naturePrompt);
  assert(natureIsSceneryOnly === true, 'Scenery only detection is TRUE for nature prompt');

  const natureSpec = await defaultCreativeDirector.createVideoSpec({
    prompt: naturePrompt,
    platform: 'youtube',
    aspectRatio: '16:9',
    duration: 30,
    mode: 'custom',
  });

  const continuity = natureSpec.continuityContext;
  assert(continuity.isSceneryOnly === true, 'Continuity isSceneryOnly is TRUE');
  assert(continuity.characterBible === null, 'CharacterBible is strictly NULL (no human presenter hallucinated)');
  assert(continuity.environmentBible.naturalElements.length >= 3, `Extracted natural elements (found ${continuity.environmentBible.naturalElements.join(', ')})`);

  const natureStoryboard = await defaultStoryboardService.generateStoryboard(natureSpec, naturePrompt);
  assert(natureStoryboard.length === 3, `Nature Storyboard has 3 scenes for 30s budget (got ${natureStoryboard.length})`);
  const natureTimelineSec = natureStoryboard.reduce((acc, s) => acc + (s.requestedTimelineDuration || s.duration), 0);
  assert(natureTimelineSec === 30, `Nature timeline durations sum to exactly 30s (got ${natureTimelineSec}s)`);
  assert(natureStoryboard.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'All nature scenes use valid Sora generation durations [4, 8, 12]');

  const allNatureDescriptions = natureStoryboard.map(s => `${s.visualDescription} ${s.action} ${s.camera}`).join(' ').toLowerCase();
  assert(allNatureDescriptions.includes('forest') || allNatureDescriptions.includes('pine') || allNatureDescriptions.includes('trees'), 'Storyboard scenes feature pine forest / evergreen trees');
  assert(allNatureDescriptions.includes('mist') || allNatureDescriptions.includes('morning') || allNatureDescriptions.includes('sunrise'), 'Storyboard scenes feature morning mist / sunrise');
  assert(allNatureDescriptions.includes('dew') || allNatureDescriptions.includes('moss') || allNatureDescriptions.includes('stream') || allNatureDescriptions.includes('water'), 'Storyboard scenes feature dew / moss / mountain stream');
  assert(!allNatureDescriptions.includes('recruiter') && !allNatureDescriptions.includes('hiring') && !allNatureDescriptions.includes('cloud dashboard'), 'Strictly no corporate/recruiter hallucination in nature scenes');

  const natureScenePrompt = defaultScenePromptBuilder.buildSceneGenerationPrompt(natureStoryboard[0], natureSpec, 0, 3);
  assert(natureScenePrompt.includes('misty pine forest') || natureScenePrompt.includes('pine forest') || natureScenePrompt.includes('sunrise'), 'Nature prompt preserves user pine forest / sunrise directives');
  assert(!natureScenePrompt.includes('Lead Presenter') && !natureScenePrompt.includes('crewneck'), 'Nature prompt does not contain human presenter anchor');

  const natureResult = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: natureSpec,
    storyboard: natureStoryboard,
    jobId: 'nature_30s_test',
  });
  assert(natureResult.fallbackToMaster === false, 'Nature pipeline executed without falling back to master');
  assert(natureResult.scenes.length === 3, 'Nature rendered exactly 3 scene clips');
  assert(natureResult.scenes.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'Nature scene assets all use supported generation durations');

  // --------------------------------------------------------------------------
  // TEST 3: 60-Second Video (Dynamic Narrative Progression)
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(' TEST 3: 60-Second Video (Dynamic Progression)');
  console.log('------------------------------------------------------');

  const video60Prompt = 'A 60-second product advertisement revealing a sleek luxury mechanical chronograph watch with sapphire crystal, precision gears, and luminous hands in an editorial studio.';
  const spec60 = await defaultCreativeDirector.createVideoSpec({
    prompt: video60Prompt,
    platform: 'instagram',
    aspectRatio: '9:16',
    duration: 60,
    mode: 'custom',
  });
  assert(spec60.duration === 60, '60s VideoSpec duration is 60s');

  const storyboard60 = await defaultStoryboardService.generateStoryboard(spec60, video60Prompt);
  assert(storyboard60.length === 6, `60s Storyboard has 6 scenes (got ${storyboard60.length})`);
  const totalTimeline60 = storyboard60.reduce((acc, s) => acc + (s.requestedTimelineDuration || s.duration), 0);
  assert(totalTimeline60 === 60, `60s timeline durations sum to exactly 60s (got ${totalTimeline60}s)`);
  assert(storyboard60.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'All 60s scenes use valid Sora generation durations [4, 8, 12]');

  const shotTypes60 = new Set(storyboard60.map(s => s.shotType));
  assert(shotTypes60.size >= 3, `Visual shot diversity achieved (${shotTypes60.size} unique shot types across 6 scenes)`);

  const result60 = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: spec60,
    storyboard: storyboard60,
    jobId: 'video_60s_test',
  });
  assert(result60.fallbackToMaster === false, '60s pipeline executed successfully');
  assert(result60.scenes.length === 6, '60s pipeline rendered 6 independent scene clips');
  const distinctSha256 = new Set(result60.scenes.map(s => s.sha256));
  assert(distinctSha256.size === 6, 'All 6 scene clips have distinct SHA-256 integrity hashes');

  // --------------------------------------------------------------------------
  // TEST 4: 120-Second (2-Minute) Educational Masterclass
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(' TEST 4: 120-Second Educational Masterclass (Long-Form Continuity)');
  console.log('------------------------------------------------------');

  const masterclassPrompt = 'A 120-second masterclass on cloud architecture and distributed microservices with a lead software architect wearing a charcoal turtleneck in a sunlit architectural studio.';
  const masterclassClassification = classifyContentType(masterclassPrompt, 'custom');
  assert(masterclassClassification === CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS, `Classification is EDUCATIONAL_MASTERCLASS (got ${masterclassClassification})`);

  const masterclassSpec = await defaultCreativeDirector.createVideoSpec({
    prompt: masterclassPrompt,
    platform: 'youtube',
    aspectRatio: '16:9',
    duration: 120,
    mode: 'custom',
  });
  assert(masterclassSpec.duration === 120, '120s VideoSpec duration is 120s');

  const masterclassContinuity = masterclassSpec.continuityContext;
  assert(masterclassContinuity.characterBible !== null, 'CharacterBible is created for masterclass presenter');
  assert(masterclassContinuity.characterBible.wardrobe.includes('turtleneck') || masterclassContinuity.characterBible.wardrobe.includes('charcoal'), `Wardrobe directive preserved (got: ${masterclassContinuity.characterBible.wardrobe})`);
  assert(masterclassContinuity.environmentBible.setting.includes('architectural studio') || masterclassContinuity.environmentBible.setting.includes('sunlit'), `Environment directive preserved (got: ${masterclassContinuity.environmentBible.setting})`);

  const storyboard120 = await defaultStoryboardService.generateStoryboard(masterclassSpec, masterclassPrompt);
  assert(storyboard120.length === 12, `120s Storyboard has 12 scenes (got ${storyboard120.length})`);
  const totalTimeline120 = storyboard120.reduce((acc, s) => acc + (s.requestedTimelineDuration || s.duration), 0);
  assert(totalTimeline120 === 120, `120s timeline durations sum to exactly 120s (got ${totalTimeline120}s)`);
  assert(storyboard120.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'All 120s scenes use valid Sora generation durations [4, 8, 12]');

  const allPrompts120 = storyboard120.map((s, idx) => defaultScenePromptBuilder.buildSceneGenerationPrompt(s, masterclassSpec, idx, 12));
  assert(allPrompts120.every(p => p.includes('turtleneck') || p.includes('IDENTITY LOCKED')), 'Every scene prompt reinforces character continuity and wardrobe');

  const result120 = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: masterclassSpec,
    storyboard: storyboard120,
    jobId: 'masterclass_120s_test',
  });
  assert(result120.fallbackToMaster === false, '120s pipeline executed successfully');
  assert(result120.scenes.length === 12, '120s pipeline rendered 12 independent scene clips');
  const distinctJobs120 = new Set(result120.scenes.map(s => s.providerJobId));
  assert(distinctJobs120.size === 12, 'All 12 scenes generated with unique providerJobIds');

  // --------------------------------------------------------------------------
  // TEST 5: Brand Persona Mode 15-Second Promotional Video Grounded in Company Purpose
  // --------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(' TEST 5: Brand Persona Mode 15-Second Promotional Video');
  console.log('------------------------------------------------------');

  const brandCompany = {
    _id: 'brand_123',
    companyName: 'PulseFit Wellness',
    tagline: 'Small habits. Stronger life.',
    productDescription: 'Sustainable fitness coaching and daily wellness routines for busy professionals.',
    industry: 'Health & Wellness',
    targetAudience: 'Busy working professionals',
    brandVoice: 'Encouraging, calm, and motivational',
    brandPrimaryColor: '#22C55E',
    brandSecondaryColor: '#FFF7ED',
    brandAccentColor: '#F97316',
    logo: 'https://res.cloudinary.com/dler14rdu/image/upload/v1778664345/creative-studio-os/logos/v6w6esbinzjbwwdklx1z.png',
  };

  const brandPersona = {
    id: 'persona_123',
    company: 'PulseFit Wellness',
    name: 'Wellness Champion',
    tagline: 'Small habits. Stronger life.',
    goals: 'Empower working professionals to build sustainable daily wellness and fitness habits without burnout.',
    notes: 'PulseFit Wellness promotes balance, realistic lifestyle improvement, and science-backed micro-habits.',
    products_services: '1-on-1 wellness coaching, daily micro-habit routines, and personalized mental health tracking.',
    value_proposition: 'Achieve lasting vitality and peak mental focus with effortless daily routines.',
    industry: 'Health & Wellness',
    audience: 'Busy working professionals seeking work-life wellness balance',
    voice: 'Encouraging, calm, trustworthy, supportive',
    brand_primary_color: '#22C55E',
    brand_secondary_color: '#FFF7ED',
    brand_accent_color: '#F97316',
    visual_style_instructions: 'Clean wellness aesthetic, soft natural lighting, modern fitness lifestyle visuals, calm colors.',
    tuning_prompt: 'Focus on consistency, mental wellness, realistic goals, and sustainable habits.',
    logo_url: 'https://res.cloudinary.com/dler14rdu/image/upload/v1778664345/creative-studio-os/logos/v6w6esbinzjbwwdklx1z.png',
    logo_placement: 'top-left',
  };

  const brandPrompt = 'Create a 15-second promotional video showcasing how we help professionals build healthy habits.';
  const brandSpec = await defaultCreativeDirector.createVideoSpec({
    prompt: brandPrompt,
    platform: 'instagram',
    aspectRatio: '9:16',
    duration: 15,
    mode: 'brand',
    companyPersona: brandPersona,
    company: brandCompany,
    logoUrl: brandPersona.logo_url,
    logoPlacement: brandPersona.logo_placement,
  });

  assert(brandSpec.mode === 'brand', 'VideoSpec mode is brand');
  assert(brandSpec.brandContext.brandName === 'PulseFit Wellness', 'VideoSpec captures brand name PulseFit Wellness');
  assert(brandSpec.brandContext.purpose.includes('Empower') || brandSpec.brandContext.purpose.includes('sustainable'), 'VideoSpec captures company purpose');
  assert(brandSpec.brandContext.colors.length === 3, 'VideoSpec captures 3 brand colors');
  assert(brandSpec.brandContext.logoRequired === true, 'Logo is required and configured');

  const brandStoryboard = await defaultStoryboardService.generateStoryboard(brandSpec, brandPrompt);
  assert(brandStoryboard.length === 2, `Brand Storyboard has 2 scenes for 15s budget (got ${brandStoryboard.length})`);
  assert(brandStoryboard.every(s => [4, 8, 12].includes(s.providerGenerationDuration)), 'All brand scenes use valid Sora generation durations [4, 8, 12]');

  const allBrandText = brandStoryboard.map(s => `${s.visualDescription} ${s.action} ${s.voiceover} ${s.title}`).join(' ');
  assert(allBrandText.includes('PulseFit Wellness') || allBrandText.includes('wellness') || allBrandText.includes('professionals'), 'Storyboard explicitly promotes PulseFit Wellness and its company purpose');

  const brandScenePrompt1 = defaultScenePromptBuilder.buildSceneGenerationPrompt(brandStoryboard[0], brandSpec, 0, 2);
  const brandScenePrompt2 = defaultScenePromptBuilder.buildSceneGenerationPrompt(brandStoryboard[1], brandSpec, 1, 2);
  assert(brandScenePrompt1.includes('[BRAND & PURPOSE]: PulseFit Wellness'), 'Scene 1 prompt starts with Tier 1 Brand & Purpose');
  assert(brandScenePrompt1.includes('[PRODUCT & VALUE]'), 'Scene 1 prompt includes Tier 3 Product & Value Proposition');
  assert(brandScenePrompt2.includes('#22C55E'), 'Scene 2 prompt includes brand primary color #22C55E');

  const brandResult = await defaultJobOrchestrator.executeSceneLevelPipeline({
    videoSpec: brandSpec,
    storyboard: brandStoryboard,
    jobId: 'brand_15s_promo_test',
  });
  assert(brandResult.fallbackToMaster === false, 'Brand pipeline executed successfully without master fallback');
  assert(brandResult.scenes.length === 2, 'Brand pipeline rendered 2 independent scene clips');

  // Verify all Sora calls across all tests strictly used supported durations (4, 8, 12)
  assert(recordedSoraCalls.every(call => [4, 8, 12].includes(Number(call.durationSeconds))), 'CRITICAL: Every Sora generation request strictly used supported durations [4, 8, 12]');

  console.log('\n======================================================');
  console.log(` FINAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});

