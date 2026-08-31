/**
 * server/video/storyboard/storyboard.service.js
 *
 * Storyboard Engine service decomposing VideoSpec JSON documents into
 * shot-by-shot scene cards with motion vectors, duration budgeting, shot variety,
 * educational narrative progression, and strict visual continuity anchors.
 */

import { validateSceneCard } from '../creative-director/spec-schema.js';
import { defaultLLMProvider } from '../creative-director/llm-provider.js';
import { CONTENT_ARCHETYPES } from '../context/scene-continuity.context.js';

export class StoryboardService {
  constructor(llmProvider = defaultLLMProvider) {
    this.llmProvider = llmProvider;
  }

  /**
   * Calculates target scene count, requested timeline durations, and provider-supported generation durations (4, 8, 12s)
   * dynamically based on total video duration and content archetype pacing.
   */
  calculateSceneBudget(totalDurationSeconds = 15, classification = null) {
    const total = Math.min(120, Math.max(4, Number(totalDurationSeconds) || 15));
    
    // Map discrete target video durations to compatible provider generation durations (4, 8, 12)
    // and exact requested timeline durations summing to totalDurationSeconds
    let budget = [];

    if (total <= 6) {
      budget = [
        { requestedTimelineDuration: total, providerGenerationDuration: 4 }
      ];
    } else if (total <= 10) {
      budget = [
        { requestedTimelineDuration: total, providerGenerationDuration: 8 }
      ];
    } else if (total <= 12) {
      budget = [
        { requestedTimelineDuration: total, providerGenerationDuration: 12 }
      ];
    } else if (total <= 18) {
      // 15s video: 2 scenes [8s, 7s] timeline, generated as 8s + 8s = 16s
      const count = 2;
      const baseSec = Math.floor(total / count);
      let rem = total - baseSec * count;
      budget = Array(count).fill(0).map((_, i) => {
        const tDur = baseSec + (i < rem ? 1 : 0);
        return {
          requestedTimelineDuration: tDur,
          providerGenerationDuration: 8,
        };
      });
    } else if (total <= 35) {
      // 30s video: 3 scenes [10s, 10s, 10s] timeline, generated as 12s + 12s + 12s = 36s
      const count = 3;
      const baseSec = Math.floor(total / count);
      let rem = total - baseSec * count;
      budget = Array(count).fill(0).map((_, i) => {
        const tDur = baseSec + (i < rem ? 1 : 0);
        return {
          requestedTimelineDuration: tDur,
          providerGenerationDuration: 12,
        };
      });
    } else if (total <= 65) {
      // 60s video: 6 scenes [10s each] timeline, generated as 6 x 12s = 72s
      const count = 6;
      const baseSec = Math.floor(total / count);
      let rem = total - baseSec * count;
      budget = Array(count).fill(0).map((_, i) => {
        const tDur = baseSec + (i < rem ? 1 : 0);
        return {
          requestedTimelineDuration: tDur,
          providerGenerationDuration: 12,
        };
      });
    } else {
      // 120s video: 12 scenes [10s each] timeline, generated as 12 x 12s = 144s
      const count = Math.min(12, Math.max(2, Math.round(total / 10)));
      const baseSec = Math.floor(total / count);
      let rem = total - baseSec * count;
      budget = Array(count).fill(0).map((_, i) => {
        const tDur = baseSec + (i < rem ? 1 : 0);
        return {
          requestedTimelineDuration: tDur,
          providerGenerationDuration: 12,
        };
      });
    }

    const targetSceneCount = budget.length;
    const sceneDurations = budget.map(b => b.requestedTimelineDuration);
    const generationDurations = budget.map(b => b.providerGenerationDuration);

    return {
      targetSceneCount,
      sceneDurations,
      generationDurations,
      budget,
    };
  }

  /**
   * Generates a shot-by-shot Storyboard from a validated VideoSpec with shot variety
   * and structured narrative progression tailored to the prompt's content archetype.
   */
  async generateStoryboard(videoSpec, originalPrompt = '') {
    const totalDuration = videoSpec.duration || 15;
    const continuity = videoSpec.continuityContext || {};
    const classification = continuity.contentClassification || CONTENT_ARCHETYPES.SOCIAL_MEDIA_CONTENT;
    const isSceneryOnly = continuity.isSceneryOnly;
    const userDirectives = continuity.userDirectives || {};

    const { targetSceneCount, sceneDurations, generationDurations, budget } = this.calculateSceneBudget(totalDuration, classification);

    const characterDesc = continuity.characterBible?.anchorToken || continuity.characterIdentity?.appearance || '';
    const wardrobeDesc = continuity.characterBible?.wardrobe || '';
    const envDesc = continuity.environment?.setting || userDirectives.environment || userDirectives.primarySubject || 'Scenic environment';
    const lightingDesc = continuity.environment?.lighting || userDirectives.lighting || 'Cinematic lighting with rich contrast';

    // Build archetype-specific system prompt guidelines
    let archetypeDirectives = '';
    let shotTypeOptions = '';

    switch (classification) {
      case CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY:
        archetypeDirectives = `
CONTENT ARCHETYPE: CINEMATIC NATURE JOURNEY
NARRATIVE BLUEPRINT:
- Scene 1: Grand Environmental Establishing Shot introducing the majesty and atmosphere of the landscape
- Middle Scenes: Progressive visual discovery exploring micro-textures (morning dew, glistening moss, foliage, clear streams) and fluid aerial exploration
- Climactic Scenes: Radiant sunlight / golden hour illumination transformation and sweeping aerial panoramic payoff
STRICT MANDATE: Forbid human presenters, corporate actors, and technical UI screens. Focus 100% on natural scenery, landscape discovery, atmospheric lighting, and organic motion.`;
        shotTypeOptions = 'AERIAL_PANORAMA | MACRO_FLORA_DETAIL | STREAM_TRACKING_GLIDE | LOW_ANGLE_FOREST | SUNBEAM_ORBIT | SWEEPING_MOUNTAIN_PAYOFF';
        break;

      case CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO:
        archetypeDirectives = `
CONTENT ARCHETYPE: PROMOTIONAL VIDEO (COMMERCIAL ADVERTISING BLUEPRINT)
NARRATIVE BLUEPRINT:
- Scene 1 [Attention / Dynamic Hook]: Hook the target audience immediately with high-energy visual action illustrating an ambitious goal or critical industry friction.
- Scene 2 [Problem / Struggle]: Over-the-shoulder or close-up perspective showing the friction of legacy methods and the need for a modern solution.
- Scene 3 [Breakthrough / Solution Introduction]: Wide establishing reveal showing the company/platform entering the workflow with purposeful energy.
- Scene 4 [Product & Service in Action]: Direct hands-on interaction showing the product/service in active real-world use with fast, fluid execution.
- Scene 5 [Core Value & Verification]: Visualizing intelligent capabilities, automated accuracy, and skill verification in real time.
- Scene 6 [Customer Transformation & Triumph]: Visible user achievement, confident smiles, breakthrough metrics, and celebratory momentum.
- Final Scene [Brand Payoff & Call-to-Action]: High-impact commercial payoff with inspiring brand visual and decisive CTA.
MANDATE: Depict real users/customers engaged in authentic real-world actions, using the product or service, solving hurdles, and achieving success. Do NOT default to an on-camera talking-head presenter standing in front of the camera. Focus on kinetic visuals, cinematic optics, and authentic human transformation.`;
        shotTypeOptions = 'DYNAMIC_HERO_HOOK | WIDE_ESTABLISHING | HUMAN_ACTION | PRODUCT_INTERACTION | OVER_THE_SHOULDER | CLOSE_UP_DETAIL | ENVIRONMENT_TRACKING | CINEMATIC_ORBIT | UI_INTERACTION | OUTCOME_SUCCESS | BRAND_PAYOFF';
        break;

      case CONTENT_ARCHETYPES.PRODUCT_ADVERTISEMENT:
        archetypeDirectives = `
CONTENT ARCHETYPE: PRODUCT ADVERTISEMENT
NARRATIVE BLUEPRINT:
- Scene 1: Hero Product Reveal with dramatic lighting and optical depth
- Middle Scenes: Precision Macro Details, Materials, and Active Product In-Use Demonstrations
- Final Scene: Ultimate Product Showcase & Commercial Brand Lockup`;
        shotTypeOptions = 'HERO_PRODUCT_REVEAL | MACRO_MATERIAL_DETAIL | DYNAMIC_LIFESTYLE_USE | ORBITAL_PRODUCT_GLIDE | PRODUCT_LOCKUP_CTA';
        break;

      case CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS:
        archetypeDirectives = `
CONTENT ARCHETYPE: EDUCATIONAL MASTERCLASS
NARRATIVE BLUEPRINT:
- Scene 1: Hook & Core Problem Introduction
- Middle Scenes: Structured Technical Breakdown, Methodologies, and Practical Demonstrations
- Final Scene: Key Strategic Takeaways & Summary Wrap`;
        shotTypeOptions = 'MEDIUM_PRESENTER | OVER_SHOULDER_DETAIL | COLLABORATIVE_DEMO | CONCEPT_BREAKDOWN | SUMMARY_WRAP';
        break;

      case CONTENT_ARCHETYPES.CORPORATE_VIDEO:
        archetypeDirectives = `
CONTENT ARCHETYPE: CORPORATE VIDEO
NARRATIVE BLUEPRINT:
- Scene 1: Inspiring Vision Statement & Brand Mission
- Middle Scenes: Collaborative Team Dynamics, Innovation Hub, and Global Impact
- Final Scene: Future Outlook and Empowering Closing Statement`;
        shotTypeOptions = 'VISIONARY_LEADERSHIP | COLLABORATIVE_TEAM | INNOVATION_HUB | GLOBAL_REACH | FUTURE_OUTLOOK';
        break;

      case CONTENT_ARCHETYPES.EXPLAINER:
        archetypeDirectives = `
CONTENT ARCHETYPE: EXPLAINER VIDEO
NARRATIVE BLUEPRINT:
- Scene 1: The Challenge / Question Hook
- Middle Scenes: The Mechanism of Action, How It Works, and Real-World Application
- Final Scene: Clear Tangible Results & Next Steps`;
        shotTypeOptions = 'PROBLEM_HOOK | MECHANISM_DEMO | STEP_BY_STEP_ACTION | REAL_WORLD_RESULTS | CONCLUSION';
        break;

      case CONTENT_ARCHETYPES.STORYTELLING:
        archetypeDirectives = `
CONTENT ARCHETYPE: STORYTELLING / CINEMATIC NARRATIVE
NARRATIVE BLUEPRINT:
- Scene 1: Inciting Incident & World Atmosphere
- Middle Scenes: Rising Action, Dynamic Exploration, and Climax Shift
- Final Scene: Meaningful Resolution & New Horizon`;
        shotTypeOptions = 'INCITING_MOMENT | RISING_JOURNEY | DRAMATIC_TURNING_POINT | CLIMACTIC_ACTION | POETIC_RESOLUTION';
        break;

      default:
        archetypeDirectives = `
CONTENT ARCHETYPE: SOCIAL MEDIA CONTENT
NARRATIVE BLUEPRINT:
- Scene 1: Viral Visual Hook
- Middle Scenes: Dynamic Action & Aesthetic Progression
- Final Scene: Engaging Payoff`;
        shotTypeOptions = 'VIRAL_HOOK | DYNAMIC_ACTION | AESTHETIC_DETAIL | ENGAGING_PAYOFF';
    }

    const systemPrompt = `You are an elite film director, cinematographer, and visual storyteller.
Decompose the provided VideoSpec and User Brief into an ordered array of ${targetSceneCount} distinct cinematic scene cards totaling ${totalDuration} seconds.

${archetypeDirectives}

CRITICAL CONTINUITY MANDATE:
1. User Brief Adherence: Every scene must strictly expand upon the user's brief ("${originalPrompt || videoSpec.objective}"). NEVER substitute with unrelated topics.
2. Setting & Environment Consistency: Maintain the exact environment setting (${envDesc}), lighting atmosphere (${lightingDesc}), and color grade across all scenes.
3. Character Consistency (where applicable): ${isSceneryOnly ? 'Strictly scenery/nature/objects only. Do NOT introduce human presenters.' : `Keep the exact same character identity (${characterDesc}) and wardrobe (${wardrobeDesc}).`}
4. Visual Shot Diversity: Ensure each scene uses a distinct, context-appropriate camera perspective from [${shotTypeOptions}].
5. All scenes MUST use "generationStrategy": "GENERATIVE_VIDEO".

Output strictly a JSON object with this schema:
{
  "scenes": [
    {
      "sceneId": "scene_01",
      "order": 1,
      "duration": 10,
      "purpose": "hook",
      "shotType": "${shotTypeOptions.split(' | ')[0]}",
      "visualDescription": "Detailed visual description strictly describing the scene action, subject, and environment",
      "action": "Specific kinetic action and movement in frame",
      "camera": "Smooth cinematic camera motion vector",
      "lighting": "${lightingDesc}",
      "environment": "${envDesc}",
      "characters": ${isSceneryOnly ? '[]' : `["${characterDesc}"]`},
      "objects": ["Key visual element 1", "Key visual element 2"],
      "dialogue": "",
      "voiceover": "Natural cinematic narration for this scene",
      "soundEffects": ["ambient_sound_bed"],
      "transition": "Cut",
      "references": [],
      "brandRequirements": [],
      "generationStrategy": "GENERATIVE_VIDEO"
    }
  ]
}`;

    const userPrompt = `ORIGINAL BRIEF: "${originalPrompt || videoSpec.objective}"
CONTENT CLASSIFICATION: ${classification}
IS SCENERY ONLY: ${isSceneryOnly}
ENVIRONMENT ANCHOR: ${envDesc}
LIGHTING ANCHOR: ${lightingDesc}
${!isSceneryOnly && characterDesc ? `CHARACTER ANCHOR: ${characterDesc}\nWARDROBE ANCHOR: ${wardrobeDesc}` : ''}
TARGET SCENES: ${targetSceneCount} scenes with durations [${sceneDurations.join(', ')}] seconds totaling ${totalDuration}s.`;

    let validatedScenes;
    try {
      const llmResult = await this.llmProvider.generateJSON({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
      });

      const rawScenes = Array.isArray(llmResult?.scenes) ? llmResult.scenes : [];
      if (rawScenes.length === 0) {
        throw new Error('LLM generated zero storyboard scenes.');
      }

      validatedScenes = rawScenes.map((scene, idx) => {
        const { normalizedScene } = validateSceneCard(scene, idx);
        const sceneBudget = budget[idx] || {
          requestedTimelineDuration: sceneDurations[idx] || 10,
          providerGenerationDuration: generationDurations[idx] || 12,
        };
        normalizedScene.requestedTimelineDuration = sceneBudget.requestedTimelineDuration;
        normalizedScene.providerGenerationDuration = sceneBudget.providerGenerationDuration;
        normalizedScene.duration = sceneBudget.requestedTimelineDuration;
        if (!normalizedScene.environment && envDesc) normalizedScene.environment = envDesc;
        if (!normalizedScene.lighting && lightingDesc) normalizedScene.lighting = lightingDesc;
        if (isSceneryOnly) {
          normalizedScene.characters = [];
        } else if ((!normalizedScene.characters || normalizedScene.characters.length === 0) && characterDesc) {
          normalizedScene.characters = [characterDesc];
        }
        normalizedScene.generationStrategy = 'GENERATIVE_VIDEO';
        return normalizedScene;
      });

      // Enrich with narrative handovers across sequential cuts
      validatedScenes.forEach((scene, idx) => {
        const prev = validatedScenes[idx - 1];
        const next = validatedScenes[idx + 1];
        if (prev) {
          scene.previousSceneSummary = `Preceding shot established ${prev.purpose} (${prev.shotType}): ${(prev.visualDescription || '').slice(0, 80)}`;
          scene.visualHandover = `Cut from ${prev.shotType} into ${scene.shotType}, maintaining lighting (${lightingDesc}) and color grade`;
        } else {
          scene.previousSceneSummary = 'Opening establishing sequence';
          scene.visualHandover = `Dynamic initial entry with ${scene.shotType}`;
        }
        if (next) {
          scene.nextSceneIntent = `Leads into ${next.purpose} (${next.shotType}): ${(next.visualDescription || '').slice(0, 80)}`;
          scene.narrativeHandover = `Propels narrative momentum toward ${next.purpose}`;
        } else {
          scene.nextSceneIntent = 'Final commercial payoff and brand resolution';
          scene.narrativeHandover = 'Resolves all narrative arcs into definitive brand conclusion';
        }
      });
    } catch (err) {
      console.error('[STORYBOARD SERVICE ERROR] Failed to generate storyboard via LLM:', err.message);
      // Fallback deterministic storyboard tailored to the content classification & prompt directives
      validatedScenes = this.createFallbackStoryboard(videoSpec, originalPrompt);
    }

    console.log(`[STORYBOARD] ${validatedScenes.length} scenes generated (Total timeline: ${totalDuration}s, Generation durations: [${validatedScenes.map(s => s.providerGenerationDuration + 's').join(', ')}])`);
    validatedScenes.forEach((s, i) => {
      console.log(`[STORYBOARD_SCENE] ${i + 1}/${validatedScenes.length} id=${s.sceneId} purpose="${s.purpose}" timeline=${s.requestedTimelineDuration}s gen=${s.providerGenerationDuration}s voiceover="${(s.voiceover || '').slice(0, 50)}..."`);
    });

    return validatedScenes;
  }

  /**
   * Deterministic duration-aware fallback storyboard with rich narrative progression
   * and diverse shot archetypes supporting ANY prompt, ANY archetype, and ANY duration (15s to 120s).
   */
  createFallbackStoryboard(videoSpec, originalPrompt = '') {
    const totalDuration = videoSpec.duration || 15;
    const continuity = videoSpec.continuityContext || {};
    const classification = continuity.contentClassification || CONTENT_ARCHETYPES.SOCIAL_MEDIA_CONTENT;
    const isSceneryOnly = continuity.isSceneryOnly;
    const userDirectives = continuity.userDirectives || {};

    const { targetSceneCount, sceneDurations, generationDurations, budget } = this.calculateSceneBudget(totalDuration, classification);

    const characterDesc = continuity.characterBible?.anchorToken || continuity.characterIdentity?.appearance || '';
    const wardrobeDesc = continuity.characterBible?.wardrobe || '';
    const envDesc = continuity.environment?.setting || userDirectives.environment || userDirectives.primarySubject || 'Scenic landscape';
    const lightingDesc = continuity.environment?.lighting || userDirectives.lighting || 'Cinematic natural lighting with rich contrast';

    const isBrand = videoSpec.mode === 'brand' || Boolean(videoSpec.brandContext?.brandName);
    const brandName = isBrand ? (videoSpec.brandContext?.brandName || 'Brand') : '';
    const brandPurpose = videoSpec.brandContext?.purpose || videoSpec.brandContext?.productDescription || 'delivering high-performance intelligent solutions';
    const productDesc = videoSpec.brandContext?.productsServices || videoSpec.brandContext?.productDescription || brandPurpose;
    const valueProp = videoSpec.brandContext?.valueProposition || videoSpec.brandContext?.tagline || 'measurable transformation and superior results';
    const targetAudience = videoSpec.brandContext?.audience || 'modern professionals and forward-thinking teams';
    const brandTagline = videoSpec.brandContext?.tagline || 'Leading the future';
    const topicClean = String(originalPrompt || videoSpec.objective || userDirectives.primarySubject || 'Cinematic Journey').trim();

    let milestonePool = [];

    if (classification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY) {
      milestonePool = [
        {
          purpose: 'hook_environmental_establishing',
          shotType: 'AERIAL_PANORAMA',
          title: `Establishing Grandeur of ${topicClean}`,
          camera: 'Gentle forward aerial tracking glide soaring smoothly over the expansive landscape',
          action: `The scene opens with a breathtaking wide panoramic establishing view of ${envDesc}, revealing dramatic natural scale and morning atmosphere under ${lightingDesc}.`,
          visual: `Expansive aerial wide establishing shot of ${envDesc} under ${lightingDesc}, with soft morning mist drifting through the valley.`,
          objects: ['Expansive mountain ridges', 'Tall evergreen canopy', 'Morning mist'],
          voiceover: `A breathtaking cinematic journey through ${topicClean}.`,
        },
        {
          purpose: 'progressive_visual_discovery',
          shotType: 'LOW_ANGLE_FOREST',
          title: 'Evergreen Forest & Morning Mist',
          camera: 'Smooth low-to-ground tracking glide moving fluidly past tall tree trunks',
          action: `The camera glides smoothly beneath the evergreen canopy, capturing the quiet serenity of the forest as soft mist weaves between ancient trees.`,
          visual: `Low-angle cinematic tracking shot through ${envDesc}, with morning mist curling around tall evergreen pine trunks under ${lightingDesc}.`,
          objects: ['Evergreen pine trunks', 'Atmospheric mist layers', 'Woodland floor'],
          voiceover: `Discovering the tranquil majesty of pristine nature at dawn.`,
        },
        {
          purpose: 'macro_flora_dew',
          shotType: 'MACRO_FLORA_DETAIL',
          title: 'Glistening Dew on Emerald Moss',
          camera: 'Intimate macro slider movement with shallow 35mm optical depth of field',
          action: `Intricate morning dew droplets glisten with crystalline clarity on vibrant emerald moss and delicate pine needles in the soft morning light.`,
          visual: `Cinematic macro shot of glistening morning dew droplets resting on vibrant emerald green moss under ${lightingDesc}.`,
          objects: ['Glistening dew droplets', 'Vibrant emerald moss', 'Pine needles'],
          voiceover: `Every glistening dewdrop reflects the quiet beauty of the morning light.`,
        },
        {
          purpose: 'mountain_stream_glide',
          shotType: 'STREAM_TRACKING_GLIDE',
          title: 'Crystal-Clear Mountain Stream',
          camera: 'Gentle low-altitude camera track skimming gracefully along flowing water currents',
          action: `The camera tracks smoothly along a crystal-clear mountain stream, catching shimmering light reflections as pure water flows over smooth river stones.`,
          visual: `Fluid tracking shot over a crystal-clear mountain stream flowing gracefully through ${envDesc} under ${lightingDesc}.`,
          objects: ['Crystal-clear flowing water', 'Smooth river stones', 'Shimmering water reflections'],
          voiceover: `Pure mountain waters flowing with effortless grace through the wilderness.`,
        },
        {
          purpose: 'atmospheric_sunbeam_orbit',
          shotType: 'SUNBEAM_ORBIT',
          title: 'Golden Sunbeams Through Canopy',
          camera: 'Smooth 180-degree orbital camera arc tilting gently upward toward the canopy',
          action: `Radiant golden sunbeams pierce through the evergreen tree crowns, creating dramatic volumetric light rays that illuminate the drifting morning mist.`,
          visual: `Cinematic orbital tracking shot capturing soft golden rays piercing through tall evergreen branches under ${lightingDesc}.`,
          objects: ['Volumetric golden sunbeams', 'Evergreen tree crowns', 'Illuminated mist particles'],
          voiceover: `Golden rays of morning sun pierce through the canopy, awakening the forest.`,
        },
        {
          purpose: 'forest_depth_exploration',
          shotType: 'FORWARD_GLIDE',
          title: 'Tranquil Woodland Canopy',
          camera: 'Slow continuous forward camera glide with natural optical depth',
          action: `The journey progresses deeper into the untouched forest, where verdant fern fronds, rich bark textures, and tranquil woodland ambience surround the view.`,
          visual: `Continuous forward tracking shot through lush woodland flora and tranquil natural landscape in ${envDesc}.`,
          objects: ['Verdant fern foliage', 'Ancient tree bark', 'Natural woodland textures'],
          voiceover: `Immersed in the timeless rhythm and stillness of the ancient woods.`,
        },
        {
          purpose: 'canopy_sunburst_reveal',
          shotType: 'UPWARD_TILT_REVEAL',
          title: 'Canopy Sunburst & Emerald Foliage',
          camera: 'Slow upward-tilting vertical glide into the towering treetops',
          action: `The camera tilts upward toward the towering evergreen crowns as a brilliant morning sunburst radiates through the emerald foliage.`,
          visual: `Upward-tilting cinematic shot gazing through tall evergreen pine trees into radiant sunrise sky under ${lightingDesc}.`,
          objects: ['Towering evergreen crowns', 'Brilliant morning sunburst', 'Azure sky'],
          voiceover: `Reaching toward the open sky as the morning sun crests the horizon.`,
        },
        {
          purpose: 'cascading_water_reflections',
          shotType: 'RIVER_CASCADE',
          title: 'Cascading Mountain Rapids',
          camera: 'Low-angle gliding perspective following cascading water currents',
          action: `The stream flows into gentle cascading rapids, sending delicate spray that catches the golden morning glow against dark mossy boulders.`,
          visual: `Dynamic low-angle tracking shot over cascading mountain rapids surrounded by emerald moss in ${envDesc}.`,
          objects: ['Cascading water rapids', 'Mossy river boulders', 'Luminous water spray'],
          voiceover: `Gentle mountain cascades singing with the vibrant energy of life.`,
        },
        {
          purpose: 'aerial_ridge_sweep',
          shotType: 'AERIAL_RIDGE_SWEEP',
          title: 'Aerial Sweep Over Evergreen Ridge',
          camera: 'Expansive high-altitude aerial tracking sweeping over alpine tree lines',
          action: `The viewpoint elevates across an alpine ridge, revealing endless miles of pristine evergreen forest rolling across mountain foothills.`,
          visual: `High-altitude aerial tracking shot sweeping across pine forest ridges toward distant mountain peaks under ${lightingDesc}.`,
          objects: ['Endless pine tree ridges', 'Mountain foothills', 'Panoramic vistas'],
          voiceover: `Endless vistas of untamed wilderness stretching toward the horizon.`,
        },
        {
          purpose: 'golden_hour_transformation',
          shotType: 'ATMOSPHERIC_TRANSFORMATION',
          title: 'Warm Golden Hour Illumination',
          camera: 'Slow panoramic orbit capturing shifting light gradients across the terrain',
          action: `The full warmth of the sunrise envelops the landscape, transforming emerald moss, mist, and mountain streams with rich amber and gold highlights.`,
          visual: `Atmospheric orbital shot capturing the landscape bathed in rich golden hour illumination under ${lightingDesc}.`,
          objects: ['Rich golden light gradients', 'Illuminated emerald moss', 'Glistening water surfaces'],
          voiceover: `Bathed in the warm embrace of golden morning light.`,
        },
        {
          purpose: 'elevated_vista_horizon',
          shotType: 'ELEVATED_VISTA',
          title: 'Rising Mountain Sunrise Panorama',
          camera: 'Sweeping crane elevation rising smoothly above the treetops',
          action: `The camera rises majestically into open mountain air, revealing the full grandeur of alpine peaks glowing under the rising sun.`,
          visual: `Sweeping elevated wide shot revealing glowing mountain peaks and expansive valleys in ${envDesc}.`,
          objects: ['Glowing alpine peaks', 'Expansive valley panorama', 'Golden dawn horizon'],
          voiceover: `A breathtaking spectacle of nature in its purest, most majestic form.`,
        },
        {
          purpose: 'grand_nature_payoff',
          shotType: 'SWEEPING_PAYOFF',
          title: 'Grand Cinematic Sunrise Resolution',
          camera: 'Grand pull-back aerial panorama with gentle fade and ambient atmospheric glow',
          action: `The cinematic journey culminates in an awe-inspiring wide panorama as golden morning rays illuminate the entire pine forest and mountain stream in timeless peace.`,
          visual: `Grand cinematic pull-back panorama of ${envDesc} bathed in glorious sunrise light under ${lightingDesc}.`,
          objects: ['Majestic panorama', 'Radiant sunrise glow', 'Peaceful natural expanse'],
          voiceover: `An unforgettable journey through the serene majesty of nature.`,
        },
      ];
    } else if (classification === CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO || isBrand) {
      milestonePool = [
        {
          purpose: 'hook_audience_aspiration',
          shotType: 'DYNAMIC_HERO_HOOK',
          title: `${brandName || 'Brand'} Hero Hook`,
          camera: 'Dynamic forward tracking push-in with optical stabilization and cinematic parallax',
          action: `High-energy visual sequence capturing the ambitious world of ${targetAudience}. Dynamic kinetic motion illustrates the challenge of complexity and the urgent demand for modern solutions.`,
          visual: `A focused professional in ${envDesc} engaging with high-stakes challenges, framed with dynamic lighting and kinetic camera push-in under ${lightingDesc}.`,
          objects: ['Flagship workspace elements', 'Dynamic ambient illumination'],
          voiceover: `In a fast-moving landscape, ${targetAudience} need more than promises — they need results.`,
        },
        {
          purpose: 'problem_and_inefficiency',
          shotType: 'OVER_THE_SHOULDER',
          title: 'Legacy Friction & Inefficiency',
          camera: 'Over-the-shoulder tracking glide with shallow 35mm depth of field',
          action: `Over-the-shoulder perspective capturing the friction of outdated manual workflows and the search for a smarter alternative.`,
          visual: `Focused atmospheric framing in ${envDesc} as manual friction and fragmented tools slow down progress, setting the stage for transformation.`,
          objects: ['Active workstation', 'Complex workflow cues'],
          voiceover: `Too much time is lost to outdated tools, slow processes, and guesswork.`,
        },
        {
          purpose: 'solution_breakthrough',
          shotType: 'WIDE_ESTABLISHING',
          title: `Introducing ${brandName || 'Solution'}`,
          camera: 'Expansive wide establishing glide with smooth horizontal drift',
          action: `Expansive architectural shot as ${brandName || 'the platform'} enters the scene, igniting momentum with purposeful clarity and intelligence.`,
          visual: `Sunlit innovation environment in ${envDesc} where modern teams transition into high-performance execution powered by ${brandName || topicClean}.`,
          objects: ['Architectural glass', 'Collaborative technology environment'],
          voiceover: `That’s why ${brandName || 'we'} engineered a better way: ${brandPurpose.slice(0, 80)}.`,
        },
        {
          purpose: 'product_in_action',
          shotType: 'PRODUCT_INTERACTION',
          title: `${productDesc.slice(0, 30)} In Action`,
          camera: 'Fluid forward slider shot capturing high kinetic momentum',
          action: `Direct hands-on interaction demonstrating ${productDesc.slice(0, 70)} executing with fluid responsiveness, precision, and speed.`,
          visual: `Close-up detail of user hands interacting with ${productDesc.slice(0, 50)} interface on sleek modern hardware with real-time feedback in ${envDesc}.`,
          objects: ['Modern hardware interface', 'Real-time feedback elements'],
          voiceover: `Experience ${productDesc.slice(0, 50)} built for seamless, intuitive execution.`,
        },
        {
          purpose: 'feature_deep_dive',
          shotType: 'UI_INTERACTION',
          title: 'Precision & Verification',
          camera: 'Smooth lateral slider tracking across active workspace',
          action: `Smooth lateral slider shot highlighting live benchmarking, automated precision, and validated accuracy in real time.`,
          visual: `Clean, responsive workflow view in ${envDesc} showing verified milestones, intelligent automation, and live accuracy metrics locking in.`,
          objects: ['Intelligent automation console', 'Live accuracy indicators'],
          voiceover: `Every capability is verified with speed, accuracy, and total confidence.`,
        },
        {
          purpose: 'value_proposition_acceleration',
          shotType: 'HUMAN_ACTION',
          title: 'Unlocking Value Proposition',
          camera: 'Kinetic tracking motion with rich optical depth',
          action: `Kinetic tracking shot of active users collaborating, accelerating turnaround times, and unlocking ${valueProp.slice(0, 70)}.`,
          visual: `Empowered professionals in ${envDesc} working with energized focus in a contemporary collaborative space, operating at peak efficiency.`,
          objects: ['Collaborative workspace', 'Team momentum'],
          voiceover: `Unlocking ${valueProp.slice(0, 70)} to fast-track your success.`,
        },
        {
          purpose: 'collaborative_momentum',
          shotType: 'ENVIRONMENT_TRACKING',
          title: 'Team Synergies & Speed',
          camera: 'Fluid tracking shot skimming gracefully past active workspaces',
          action: `Fluid tracking shot through a dynamic open workspace where cross-functional talent synchronizes efforts effortlessly.`,
          visual: `Atmospheric glide past engaged team members in ${envDesc} celebrating real-time breakthroughs and milestone completions.`,
          objects: ['Dynamic team environment', 'Milestone badges'],
          voiceover: `Seamlessly connecting talent, technology, and strategic vision.`,
        },
        {
          purpose: 'measurable_outcomes',
          shotType: 'CLOSE_UP_DETAIL',
          title: 'Surging Performance Metrics',
          camera: 'Low-angle macro glide capturing crisp surface details',
          action: `Intimate macro detail capturing upward surging performance indicators, verified completion badges, and triumphant growth curves.`,
          visual: `Crisp optical detail focusing on verified growth milestones and breakthrough success outcomes in ${envDesc}.`,
          objects: ['Surging performance indicators', 'Verified achievement markers'],
          voiceover: `Delivering measurable impact, exceptional quality, and transformative scale.`,
        },
        {
          purpose: 'customer_triumph',
          shotType: 'OUTCOME_SUCCESS',
          title: 'Customer Achievement & Triumph',
          camera: 'Inspiring medium portrait arc bathed in warm natural light',
          action: `A confident user or candidate smiles with genuine satisfaction after securing an exceptional outcome or breakthrough career milestone.`,
          visual: `Inspiring medium portrait in ${envDesc} bathed in natural warm light under ${lightingDesc}, capturing authentic human achievement and professional elevation.`,
          objects: ['Triumphant achievement moment', 'Warm ambient glow'],
          voiceover: `Transforming potential into verified career and business achievements.`,
        },
        {
          purpose: 'enterprise_ecosystem_trust',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Ecosystem Reach & Trust',
          camera: 'Dynamic 180-degree orbital camera arc with volumetric depth',
          action: `Dynamic orbital camera arc showcasing multiple global teams connected across the platform in unified momentum.`,
          visual: `Elevated cinematic orbit in ${envDesc} capturing the vast reach and reliability of the platform across modern industries.`,
          objects: ['Ecosystem connectivity', 'Global reach markers'],
          voiceover: `Trusted by industry leaders, growing enterprises, and ambitious professionals worldwide.`,
        },
        {
          purpose: 'aspirational_horizon',
          shotType: 'WIDE_ESTABLISHING',
          title: 'Limitless Future Horizon',
          camera: 'Expansive golden-hour skyline shot with gentle tilt-up',
          action: `Expansive horizon shot symbolizing limitless growth, continuous innovation, and the future of work.`,
          visual: `Panoramic horizon view with radiant warm lighting under ${lightingDesc}, projecting forward-thinking innovation and continuous ascent.`,
          objects: ['Panoramic horizon', 'Radiant sunrise atmosphere'],
          voiceover: `The future belongs to those who build with precision, intelligence, and ambition.`,
        },
        {
          purpose: 'closing_cta_payoff',
          shotType: 'BRAND_PAYOFF',
          title: 'Definitive Brand Payoff & CTA',
          camera: 'Grand cinematic pull-back shot resolving in clean commercial finish',
          action: `Final high-energy commercial payoff resolving in a clean, inspiring commercial finish celebrating ${brandName || topicClean} with ${brandTagline || 'excellence'}.`,
          visual: `Grand closing payoff composition in ${envDesc} celebrating ${brandName || topicClean} under ${lightingDesc}.`,
          objects: ['Inspiring focal horizon', 'Brand payoff elements'],
          voiceover: `${brandName || 'Join us today'}. ${brandTagline ? `${brandTagline}. ` : ''}Get started now.`,
        },
      ];
    } else if (classification === CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS) {
      milestonePool = [
        {
          purpose: 'hook_introduction',
          shotType: 'MEDIUM_PRESENTER',
          title: 'Masterclass Topic Introduction',
          camera: 'Authoritative medium push-in camera vector',
          action: `${characterDesc} introduces the core masterclass agenda on ${topicClean}.`,
          visual: `Engaging medium shot in ${envDesc}: ${characterDesc} introducing key insights on ${topicClean}.`,
          objects: ['Educational concept display', 'Interactive whiteboard'],
          voiceover: `Welcome to this comprehensive masterclass on ${topicClean}.`,
        },
        {
          purpose: 'foundational_breakdown',
          shotType: 'OVER_SHOULDER_DETAIL',
          title: 'Core Principles & Architecture',
          camera: 'Over-the-shoulder perspective with sharp foreground clarity',
          action: `Breaking down foundational concepts and architectural building blocks.`,
          visual: `Over-the-shoulder perspective in ${envDesc}: demonstrating fundamental principles of ${topicClean}.`,
          objects: ['System architecture diagram', 'Step-by-step framework'],
          voiceover: `Understanding the fundamental principles and architectural building blocks.`,
        },
        {
          purpose: 'deep_dive_demo',
          shotType: 'COLLABORATIVE_DEMO',
          title: 'In-Depth Demonstration',
          camera: 'Cinematic slider shot across interactive workspace',
          action: `Executing practical deep dive demonstrations and real-world workflows.`,
          visual: `Focused demonstration shot in ${envDesc}: analyzing hands-on implementation of ${topicClean}.`,
          objects: ['Practical code/demo console', 'Telemetry feedback'],
          voiceover: `Applying these concepts directly in real-world scenarios.`,
        },
        {
          purpose: 'strategic_summary',
          shotType: 'SUMMARY_WRAP',
          title: 'Key Takeaways & Conclusion',
          camera: 'Sweeping medium pull-back shot with warm lighting',
          action: `${characterDesc} summarizes the critical takeaways and strategic lessons learned.`,
          visual: `Inspiring summary shot in ${envDesc}: ${characterDesc} concluding the masterclass under ${lightingDesc}.`,
          objects: ['Key takeaways summary', 'Resource links'],
          voiceover: `Master these core strategies to achieve lasting excellence in ${topicClean}.`,
        },
      ];
    } else {
      // Universal Diverse Prompt Milestones (Custom Mode: Supercars, Sci-Fi, Storytelling, etc.)
      milestonePool = [
        {
          purpose: 'hook_introduction',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Opening Establishing Shot',
          camera: 'Dynamic forward tracking shot sweeping smoothly past foreground elements',
          action: `The scene opens with an expansive establishing view of ${topicClean}, showcasing scale and atmosphere under ${lightingDesc}.`,
          visual: `Dynamic opening wide tracking shot of ${topicClean}, set in ${envDesc} under ${lightingDesc}.`,
          objects: ['Atmospheric foreground depth', 'Panoramic horizon'],
          voiceover: `A cinematic journey into ${topicClean}.`,
        },
        {
          purpose: 'environmental_exploration',
          shotType: 'MEDIUM_TRACKING',
          title: 'Core Subject Presence & Motion',
          camera: 'Smooth tracking glide with shallow depth of field',
          action: `The camera glides into the heart of ${topicClean}, capturing natural motion and visual energy.`,
          visual: `Medium cinematic tracking shot capturing core movement and dynamic presence in ${topicClean} in ${envDesc}.`,
          objects: ['Central subject motion', 'Environmental textures'],
          voiceover: `Exploring the vibrant details and active momentum of the scene.`,
        },
        {
          purpose: 'macro_detail_depth',
          shotType: 'MACRO_DETAIL',
          title: 'Micro-Textures & Reflections',
          camera: 'Low-angle gliding macro perspective with 35mm optical depth of field',
          action: `Intricate surface textures and reflections of ${topicClean} come into sharp focus with lifelike fidelity.`,
          visual: `Close atmospheric cinematic glide highlighting intricate details and textures of ${topicClean} in ${envDesc}.`,
          objects: ['Tactile micro-textures', 'Luminous light reflections'],
          voiceover: `Every intricate texture captured with stunning clarity.`,
        },
        {
          purpose: 'velocity_acceleration',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Dynamic Momentum & Energy',
          camera: 'Fast dynamic tracking vector with kinetic energy',
          action: `Action accelerates across ${topicClean}, showcasing powerful rhythm and fluid progression.`,
          visual: `Kinetic wide tracking shot following rapid movement and dynamic energy across ${topicClean} in ${envDesc}.`,
          objects: ['High-speed motion lines', 'Dynamic spatial vectors'],
          voiceover: `Accelerating momentum and powerful visual flow through the environment.`,
        },
        {
          purpose: 'midpoint_transformation',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Atmospheric Shift & Lighting',
          camera: 'Smooth 180-degree orbital camera arc with volumetric depth',
          action: `A dramatic shift in lighting transforms the mood of ${topicClean}, revealing new visual dimensions.`,
          visual: `Cinematic orbital tracking shot capturing changing natural light patterns in ${topicClean}.`,
          objects: ['Volumetric light rays', 'Dynamic ambient atmosphere'],
          voiceover: `A dramatic shift in light reveals new dimensions and depth.`,
        },
        {
          purpose: 'grand_payoff_conclusion',
          shotType: 'SWEEPING_PAYOFF',
          title: 'Grand Cinematic Resolution',
          camera: 'Grand cinematic pull-back panorama with ambient illumination',
          action: `The journey of ${topicClean} culminates in a magnificent final payoff as ambient light envelops the composition.`,
          visual: `Grand cinematic pull-back panorama of ${topicClean} under ${lightingDesc}, concluding in peaceful resolution.`,
          objects: ['Vibrant concluding vista', 'Luminous ambient glow'],
          voiceover: `An extraordinary visual experience, leaving a lasting impression.`,
        },
      ];
    }

    // Select targetSceneCount unique milestones without repetition
    const selectedTemplates = [];
    const poolSize = milestonePool.length;

    if (targetSceneCount <= poolSize) {
      const step = (poolSize - 1) / (targetSceneCount - 1 || 1);
      const usedIndices = new Set();
      for (let i = 0; i < targetSceneCount; i++) {
        let idx = Math.round(i * step);
        if (usedIndices.has(idx)) {
          for (let offset = 1; offset < poolSize; offset++) {
            if (idx + offset < poolSize && !usedIndices.has(idx + offset)) {
              idx = idx + offset;
              break;
            } else if (idx - offset >= 0 && !usedIndices.has(idx - offset)) {
              idx = idx - offset;
              break;
            }
          }
        }
        usedIndices.add(idx);
        selectedTemplates.push(milestonePool[idx]);
      }
    } else {
      for (let i = 0; i < targetSceneCount; i++) {
        selectedTemplates.push(milestonePool[i % poolSize]);
      }
    }

    return selectedTemplates.map((template, idx) => {
      const sceneBudget = budget[idx] || {
        requestedTimelineDuration: sceneDurations[idx] || 10,
        providerGenerationDuration: generationDurations[idx] || 12,
      };
      const duration = sceneBudget.requestedTimelineDuration;
      const isFirst = idx === 0;
      const isLast = idx === targetSceneCount - 1;

      const charactersList = isSceneryOnly ? [] : (characterDesc ? [characterDesc] : []);

      const { normalizedScene } = validateSceneCard({
        sceneId: `scene_${String(idx + 1).padStart(2, '0')}`,
        order: idx + 1,
        duration,
        requestedTimelineDuration: sceneBudget.requestedTimelineDuration,
        providerGenerationDuration: sceneBudget.providerGenerationDuration,
        purpose: template.purpose,
        shotType: template.shotType,
        visualDescription: template.visual,
        action: template.action,
        camera: template.camera,
        lighting: lightingDesc,
        environment: envDesc,
        characters: charactersList,
        objects: template.objects || ['Atmospheric elements', 'Scenic textures'],
        dialogue: '',
        voiceover: template.voiceover || (isFirst ? `Welcome to ${topicClean}.` : isLast ? `An extraordinary experience.` : `Exploring ${template.title}.`),
        soundEffects: ['ambient_sound_bed'],
        transition: isLast ? 'Fade out' : 'Cut',
        references: [],
        brandRequirements: isBrand ? [`Brand Name: ${brandName}`] : [],
        generationStrategy: 'GENERATIVE_VIDEO',
      }, idx);

      normalizedScene.requestedTimelineDuration = sceneBudget.requestedTimelineDuration;
      normalizedScene.providerGenerationDuration = sceneBudget.providerGenerationDuration;
      return normalizedScene;
    });
  }
}

export const defaultStoryboardService = new StoryboardService();

