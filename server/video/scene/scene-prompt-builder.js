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
   * Employs a strict 5-tier architecture prioritizing company purpose / user-critical directives,
   * continuity bibles, scene-specific action, cinematic optics, and sequence continuity.
   */
  buildSceneGenerationPrompt(sceneCard = {}, videoSpec = {}, sceneIndex = 0, totalScenes = 1) {
    const continuity = videoSpec.continuityContext || {};
    const userDirectives = continuity.userDirectives || {};
    const characterBible = continuity.characterBible || {};
    const environmentBible = continuity.environment || continuity.environmentBible || {};
    const visualStyleBible = continuity.visualStyle || continuity.visualStyleBible || {};
    const isSceneryOnly = continuity.isSceneryOnly;

    const isBrand = videoSpec.mode === 'brand' || Boolean(videoSpec.brandContext?.brandName);
    const brandContext = videoSpec.brandContext || {};
    const brandName = brandContext.brandName || '';
    const brandPurpose = brandContext.purpose || brandContext.productDescription || brandContext.tagline || '';
    const productDesc = brandContext.productsServices || brandContext.productDescription || brandPurpose;
    const valueProp = brandContext.valueProposition || brandContext.tagline || '';
    const targetAudience = brandContext.audience || videoSpec.audience || 'Target Audience';
    const brandTagline = brandContext.tagline || '';

    // --- TIER 1: Company Purpose / User-Critical Directives ---
    let tier1Directives = '';
    if (isBrand && brandName) {
      tier1Directives = `[BRAND & PURPOSE]: ${brandName} — ${brandPurpose ? `${brandPurpose}` : `${brandTagline}`}`;
    } else {
      const primarySubject = userDirectives.primarySubject || videoSpec.objective || '';
      const naturalElementsStr = Array.isArray(userDirectives.naturalElements) && userDirectives.naturalElements.length > 0
        ? userDirectives.naturalElements.join(', ')
        : '';
      tier1Directives = [
        primarySubject ? `[PRIMARY SUBJECT]: ${primarySubject}` : null,
        naturalElementsStr ? `[CORE ELEMENTS]: ${naturalElementsStr}` : null,
      ].filter(Boolean).join('. ');
    }

    // --- TIER 2: Campaign Objective & Continuity Context ---
    let tier2Campaign = '';
    if (isBrand) {
      tier2Campaign = `[CAMPAIGN GOAL]: ${videoSpec.objective} | [SCENE ROLE: ${sceneCard.purpose || 'Promotional Showcase'}]`;
    } else if (!isSceneryOnly && characterBible.anchorToken) {
      tier2Campaign = characterBible.anchorToken;
    } else {
      const envSetting = sceneCard.environment || environmentBible.setting || userDirectives.environment || '';
      tier2Campaign = envSetting ? `[ENVIRONMENT]: ${envSetting}` : '';
    }

    // --- TIER 3: Product / Service / Value Proposition & Character ---
    let tier3ProductAndCharacter = '';
    if (isBrand) {
      const characterContext = !isSceneryOnly && characterBible.anchorToken ? characterBible.anchorToken : '';
      const valueStr = valueProp ? ` Value proposition: ${valueProp}.` : '';
      tier3ProductAndCharacter = `[PRODUCT & VALUE]: Demonstrating ${productDesc} tailored for ${targetAudience}.${valueStr}${characterContext ? ` ${characterContext}` : ''}`;
    } else {
      tier3ProductAndCharacter = !isSceneryOnly && characterBible.anchorToken ? characterBible.anchorToken : '';
    }

    // --- TIER 4: Scene-Specific Action & Narrative Purpose ---
    const shotType = sceneCard.shotType ? `[FRAMING: ${sceneCard.shotType}]` : '';
    const visualDesc = String(sceneCard.visualDescription || sceneCard.visual || userDirectives.primarySubject || videoSpec.objective).trim();
    const actionDesc = sceneCard.action ? `Action: ${sceneCard.action}` : '';
    const envSetting = sceneCard.environment || environmentBible.setting || userDirectives.environment || '';
    const envStr = envSetting ? ` Setting: ${envSetting}.` : '';
    const tier4Action = `[VISUAL ACTION]: ${shotType} ${visualDesc}. ${actionDesc}.${envStr}`.trim();

    // --- TIER 5: Camera, Lighting, Brand Colors & Cinematics ---
    const cameraMotion = sceneCard.camera ? `Camera motion: ${sceneCard.camera}` : (userDirectives.cameraMovement ? `Camera: ${userDirectives.cameraMovement}` : 'Camera: smooth cinematic push-in');
    const lightingAnchor = sceneCard.lighting || environmentBible.lighting || userDirectives.lighting || 'Cinematic natural lighting';
    const visualStyle = visualStyleBible.aesthetic || videoSpec.visualStyle || 'Cinematic Hyper-Realism';
    const cinematography = visualStyleBible.cinematography || 'Photorealistic optical depth, 35mm anamorphic lens';
    const colors = brandContext.colors?.length
      ? `Color palette: ${brandContext.colors.join(', ')}`
      : (environmentBible.colorPalette?.length ? `Color palette: ${environmentBible.colorPalette.join(', ')}` : null);

    let tier5Sequence = '';
    if (totalScenes > 1) {
      tier5Sequence = isSceneryOnly
        ? `[SEQUENCE CONTINUITY]: Shot ${sceneIndex + 1} of ${totalScenes}. Maintain exact environmental lighting, atmosphere, color grade, and landscape coordinates.`
        : `[SEQUENCE CONTINUITY]: Shot ${sceneIndex + 1} of ${totalScenes}. Maintain exact character facial bone structure, hairstyle, wardrobe, lighting, and background consistency.`;
    }

    const tier5Cinematics = [
      `[CINEMATICS]: ${cameraMotion}`,
      `Lighting: ${lightingAnchor}`,
      colors,
      `Aesthetic: ${visualStyle}, ${cinematography}`,
      tier5Sequence || null,
    ].filter(Boolean).join('. ');

    const promptTiers = [
      tier1Directives || null,
      tier2Campaign || null,
      tier3ProductAndCharacter || null,
      tier4Action || null,
      tier5Cinematics || null,
    ];

    const finalScenePrompt = promptTiers.filter(Boolean).join('\n');
    console.log(`[SCENE_PROMPT] Scene ${sceneIndex + 1}/${totalScenes} (${sceneCard.sceneId || 'scene_' + (sceneIndex + 1)}):\n${finalScenePrompt}`);
    return finalScenePrompt;
  }
}

export const defaultScenePromptBuilder = new ScenePromptBuilder();

