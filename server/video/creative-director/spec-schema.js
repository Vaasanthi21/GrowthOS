/**
 * server/video/creative-director/spec-schema.js
 *
 * Structural validator and schema definitions for VideoSpec and Storyboard.
 */

const VALID_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'];
const VALID_PLATFORMS = ['instagram', 'youtube', 'linkedin', 'facebook', 'x', 'threads', 'github'];
const VALID_MODES = ['brand', 'custom'];
const VALID_GENERATION_STRATEGIES = [
  'REUSE_EXISTING_MEDIA',
  'GENERATIVE_VIDEO',
  'PROGRAMMATIC_GRAPHICS',
  'HYBRID'
];

/**
 * Validates a VideoSpec JSON structure.
 * Returns { valid: boolean, errors: string[], normalizedSpec: object }
 */
export function validateVideoSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['VideoSpec must be an object'], normalizedSpec: null };
  }

  const reqDur = Number(spec.requestedDuration || spec.duration || 15);
  const effDur = Number(spec.effectiveDuration || spec.duration || reqDur);
  const provDur = Number(spec.providerDuration || effDur);

  const normalized = {
    version: String(spec.version || '1.0').trim(),
    objective: String(spec.objective || 'Create a high-impact social media video').trim(),
    audience: String(spec.audience || 'General target audience').trim(),
    tone: String(spec.tone || 'Professional').trim(),
    visualStyle: String(spec.visualStyle || 'Modern cinematic').trim(),
    duration: effDur,
    requestedDuration: reqDur,
    effectiveDuration: effDur,
    providerDuration: provDur,
    aspectRatio: VALID_ASPECT_RATIOS.includes(String(spec.aspectRatio).trim())
      ? String(spec.aspectRatio).trim()
      : '9:16',
    platform: VALID_PLATFORMS.includes(String(spec.platform).toLowerCase().trim())
      ? String(spec.platform).toLowerCase().trim()
      : 'instagram',
    mode: VALID_MODES.includes(String(spec.mode).toLowerCase().trim())
      ? String(spec.mode).toLowerCase().trim()
      : 'custom',
    brandContext: {
      brandId: spec.brandContext?.brandId ? String(spec.brandContext.brandId) : null,
      brandName: spec.brandContext?.brandName ? String(spec.brandContext.brandName) : '',
      tagline: String(spec.brandContext?.tagline || '').trim(),
      purpose: String(spec.brandContext?.purpose || spec.brandContext?.goals || spec.brandContext?.notes || '').trim(),
      productsServices: String(spec.brandContext?.productsServices || spec.brandContext?.products_services || spec.brandContext?.productDescription || '').trim(),
      valueProposition: String(spec.brandContext?.valueProposition || spec.brandContext?.value_proposition || '').trim(),
      industry: String(spec.brandContext?.industry || '').trim(),
      audience: String(spec.brandContext?.audience || '').trim(),
      productDescription: String(spec.brandContext?.productDescription || '').trim(),
      tuningPrompt: String(spec.brandContext?.tuningPrompt || spec.brandContext?.tuning_prompt || '').trim(),
      colors: Array.isArray(spec.brandContext?.colors) ? spec.brandContext.colors.map(String) : [],
      visualStyle: String(spec.brandContext?.visualStyle || '').trim(),
      voice: String(spec.brandContext?.voice || '').trim(),
      logoRequired: Boolean(spec.brandContext?.logoRequired),
      logoPlacement: String(spec.brandContext?.logoPlacement || 'none').trim(),
      logoUrl: String(spec.brandContext?.logoUrl || '').trim(),
    },
    audioPlan: {
      voiceover: spec.audioPlan?.voiceover !== false,
      music: spec.audioPlan?.music !== false,
      soundEffects: spec.audioPlan?.soundEffects !== false,
    },
    scenes: Array.isArray(spec.scenes) ? spec.scenes : [],
  };

  if (normalized.duration <= 0) {
    errors.push('Duration must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedSpec: normalized,
  };
}

/**
 * Validates a single Scene card object.
 */
export function validateSceneCard(scene, index = 0) {
  const errors = [];
  if (!scene || typeof scene !== 'object') {
    return { valid: false, errors: ['Scene card must be an object'], normalizedScene: null };
  }

  const normalized = {
    sceneId: String(scene.sceneId || `scene_${String(index + 1).padStart(2, '0')}`).trim(),
    order: Number(scene.order) || index + 1,
    duration: Number(scene.requestedTimelineDuration || scene.duration || 4),
    requestedTimelineDuration: Number(scene.requestedTimelineDuration || scene.duration || 4),
    providerGenerationDuration: Number(scene.providerGenerationDuration || (Number(scene.duration) <= 4 ? 4 : Number(scene.duration) <= 8 ? 8 : 12)),
    purpose: String(scene.purpose || 'hook').trim(),
    shotType: String(scene.shotType || 'MEDIUM_CINEMATIC').trim(),
    visualDescription: String(scene.visualDescription || scene.visual || '').trim(),
    action: String(scene.action || '').trim(),
    camera: String(scene.camera || 'Static medium shot').trim(),
    lighting: String(scene.lighting || 'Natural studio lighting').trim(),
    environment: String(scene.environment || 'Clean editorial background').trim(),
    characters: Array.isArray(scene.characters) ? scene.characters.map(String) : [],
    objects: Array.isArray(scene.objects) ? scene.objects.map(String) : [],
    dialogue: String(scene.dialogue || '').trim(),
    voiceover: String(scene.voiceover || '').trim(),
    soundEffects: Array.isArray(scene.soundEffects) ? scene.soundEffects.map(String) : [],
    transition: String(scene.transition || 'Cut').trim(),
    references: Array.isArray(scene.references) ? scene.references.map(String) : [],
    brandRequirements: Array.isArray(scene.brandRequirements) ? scene.brandRequirements.map(String) : [],
    generationStrategy: VALID_GENERATION_STRATEGIES.includes(scene.generationStrategy)
      ? scene.generationStrategy
      : 'GENERATIVE_VIDEO',
  };

  if (!normalized.visualDescription) {
    errors.push(`Scene ${normalized.sceneId} missing visualDescription`);
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedScene: normalized,
  };
}
