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
   * Builds an enriched, high-continuity prompt for generating an individual scene clip.
   * Employs a 4-tier structure to guarantee character consistency and prompt preservation.
   */
  buildSceneGenerationPrompt(sceneCard = {}, videoSpec = {}, sceneIndex = 0, totalScenes = 1) {
    const continuity = videoSpec.continuityContext || {};
    const characterBible = continuity.characterBible || {};
    
    // Tier 1: Character Bible Anchor (Subject identity, face, hairstyle, exact wardrobe)
    const characterAnchor = characterBible.anchorToken || sceneCard.characters?.[0] || continuity.characterIdentity?.appearance || '';
    
    // Tier 2: Scene-Specific Action & Shot Dynamics
    const visualDesc = String(sceneCard.visualDescription || sceneCard.visual || videoSpec.objective || 'Cinematic scene').trim();
    const actionDesc = sceneCard.action ? `Action: ${sceneCard.action}.` : '';
    const cameraMotion = sceneCard.camera ? `Camera motion: ${sceneCard.camera}.` : 'Camera: smooth cinematic push-in.';
    const shotType = sceneCard.shotType ? `Shot framing: ${sceneCard.shotType}.` : '';

    // Tier 3: Environment Setting & Lighting Atmosphere
    const environmentAnchor = sceneCard.environment || continuity.environment?.setting || '';
    const lightingAnchor = sceneCard.lighting || continuity.environment?.lighting || 'Consistent commercial studio lighting';
    const colors = videoSpec.brandContext?.colors?.length
      ? videoSpec.brandContext.colors.join(', ')
      : (continuity.environment?.colorPalette || []).join(', ');

    // Tier 4: Cinematography Spec & Sequence Continuity Directive
    const visualStyle = videoSpec.visualStyle || 'Cinematic Hyper-Realism';
    const cinematography = continuity.visualStyle?.cinematography || 'Photorealistic optical depth, 35mm lens, shallow depth of field, commercial grade';
    const continuityDirective = totalScenes > 1
      ? `Sequence continuity: Continuous shot ${sceneIndex + 1} of ${totalScenes}. Maintain exact wardrobe, facial appearance, lighting, and background consistency.`
      : '';

    const promptTiers = [
      characterAnchor ? `${characterAnchor}` : null,
      `${shotType} ${visualDesc} ${actionDesc} ${cameraMotion}`.trim(),
      environmentAnchor ? `Setting: ${environmentAnchor}.` : null,
      lightingAnchor ? `Lighting atmosphere: ${lightingAnchor}.` : null,
      colors ? `Color palette: ${colors}.` : null,
      `Cinematic aesthetic: ${visualStyle}, ${cinematography}.`,
      continuityDirective || null,
    ];

    return promptTiers.filter(Boolean).join(' ');
  }
}

export const defaultScenePromptBuilder = new ScenePromptBuilder();

