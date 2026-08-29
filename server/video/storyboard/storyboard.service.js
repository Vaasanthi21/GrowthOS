/**
 * server/video/storyboard/storyboard.service.js
 *
 * Storyboard Engine service decomposing VideoSpec JSON documents into
 * shot-by-shot scene cards with motion vectors, duration budgeting, shot variety,
 * educational narrative progression, and strict visual continuity anchors.
 */

import { validateSceneCard } from '../creative-director/spec-schema.js';
import { defaultLLMProvider } from '../creative-director/llm-provider.js';

export class StoryboardService {
  constructor(llmProvider = defaultLLMProvider) {
    this.llmProvider = llmProvider;
  }

  /**
   * Calculates target scene count and duration breakdown dynamically based on total video duration.
   * Ensures every scene clip duration is strictly <= 12s (Sora 2 clip limit) while scaling
   * seamlessly from 15s to 120s.
   */
  calculateSceneBudget(totalDurationSeconds = 15) {
    const total = Math.min(120, Math.max(4, Number(totalDurationSeconds) || 15));
    const maxClipSec = 12;

    if (total <= 6) {
      return { targetSceneCount: 1, sceneDurations: [total] };
    }
    if (total <= 12) {
      return { targetSceneCount: total <= 8 ? 1 : 2, sceneDurations: total <= 8 ? [total] : [Math.floor(total / 2), Math.ceil(total / 2)] };
    }
    if (total <= 18) {
      // 15s -> 3 scenes [5, 5, 5]
      const count = 3;
      const baseSec = Math.floor(total / count);
      let rem = total - baseSec * count;
      const durations = Array(count).fill(baseSec);
      for (let i = count - 1; i >= 0 && rem > 0; i--) { durations[i]++; rem--; }
      return { targetSceneCount: count, sceneDurations: durations };
    }

    // For >18s: Target ~10s per scene (e.g. 30s -> 3 scenes, 60s -> 6 scenes, 90s -> 9 scenes, 120s -> 12 scenes)
    const count = Math.min(12, Math.max(2, Math.round(total / 10)));
    const baseSec = Math.floor(total / count);
    let remainder = total - (baseSec * count);
    const durations = Array(count).fill(baseSec);
    for (let i = count - 1; i >= 0 && remainder > 0; i--) {
      durations[i]++;
      remainder--;
    }
    // Guarantee no single clip exceeds maxClipSec (12s)
    const safeDurations = durations.map(d => Math.min(d, maxClipSec));
    return { targetSceneCount: count, sceneDurations: safeDurations };
  }

  /**
   * Generates a shot-by-shot Storyboard from a validated VideoSpec with shot variety
   * and structured narrative progression.
   */
  async generateStoryboard(videoSpec, originalPrompt = '') {
    const totalDuration = videoSpec.duration || 15;
    const { targetSceneCount, sceneDurations } = this.calculateSceneBudget(totalDuration);
    const continuity = videoSpec.continuityContext || {};
    const characterDesc = continuity.characterBible?.anchorToken || continuity.characterIdentity?.appearance || 'Lead subject';
    const wardrobeDesc = continuity.characterBible?.wardrobe || 'Clean modern attire';
    const envDesc = continuity.environment?.setting || 'Modern studio space';
    const lightingDesc = continuity.environment?.lighting || 'Cinematic commercial studio lighting';

    const systemPrompt = `You are an elite film director, masterclass producer, and storyboard cinematographer.
Decompose the provided VideoSpec into an ordered array of ${targetSceneCount} distinct cinematic scene cards totaling ${totalDuration} seconds.

CRITICAL CONTINUITY MANDATE:
1. Main Character Consistency: Keep the EXACT SAME character identity and wardrobe (${wardrobeDesc}) in every scene where a person appears.
2. Setting Consistency: Keep the EXACT SAME environment setting (${envDesc}), lighting (${lightingDesc}), and color grade from Scene 1 to Scene ${targetSceneCount}.
3. Visual Shot Diversity: Do NOT use repetitive talking-head monologue shots. Alternate between:
   - Dynamic wide-angle tracking shots
   - Medium interactive shots (interacting with transparent architecture whiteboards / holographic diagrams)
   - Over-the-shoulder technical perspectives (cloud system diagrams, data telemetry screens)
   - Cinematic 360-degree orbital camera movements
   - Inspiring walking and collaborative workspace shots
4. Structured Narrative Progression:
   - Scene 1: Hook & Topic introduction
   - Middle Scenes: Systematic technical/educational progression (Problem -> Architecture -> Scaling -> Microservices -> Data Flow -> Benchmarks)
   - Final Scenes: Strategic takeaways & high-impact conclusion
5. All scenes MUST use "generationStrategy": "GENERATIVE_VIDEO".

Output strictly a JSON object with this schema:
{
  "scenes": [
    {
      "sceneId": "scene_01",
      "order": 1,
      "duration": 10,
      "purpose": "hook",
      "shotType": "WIDE_TRACKING | MEDIUM_INTERACTIVE | OVER_SHOULDER_TECH | CINEMATIC_ORBIT | COLLABORATIVE_WALK",
      "visualDescription": "Detailed visual framing, subject action in ${wardrobeDesc}, tech elements, environment",
      "action": "Specific kinetic action and body movement in frame",
      "camera": "Smooth cinematic camera motion vector",
      "lighting": "${lightingDesc}",
      "environment": "${envDesc}",
      "characters": ["${characterDesc}"],
      "objects": ["Interactive architecture screen", "Cloud diagram"],
      "dialogue": "",
      "voiceover": "Narrative speech audio for this scene",
      "soundEffects": ["ambient_tech"],
      "transition": "Cut",
      "references": [],
      "brandRequirements": [],
      "generationStrategy": "GENERATIVE_VIDEO"
    }
  ]
}`;

    const userPrompt = `ORIGINAL BRIEF: "${originalPrompt || videoSpec.objective}"
VIDEOSPEC:
Objective: ${videoSpec.objective}
Audience: ${videoSpec.audience}
Tone: ${videoSpec.tone}
Visual Style: ${videoSpec.visualStyle}
Platform: ${videoSpec.platform}
Mode: ${videoSpec.mode}
Brand Name: ${videoSpec.brandContext?.brandName || 'N/A'}
Character Continuity Anchor: ${characterDesc}
Wardrobe Anchor: ${wardrobeDesc}
Environment Continuity Anchor: ${envDesc}
Lighting Anchor: ${lightingDesc}
Target Scenes: ${targetSceneCount} scenes with durations [${sceneDurations.join(', ')}] seconds totaling ${totalDuration}s.`;

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

      const validatedScenes = rawScenes.map((scene, idx) => {
        const { normalizedScene } = validateSceneCard(scene, idx);
        if (sceneDurations[idx]) {
          normalizedScene.duration = sceneDurations[idx];
        }
        if (!normalizedScene.environment && envDesc) normalizedScene.environment = envDesc;
        if (!normalizedScene.lighting && lightingDesc) normalizedScene.lighting = lightingDesc;
        if ((!normalizedScene.characters || normalizedScene.characters.length === 0) && characterDesc) {
          normalizedScene.characters = [characterDesc];
        }
        // Ensure all cinematic scenes use GENERATIVE_VIDEO
        normalizedScene.generationStrategy = 'GENERATIVE_VIDEO';
        return normalizedScene;
      });

      return validatedScenes;
    } catch (err) {
      console.error('[STORYBOARD SERVICE ERROR] Failed to generate storyboard via LLM:', err.message);
      // Fallback deterministic storyboard with full narrative arc & shot variety
      return this.createFallbackStoryboard(videoSpec, originalPrompt);
    }
  }

  /**
   * Deterministic duration-aware fallback storyboard with rich narrative progression
   * and diverse shot archetypes supporting ANY prompt and ANY duration (15s to 120s).
   */
  createFallbackStoryboard(videoSpec, originalPrompt = '') {
    const totalDuration = videoSpec.duration || 15;
    const { targetSceneCount, sceneDurations } = this.calculateSceneBudget(totalDuration);
    const continuity = videoSpec.continuityContext || {};
    const characterDesc = continuity.characterBible?.anchorToken || continuity.characterIdentity?.appearance || 'Lead presenter';
    const wardrobeDesc = continuity.characterBible?.wardrobe || 'navy crewneck sweater';
    const envDesc = continuity.environment?.setting || 'Modern collaborative innovation workspace';
    const lightingDesc = continuity.environment?.lighting || 'Consistent commercial studio lighting with soft volumetric fill';

    const isBrand = videoSpec.mode === 'brand' && Boolean(videoSpec.brandContext?.brandName);
    const brandName = isBrand ? (videoSpec.brandContext?.brandName || 'Brand') : '';
    const brandPurpose = isBrand ? (videoSpec.brandContext?.purpose || videoSpec.brandContext?.productDescription || videoSpec.brandContext?.tagline || '') : '';
    const brandLower = `${brandName} ${brandPurpose}`.toLowerCase();
    const isUdenOrHR = isBrand && (brandLower.includes('uden') || brandLower.includes('hr') || brandLower.includes('recruit') || brandLower.includes('talent') || brandLower.includes('career') || brandLower.includes('student'));

    const topicClean = String(originalPrompt || videoSpec.objective || 'Cinematic Story').trim();

    let milestonePool;

    if (isBrand && isUdenOrHR) {
      milestonePool = [
        {
          purpose: 'hook_introduction',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: `${brandName} Talent Transformation & Platform Vision`,
          camera: 'Fluid forward tracking shot pushing smoothly past modern glass architectural elements',
          action: `${characterDesc} walks confidently through the innovation hub, engaging the camera with visionary focus on future careers and talent innovation.`,
          visual: `Dynamic opening wide tracking shot in ${envDesc}: ${characterDesc} introduces ${brandName}'s intelligent talent solutions and career ecosystems.`,
          objects: ['AI Talent Dashboard', 'Interactive glass metrics display'],
          voiceover: `Empowering global talent acquisition and career acceleration with ${brandName}.`,
        },
        {
          purpose: 'problem_and_challenge',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Solving Modern Recruitment Bottlenecks',
          camera: 'Medium tracking glide with shallow depth of field focusing on subject expressions',
          action: 'Presenter gestures toward an illuminated glass collaborative board, breaking down traditional hiring friction and campus placement gaps.',
          visual: `Medium cinematic shot in ${envDesc}: ${characterDesc} analyzing traditional recruitment delays and skill-matching challenges.`,
          objects: ['Hiring pipeline analytics', 'Talent bottleneck matrix'],
          voiceover: `Eliminating hiring friction with intelligent automated candidate discovery.`,
        },
        {
          purpose: 'core_architecture',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'AI Candidate Discovery & Skill Matching',
          camera: 'Over-the-shoulder perspective with soft optical bokeh and sharp foreground clarity',
          action: 'Subject manipulates glowing candidate skill graphs and verified talent profiles on high-definition interfaces.',
          visual: `Over-the-shoulder perspective in ${envDesc}: ${characterDesc} demonstrating ${brandName}'s automated talent discovery and verified candidate graphs.`,
          objects: ['Skill verification engine', 'Predictive match scorecard'],
          voiceover: `Real-time skill graph verification matching the right talent to top roles.`,
        },
        {
          purpose: 'data_ingestion_layer',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Seamless Campus-to-Career Pipeline',
          camera: 'Smooth 180-degree orbital camera arc with natural lens flare and atmospheric depth',
          action: 'Presenter showcases student career portals and seamless university recruitment pipelines glowing on modern interfaces.',
          visual: `Cinematic orbital shot in ${envDesc}: ${characterDesc} presenting unified campus recruitment and student career opportunities.`,
          objects: ['Campus recruitment interface', 'University partnership map'],
          voiceover: `Bridging academic talent directly into enterprise career opportunities.`,
        },
        {
          purpose: 'horizontal_scaling',
          shotType: 'COLLABORATIVE_WALK',
          title: 'Global Enterprise Recruitment Scale',
          camera: 'Smooth side-panning tracking shot capturing dynamic architectural movement',
          action: 'Presenter walks past glass architectural partitions as hiring teams and candidates connect seamlessly in background.',
          visual: `Dynamic tracking shot in ${envDesc}: ${characterDesc} demonstrating enterprise-grade hiring scaling across global organizations.`,
          objects: ['Global hiring topology', 'Multi-region talent network'],
          voiceover: `Scaling recruitment seamlessly from growing startups to Fortune 500 enterprises.`,
        },
        {
          purpose: 'workflow_implementation',
          shotType: 'COLLABORATIVE_WORKSPACE',
          title: 'Collaborative HR & Recruiter Dashboard',
          camera: 'Cinematic slider shot across a modern collaborative engineering table',
          action: 'Subject collaborates with HR leaders around an interactive digital talent dashboard, reviewing rapid hire metrics.',
          visual: `Collaborative workspace shot in ${envDesc}: ${characterDesc} reviewing automated interview screening workflows and candidate feedback loops.`,
          objects: ['Collaborative recruiter dashboard', 'Automated interview scheduler'],
          voiceover: `Empowering HR teams with automated screening and collaborative decision tools.`,
        },
        {
          purpose: 'fault_tolerance_resilience',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Verified Competency & Bias-Free Evaluation',
          camera: 'Direct medium push-in camera vector highlighting high reliability',
          action: 'Subject highlights verified assessment scores and bias-free candidate evaluation scorecards.',
          visual: `Focused medium shot in ${envDesc}: ${characterDesc} showcasing secure, verified skill assessments and high-retention hiring metrics.`,
          objects: ['Verified assessment telemetry', 'Diversity hiring scorecard'],
          voiceover: `Objective, data-driven candidate evaluations with verifiable skill metrics.`,
        },
        {
          purpose: 'analytics_telemetry',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'Predictive Hiring Analytics & ROI Insights',
          camera: 'Close gliding camera track across illuminated predictive hiring charts',
          action: 'Presenter points to real-time hiring velocity analytics and retention projections.',
          visual: `Over-the-shoulder tracking shot in ${envDesc}: ${characterDesc} analyzing predictive retention metrics and hiring speed improvements.`,
          objects: ['Predictive hiring engine', 'ROI analytics dashboard'],
          voiceover: `Actionable hiring intelligence delivering measurable performance and ROI.`,
        },
        {
          purpose: 'enterprise_security',
          shotType: 'COLLABORATIVE_WALK',
          title: 'Enterprise Compliance & Talent Security',
          camera: 'Smooth tracking motion along contemporary glass corridors',
          action: 'Subject walks alongside enterprise talent directors, reviewing privacy-first candidate protection protocols.',
          visual: `Dynamic corridor tracking shot in ${envDesc}: ${characterDesc} demonstrating enterprise-grade security and compliant data workflows.`,
          objects: ['Security certification matrix', 'Privacy shield protocol'],
          voiceover: `Enterprise-grade data security ensuring compliant, ethical talent pipelines.`,
        },
        {
          purpose: 'ecosystem_synergy',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Unified University & Corporate Ecosystem',
          camera: 'Sweeping 360-degree orbital rotation highlighting interconnected ecosystem nodes',
          action: 'Presenter highlights interconnected corporate partnerships and university networks glowing on digital visualizers.',
          visual: `Cinematic orbital sweep in ${envDesc}: ${characterDesc} revealing the expansive nationwide partner ecosystem.`,
          objects: ['Partner network visualization', 'Global university map'],
          voiceover: `Connecting universities, enterprises, and talent in a unified ecosystem.`,
        },
        {
          purpose: 'visionary_momentum',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Accelerating the Future of Work',
          camera: 'High-angle wide push-in capturing dynamic team energy and visionary focus',
          action: 'Subject moves toward the main observation floor as teams celebrate breakthrough hiring milestones.',
          visual: `Elevated wide shot in ${envDesc}: ${characterDesc} leading future-of-work innovation with visionary momentum.`,
          objects: ['Milestone celebratory visuals', 'Dynamic workforce hub'],
          voiceover: `Pioneering the next era of intelligent workforce transformation.`,
        },
        {
          purpose: 'grand_payoff_conclusion',
          shotType: 'SWEEPING_PAYOFF',
          title: `Empowering Careers & Growth with ${brandName}`,
          camera: 'Sweeping cinematic wide pull-back shot with ambient architectural illumination',
          action: `Presenter delivers an inspiring final payoff gesture as the entire ${brandName} innovation hub glows with warm volumetric light.`,
          visual: `Grand cinematic payoff shot in ${envDesc}: ${characterDesc} concluding the showcase under ${lightingDesc}, celebrating ${brandName}'s transformative impact.`,
          objects: ['Glowing brand insignia', 'Global career network'],
          voiceover: `Discover the future of talent innovation at ${brandName}.`,
        },
      ];
    } else if (isBrand) {
      milestonePool = [
        {
          purpose: 'hook_introduction',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: `${brandName} Innovation & Brand Vision`,
          camera: 'Fluid forward tracking shot pushing smoothly past modern glass architectural elements',
          action: `${characterDesc} walks confidently through the innovation workspace, introducing ${brandName}'s core mission with visionary focus.`,
          visual: `Dynamic opening wide tracking shot in ${envDesc}: ${characterDesc} introduces ${brandName} and its mission with commanding presence.`,
          objects: ['Interactive brand interface', 'Holographic system display'],
          voiceover: `Welcome to ${brandName} — pioneering intelligent solutions for the modern world.`,
        },
        {
          purpose: 'problem_and_challenge',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Industry Bottlenecks & Strategic Need',
          camera: 'Medium tracking glide with shallow depth of field focusing on subject expressions',
          action: 'Presenter gestures toward an illuminated glass collaborative board, analyzing core industry challenges.',
          visual: `Medium cinematic shot in ${envDesc}: ${characterDesc} breaking down industry pain points and the need for innovation.`,
          objects: ['Market analytics chart', 'Bottleneck breakdown'],
          voiceover: `Transforming legacy complexity into seamless operational advantage.`,
        },
        {
          purpose: 'core_architecture',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'Flagship Platform Capabilities',
          camera: 'Over-the-shoulder perspective with soft optical bokeh and sharp foreground clarity',
          action: 'Subject manipulates glowing 3D system interfaces displaying platform features and workflows.',
          visual: `Over-the-shoulder perspective in ${envDesc}: ${characterDesc} demonstrating ${brandName}'s flagship platform capabilities.`,
          objects: ['Core solution architecture', 'Interactive control console'],
          voiceover: `Next-generation technology engineered for speed, accuracy, and reliability.`,
        },
        {
          purpose: 'data_ingestion_layer',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Real-Time Impact & Telemetry',
          camera: 'Smooth 180-degree orbital camera arc with natural lens flare and atmospheric depth',
          action: 'Presenter showcases real-time performance telemetry and high-impact user results.',
          visual: `Cinematic orbital shot in ${envDesc}: ${characterDesc} presenting measurable value delivery and operational efficiency.`,
          objects: ['Real-time telemetry streams', 'Outcome metrics'],
          voiceover: `Delivering measurable outcomes and immediate competitive advantage.`,
        },
        {
          purpose: 'workflow_implementation',
          shotType: 'COLLABORATIVE_WORKSPACE',
          title: 'Collaborative Adoption & Enterprise Scale',
          camera: 'Cinematic slider shot across a modern collaborative engineering table',
          action: 'Subject coordinates with cross-functional teams, celebrating seamless rollout and user adoption.',
          visual: `Collaborative workspace shot in ${envDesc}: ${characterDesc} showcasing modern teamwork and community collaboration.`,
          objects: ['Collaborative workspace dashboard', 'Team roadmap'],
          voiceover: `Built for modern teams and frictionless enterprise scaling.`,
        },
        {
          purpose: 'scalability_layer',
          shotType: 'COLLABORATIVE_WALK',
          title: 'Global Performance & Scalability',
          camera: 'Smooth side-panning tracking shot capturing dynamic architectural movement',
          action: 'Presenter demonstrates continuous scalability and global infrastructure reliability.',
          visual: `Dynamic tracking shot in ${envDesc}: ${characterDesc} showcasing resilient global scale and performance.`,
          objects: ['Global topology map', 'Scale visualizer'],
          voiceover: `Engineered to perform effortlessly under global demand.`,
        },
        {
          purpose: 'precision_execution',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'Precision Tools & Intelligent Automation',
          camera: 'Focused macro perspective with sharp foreground detail and optical depth',
          action: 'Subject inspects high-precision workflow automation triggers and telemetry graphs.',
          visual: `Over-the-shoulder precision shot in ${envDesc}: ${characterDesc} demonstrating intelligent automated workflows.`,
          objects: ['Automation triggers', 'Precision controls'],
          voiceover: `Intelligent automation designed for uncompromising accuracy.`,
        },
        {
          purpose: 'ecosystem_integration',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Seamless Ecosystem Integration',
          camera: '180-degree orbital tracking shot with soft volumetric lighting',
          action: 'Presenter connects external API services and unified ecosystem components.',
          visual: `Cinematic orbital perspective in ${envDesc}: ${characterDesc} presenting unified platform connectivity.`,
          objects: ['API integration mesh', 'Cloud connectivity nodes'],
          voiceover: `Seamlessly integrating into your existing technical ecosystem.`,
        },
        {
          purpose: 'strategic_insights',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Strategic Insights & Intelligence',
          camera: 'Medium push-in highlighting authoritative subject focus',
          action: 'Subject reviews high-level strategic intelligence metrics and predictive forecasts.',
          visual: `Focused medium shot in ${envDesc}: ${characterDesc} reviewing strategic intelligence and executive insights.`,
          objects: ['Executive insight matrix', 'Predictive forecast chart'],
          voiceover: `Powering smarter decisions with deep predictive intelligence.`,
        },
        {
          purpose: 'transformative_impact',
          shotType: 'COLLABORATIVE_WORKSPACE',
          title: 'Transformative Customer Impact',
          camera: 'Cinematic glide across a collaborative strategy lounge',
          action: 'Presenter highlights breakthrough customer success stories and business transformations.',
          visual: `Collaborative workspace shot in ${envDesc}: ${characterDesc} showcasing customer impact and rapid value realization.`,
          objects: ['Impact scorecard', 'Customer journey board'],
          voiceover: `Accelerating growth and delivering lasting transformation.`,
        },
        {
          purpose: 'future_horizons',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Pioneering Future Horizons',
          camera: 'Expansive wide-angle camera push across modern architectural spaces',
          action: 'Subject looks ahead toward the luminous horizon as ambient light illuminates the space.',
          visual: `Elevated wide shot in ${envDesc}: ${characterDesc} looking forward into the future of the industry.`,
          objects: ['Futuristic architectural horizon', 'Volumetric illumination'],
          voiceover: `Pioneering the innovations that will shape tomorrow.`,
        },
        {
          purpose: 'grand_payoff_conclusion',
          shotType: 'SWEEPING_PAYOFF',
          title: `The Future with ${brandName}`,
          camera: 'Sweeping cinematic wide pull-back shot with ambient architectural illumination',
          action: `Presenter delivers an inspiring final payoff gesture as the entire ${envDesc} glows with volumetric light.`,
          visual: `Grand cinematic payoff shot in ${envDesc}: ${characterDesc} concluding the showcase under ${lightingDesc}, celebrating ${brandName}'s future vision.`,
          objects: ['Luminous brand insignia', 'Global network visualizer'],
          voiceover: `Build the future today with ${brandName}.`,
        },
      ];
    } else {
      // Universal Diverse Prompt Milestones (Custom Mode: Supercars, Nature, Culinary, Cyberpunk, Space, Action, Fitness, Sci-Fi, Storytelling)
      milestonePool = [
        {
          purpose: 'hook_introduction',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Opening Establishing Shot',
          camera: 'Dynamic forward tracking shot sweeping smoothly past foreground atmospheric elements',
          action: `The scene opens with an expansive establishing view of ${topicClean}, showcasing dramatic scale, rich atmosphere, and visual grandeur.`,
          visual: `Dynamic opening wide tracking shot of ${topicClean}, set in ${envDesc} under ${lightingDesc}.`,
          objects: ['Atmospheric foreground depth', 'Panoramic horizon'],
          voiceover: `A cinematic journey into ${topicClean}.`,
        },
        {
          purpose: 'environmental_exploration',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Core Subject Presence & Motion',
          camera: 'Smooth tracking glide with shallow depth of field focusing on central motion and subject presence',
          action: `The camera glides into the heart of ${topicClean}, capturing natural motion, environmental interplay, and captivating energy.`,
          visual: `Medium cinematic tracking shot capturing core movement and dynamic presence in ${topicClean} in ${envDesc}.`,
          objects: ['Central subject motion', 'Environmental textures'],
          voiceover: `Exploring the vibrant details and active momentum of the scene.`,
        },
        {
          purpose: 'macro_detail_depth',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'Atmospheric Micro-Textures & Reflections',
          camera: 'Low-angle gliding macro perspective with 35mm optical depth of field',
          action: `Intricate surface textures, optical reflections, and subtle atmospheric nuances of ${topicClean} come into sharp focus with lifelike fidelity.`,
          visual: `Close atmospheric cinematic glide highlighting intricate details, reflections, and rich textures of ${topicClean} in ${envDesc}.`,
          objects: ['Tactile micro-textures', 'Luminous light reflections'],
          voiceover: `Every intricate texture and reflection captured with stunning clarity.`,
        },
        {
          purpose: 'velocity_acceleration',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Dynamic Momentum & Velocity',
          camera: 'Fast dynamic tracking vector with kinetic energy and fluid motion vectors',
          action: `Action accelerates across ${topicClean}, showcasing powerful rhythm, speed, and continuous fluid progression.`,
          visual: `Kinetic wide tracking shot following rapid movement and dynamic energy across ${topicClean} in ${envDesc}.`,
          objects: ['High-speed motion lines', 'Dynamic spatial vectors'],
          voiceover: `Accelerating momentum and powerful visual flow through the environment.`,
        },
        {
          purpose: 'focal_engagement',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Central Focus & In-Depth Action',
          camera: 'Engaging medium push-in camera vector with optical bokeh and sharp foreground clarity',
          action: `The core action of ${topicClean} unfolds with deliberate mastery, highlighting pivotal moments and focal interactions.`,
          visual: `Focused medium shot capturing key moments and focal actions of ${topicClean} under ${lightingDesc}.`,
          objects: ['Core focal elements', 'Balanced foreground framing'],
          voiceover: `Deep dive into the heart of the action with captivating focus.`,
        },
        {
          purpose: 'midpoint_transformation',
          shotType: 'CINEMATIC_ORBIT',
          title: 'Atmospheric Shift & Light Transformation',
          camera: 'Smooth 180-degree orbital camera arc with natural lens flare and volumetric depth',
          action: `A dramatic shift in lighting and perspective transforms the mood of ${topicClean}, revealing new visual dimensions and rich tonal contrast.`,
          visual: `Cinematic orbital tracking shot capturing changing natural light patterns and rich tonal contrast in ${topicClean}.`,
          objects: ['Volumetric light rays', 'Dynamic ambient atmosphere'],
          voiceover: `A dramatic shift in light and atmosphere reveals new dimensions and depth.`,
        },
        {
          purpose: 'spatial_expansion',
          shotType: 'COLLABORATIVE_WALK',
          title: 'Expansive World & Surrounding Scale',
          camera: 'Smooth side-panning tracking shot capturing dynamic spatial movement',
          action: `The camera sweeps across a broader perspective of ${topicClean}, connecting the central subject with the surrounding expanse.`,
          visual: `Dynamic spatial tracking shot revealing the broader world and environmental scale of ${topicClean} in ${envDesc}.`,
          objects: ['Expansive world architecture', 'Surrounding atmospheric layers'],
          voiceover: `Expanding the horizon across a breathtaking landscape of possibilities.`,
        },
        {
          purpose: 'intricate_craftsmanship',
          shotType: 'OVER_SHOULDER_TECH',
          title: 'Nuance, Fluidity & Mastery',
          camera: 'Over-the-shoulder perspective with soft optical bokeh and sharp focus',
          action: `Intricate nuances and masterful fluidity of ${topicClean} are demonstrated with effortless grace and precision.`,
          visual: `Intimate over-the-shoulder perspective highlighting nuance, mastery, and fluid execution in ${topicClean}.`,
          objects: ['Nuanced micro-details', 'Precision focal elements'],
          voiceover: `Uncompromising craft and effortless execution in every single frame.`,
        },
        {
          purpose: 'rhythmic_crescendo',
          shotType: 'COLLABORATIVE_WORKSPACE',
          title: 'Climax Buildup & Rhythmic Energy',
          camera: 'Cinematic slider shot sweeping dynamically across foreground focal points',
          action: `Energy and visual rhythm build toward a high-impact peak across ${topicClean}, seamlessly harmonizing motion and composition.`,
          visual: `High-impact collaborative shot capturing synchronized motion and rhythmic buildup across ${topicClean}.`,
          objects: ['Synchronized dynamic movement', 'Luminous focal points'],
          voiceover: `Building toward an unforgettable crescendo of energy and momentum.`,
        },
        {
          purpose: 'peak_illumination',
          shotType: 'MEDIUM_INTERACTIVE',
          title: 'Peak Atmospheric Glow & Contrast',
          camera: 'Direct medium push-in camera vector capturing heightened dramatic illumination',
          action: `The visual journey reaches its peak brilliance, illuminated by radiant highlights and dramatic depth in ${topicClean}.`,
          visual: `Focused medium shot capturing the emotional peak and heightened visual contrast of ${topicClean} under ${lightingDesc}.`,
          objects: ['Radiant peak highlights', 'Dramatic contrast layers'],
          voiceover: `The pinnacle of the journey, glowing with vibrant, unforgettable energy.`,
        },
        {
          purpose: 'elevated_perspective',
          shotType: 'DYNAMIC_WIDE_TRACKING',
          title: 'Rising Aerial Elevation & Scope',
          camera: 'Sweeping crane tracking shot elevating slowly above the scene',
          action: `The perspective rises smoothly into the open air, revealing the full breathtaking scale of ${topicClean}.`,
          visual: `Sweeping elevated wide shot capturing the majestic grandeur and expansive scope of ${topicClean} in ${envDesc}.`,
          objects: ['Expansive vista', 'Majestic open sky'],
          voiceover: `A breathtaking perspective, rising above and transcending the ordinary.`,
        },
        {
          purpose: 'grand_payoff_conclusion',
          shotType: 'SWEEPING_PAYOFF',
          title: 'Grand Cinematic Resolution & Climax',
          camera: 'Grand cinematic pull-back panorama with ambient illumination and slow gentle fade',
          action: `The journey of ${topicClean} culminates in a magnificent final payoff as radiant ambient light envelops the entire composition.`,
          visual: `Grand cinematic pull-back panorama of ${topicClean} under ${lightingDesc}, concluding in peaceful, majestic resolution.`,
          objects: ['Vibrant concluding vista', 'Luminous ambient glow'],
          voiceover: `An extraordinary experience, leaving a lasting and indelible impression.`,
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
          // Find closest unused index to guarantee 100% distinct scene archetypes
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
      const duration = sceneDurations[idx] || 10;
      const isFirst = idx === 0;
      const isLast = idx === targetSceneCount - 1;

      const charactersList = continuity.isSceneryOnly ? [] : [characterDesc];

      const { normalizedScene } = validateSceneCard({
        sceneId: `scene_${String(idx + 1).padStart(2, '0')}`,
        order: idx + 1,
        duration,
        purpose: template.purpose,
        shotType: template.shotType,
        visualDescription: template.visual,
        action: template.action,
        camera: template.camera,
        lighting: lightingDesc,
        environment: envDesc,
        characters: charactersList,
        objects: template.objects || ['Atmospheric elements', 'Scenic landscape'],
        dialogue: '',
        voiceover: template.voiceover || (isFirst ? `Welcome to ${topicClean}.` : isLast ? `Discover the future today.` : `Exploring ${template.title}.`),
        soundEffects: ['ambient_sound_bed'],
        transition: isLast ? 'Fade out' : 'Cut',
        references: [],
        brandRequirements: isBrand ? [`Brand Name: ${brandName}`] : [],
        generationStrategy: 'GENERATIVE_VIDEO',
      }, idx);

      return normalizedScene;
    });
  }
}

export const defaultStoryboardService = new StoryboardService();

