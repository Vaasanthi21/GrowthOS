/**
 * server/video/scene/scene-prompt-builder.js
 *
 * Converts VideoSpec + Storyboard Scene Cards into authoritative scene-level prompts.
 * Enforces a 4-tier prompt structure prioritizing Character Bible identity,
 * user-specified wardrobe/environment, dynamic shot action, and sequence continuity.
 */

import { buildVideoPrompt } from '../../prompt-builders-optimized.js';

export class ScenePromptBuilder {
  /**
   * Combines structured VideoSpec and Storyboard Scenes into a unified cinematic prompt payload.
   */
  buildMasterScenePrompt({ videoSpec, scenes = [], rawTopic = '', platformObj = null, companyPersona = null }) {
    const storyboardNarrative = scenes.map((scene, idx) => {
      const sceneNum = idx + 1;
      const cameraMotion = scene.camera ? ` [Camera: ${scene.camera}]` : '';
      const lightingText = scene.lighting ? ` [Lighting: ${scene.lighting}]` : '';
      return `Shot ${sceneNum} (${scene.purpose}, ${scene.duration}s): ${scene.visualDescription}.${cameraMotion}${lightingText}`;
    }).join(' ');

    const basePrompt = buildVideoPrompt({
      platform: platformObj || { label: videoSpec.platform, id: videoSpec.platform },
      aspectRatio: videoSpec.aspectRatio || '9:16',
      topic: rawTopic || videoSpec.objective,
      companyPersona: companyPersona || (videoSpec.brandContext ? {
        company: videoSpec.brandContext.brandName,
        voice: videoSpec.brandContext.voice,
        audience: videoSpec.audience,
        visual_style_instructions: videoSpec.visualStyle,
        brand_primary_color: videoSpec.brandContext.colors?.[0] || '',
        brand_secondary_color: videoSpec.brandContext.colors?.[1] || '',
        brand_accent_color: videoSpec.brandContext.colors?.[2] || '',
        logo_placement: videoSpec.brandContext.logoPlacement || 'none',
        logo_url: videoSpec.brandContext.logoUrl || '',
      } : null),
      contentType: videoSpec.visualStyle,
      ragContext: '',
      keywords: '',
      variantTitle: videoSpec.objective,
      variantContent: storyboardNarrative,
    });

    return {
      masterPrompt: basePrompt,
      storyboardNarrative,
    };
  }

  /**
   * Builds an authoritative, high-continuity prompt for generating an individual scene clip.
   * Employs a strict 5-tier architecture prioritizing user-critical directives,
   * continuity bibles, scene-specific action, cinematic optics, and sequence continuity.
   */
  buildSceneGenerationPrompt(sceneCard = {}, videoSpec = {}, sceneIndex = 0, totalScenes = 1) {
    const continuity = videoSpec.continuityContext || {};
    const userDirectives = continuity.userDirectives || {};
    const characterBible = continuity.characterBible || {};
    const environmentBible = continuity.environment || continuity.environmentBible || {};
    const visualStyleBible = continuity.visualStyle || continuity.visualStyleBible || {};
    const isSceneryOnly = continuity.isSceneryOnly;

    // --- TIER 1: User-Critical Global Directives ---
    // Primary subject and immutable user keywords (e.g. misty pine forest, morning dew, emerald moss, mountain stream)
    const primarySubject = userDirectives.primarySubject || videoSpec.objective || '';
    const naturalElementsStr = Array.isArray(userDirectives.naturalElements) && userDirectives.naturalElements.length > 0
      ? userDirectives.naturalElements.join(', ')
      : '';
    const tier1Directives = [
      primarySubject ? `[PRIMARY SUBJECT]: ${primarySubject}` : null,
      naturalElementsStr ? `[CORE ELEMENTS]: ${naturalElementsStr}` : null,
    ].filter(Boolean).join('. ');

    // --- TIER 2: Character / Environment Continuity Context ---
    let tier2Continuity = '';
    if (!isSceneryOnly && characterBible.anchorToken) {
      tier2Continuity = characterBible.anchorToken;
    } else {
      const envSetting = sceneCard.environment || environmentBible.setting || userDirectives.environment || '';
      tier2Continuity = envSetting ? `[ENVIRONMENT]: ${envSetting}` : '';
    }

    // --- TIER 3: Scene-Specific Action & Narrative Purpose ---
    const shotType = sceneCard.shotType ? `[FRAMING: ${sceneCard.shotType}]` : '';
    const visualDesc = String(sceneCard.visualDescription || sceneCard.visual || primarySubject).trim();
    const actionDesc = sceneCard.action ? `Action: ${sceneCard.action}` : '';
    const tier3Action = `${shotType} ${visualDesc}. ${actionDesc}`.trim();

    // --- TIER 4: Camera, Lighting & Cinematic Instructions ---
    const cameraMotion = sceneCard.camera ? `Camera motion: ${sceneCard.camera}` : (userDirectives.cameraMovement ? `Camera: ${userDirectives.cameraMovement}` : 'Camera: smooth cinematic push-in');
    const lightingAnchor = sceneCard.lighting || environmentBible.lighting || userDirectives.lighting || 'Cinematic natural lighting';
    const visualStyle = visualStyleBible.aesthetic || videoSpec.visualStyle || 'Cinematic Hyper-Realism';
    const cinematography = visualStyleBible.cinematography || 'Photorealistic optical depth, 35mm anamorphic lens';
    const colors = videoSpec.brandContext?.colors?.length
      ? `Color palette: ${videoSpec.brandContext.colors.join(', ')}`
      : (environmentBible.colorPalette?.length ? `Color palette: ${environmentBible.colorPalette.join(', ')}` : null);

    const tier4Cinematics = [
      cameraMotion,
      `Lighting: ${lightingAnchor}`,
      colors,
      `Cinematic aesthetic: ${visualStyle}, ${cinematography}`,
    ].filter(Boolean).join('. ');

    // --- TIER 5: Scene Transition & Sequence Continuity Instructions ---
    let tier5Continuity = '';
    if (totalScenes > 1) {
      tier5Continuity = isSceneryOnly
        ? `[SEQUENCE CONTINUITY]: Shot ${sceneIndex + 1} of ${totalScenes}. Maintain exact environmental lighting, atmosphere, color grade, and landscape coordinates.`
        : `[SEQUENCE CONTINUITY]: Shot ${sceneIndex + 1} of ${totalScenes}. Maintain exact character facial bone structure, hairstyle, wardrobe, lighting, and background consistency.`;
    }

    const promptTiers = [
      tier1Directives || null,
      tier2Continuity || null,
      tier3Action || null,
      tier4Cinematics || null,
      tier5Continuity || null,
    ];

    return promptTiers.filter(Boolean).join('\n');
  }
}

export const defaultScenePromptBuilder = new ScenePromptBuilder();

