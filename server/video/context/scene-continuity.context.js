/**
 * server/video/context/scene-continuity.context.js
 *
 * Global Continuity Context and Directives Extraction attached to VideoSpec.
 * Preserves user-provided prompt directives (subject, environment, wardrobe, lighting, lenses)
 * as authoritative sources of truth and classifies content into specialized narrative archetypes.
 */

export const CONTENT_ARCHETYPES = {
  CINEMATIC_NATURE_JOURNEY: 'CINEMATIC_NATURE_JOURNEY',
  PROMOTIONAL_VIDEO: 'PROMOTIONAL_VIDEO',
  PRODUCT_ADVERTISEMENT: 'PRODUCT_ADVERTISEMENT',
  EDUCATIONAL_MASTERCLASS: 'EDUCATIONAL_MASTERCLASS',
  CORPORATE_VIDEO: 'CORPORATE_VIDEO',
  EXPLAINER: 'EXPLAINER',
  STORYTELLING: 'STORYTELLING',
  SOCIAL_MEDIA_CONTENT: 'SOCIAL_MEDIA_CONTENT',
};

/**
 * Classifies prompt into one of 8 distinct content archetypes.
 */
export function classifyContentType(promptText = '', mode = 'custom') {
  const text = String(promptText || '').toLowerCase();

  // 1. Nature & Environmental Journeys
  const natureKeywords = /\b(misty|pine forest|forest|trees|evergreen|woods|mountain|mountains|stream|river|waterfall|lake|ocean|sea|beach|waves|sunrise|sunset|golden hour|dew|moss|jungle|rainforest|glacier|canyon|valley|wildlife|birds|animals|clouds|storm|underwater|coral|aurora|landscape|scenic journey|nature)\b/i;
  const humanTechKeywords = /\b(presenter|speaker|founder|architect|interview|recruit|talent|hr|software|dashboard|student|hiring|company|business|app|saas|pricing|discount|sale)\b/i;

  if (natureKeywords.test(text) && !humanTechKeywords.test(text) && mode !== 'brand') {
    return CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY;
  }

  // 2. Product Advertisement / Showcase
  if (/\b(product|perfume|sneaker|shoes|watch|bottle|beverage|drink|coffee|skincare|cosmetics|gadget|hardware|smartphone|phone|device|car commercial|automobile|unboxing|showcase|feature highlight)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.PRODUCT_ADVERTISEMENT;
  }

  // 3. Educational Masterclass / Technical Tutorial
  if (/\b(masterclass|tutorial|course|lecture|system design|deep dive|step by step|how to build|guide|explaining architecture|lesson|curriculum|learn)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS;
  }

  // 4. Promotional Video / Commercial Launch
  if (/\b(promotional|promo|launch|special offer|discount|sale|campaign|join now|get started|announcing|introducing|unlock your|accelerate your|elevate your|transform your)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO;
  }

  // 5. Corporate Video / Company Vision
  if (/\b(corporate|company culture|investor|quarterly|enterprise vision|our mission|our team|global leadership|annual review)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.CORPORATE_VIDEO;
  }

  // 6. Explainer / Problem-Solution Breakdown
  if (/\b(explainer|how it works|problem and solution|breakdown|mechanism of action|overview|walkthrough)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.EXPLAINER;
  }

  // 7. Storytelling / Cinematic Narrative
  if (/\b(story|tale|journey of|epic narrative|drama|cinematic sequence|chronicle|legend)\b/i.test(text)) {
    return CONTENT_ARCHETYPES.STORYTELLING;
  }

  // Default: Brand mode defaults to Promotional, Custom defaults to Social Media Content
  return mode === 'brand' ? CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO : CONTENT_ARCHETYPES.SOCIAL_MEDIA_CONTENT;
}

/**
 * Checks if the prompt describes scenery, nature, architecture, objects, or vehicles without a human presenter.
 */
export function isSceneryOrSubjectWithoutPresenter(text = '') {
  const lower = String(text || '').toLowerCase();
  const humanKeywords = /\b(person|man|woman|guy|girl|actor|presenter|speaker|host|narrator|expert|founder|architect|engineer|developer|executive|student|chef|doctor|astronaut|model|individual|team|recruiter|leader)\b/i;
  if (humanKeywords.test(lower)) return false;

  const sceneryKeywords = /\b(forest|pine|mist|misty|trees|sunrise|sunset|golden hour|sunlight|sun rays|dew|moss|stream|river|mountain|mountains|landscape|ocean|sea|beach|waterfall|clouds|sky|drone|aerial|timelapse|nature|jungle|space|galaxy|nebula|cityscape|architecture|building|car|vehicle|abstract|product|watch|perfume|bottle)\b/i;
  return sceneryKeywords.test(lower);
}

/**
 * Determines whether a dedicated, persistent presenter / talking-head character is strictly required.
 * Returns true ONLY IF:
 * 1. The prompt explicitly specifies an on-camera presenter, speaker, instructor, host, or actor talking to camera.
 * 2. OR the content archetype is explicitly EDUCATIONAL_MASTERCLASS.
 * Returns false for PROMOTIONAL_VIDEO, PRODUCT_ADVERTISEMENT, CINEMATIC_NATURE_JOURNEY, EXPLAINER, and general commercials.
 */
export function requiresPresenter(text = '', mode = 'custom', classification = null) {
  const lower = String(text || '').toLowerCase();
  
  // Explicit presenter tokens
  const explicitPresenterTokens = /\b(presenter|spokesperson|talking head|talking-head|host|instructor|speaker|anchor|on-camera presenter|on-camera speaker|monologue|speech by|addressing camera)\b/i;
  if (explicitPresenterTokens.test(lower)) {
    return true;
  }

  // Educational masterclasses structurally require an instructor
  if (classification === CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS) {
    return true;
  }

  return false;
}

/**
 * Extracts structured user directives directly from the prompt text.
 */
export function extractUserDirectives(promptText = '', mode = 'custom', brandContext = {}) {
  const text = String(promptText || '').trim();
  const lower = text.toLowerCase();

  const classification = classifyContentType(text, mode);
  const isSceneryOnly = isSceneryOrSubjectWithoutPresenter(text) && mode !== 'brand';

  // 1. Primary Subject Extraction
  let primarySubject = text;
  const subjectIntroMatch = text.match(/(?:a|an)\s+([0-9]+-second\s+)?(?:cinematic\s+journey\s+through\s+|cinematic\s+video\s+of\s+|video\s+about\s+|commercial\s+for\s+|story\s+about\s+|video\s+showing\s+)?([^,.]+)/i);
  if (subjectIntroMatch && subjectIntroMatch[2]) {
    primarySubject = subjectIntroMatch[2].trim();
  }

  // 2. Wardrobe Extraction
  let wardrobe = '';
  const wardrobePatterns = [
    /(?:wearing|dressed in|in)\s+(?:a\s+|an\s+)?([a-z\s-]*?(?:crewneck\s+sweater|crewneck|hoodie|sweater|blazer|suit|turtleneck|jacket|coat|t-shirt|shirt|dress|robe|uniform|raincoat|cardigan|apparel|vest))/i,
    /([a-z\s-]*?(?:navy\s+crewneck\s+sweater|black\s+turtleneck|tailored\s+blazer|charcoal\s+suit|leather\s+jacket))/i,
  ];
  for (const pat of wardrobePatterns) {
    const match = text.match(pat);
    if (match && match[1] && match[1].trim().length > 3) {
      wardrobe = match[1].trim().replace(/\s+(presenting|speaking|standing|talking|building|working|walking|looking|moving).*/i, '');
      break;
    }
  }

  // 3. Subject Role / Character
  let subjectRole = '';
  const roleMatch = text.match(/(?:a|an)\s+([a-z\s-]*?(?:presenter|architect|founder|engineer|developer|creator|leader|executive|student|specialist|analyst|designer|athlete|expert|director|consultant|guide|hiker|explorer|traveler|artisan|scientist))/i);
  if (roleMatch && roleMatch[1]) {
    subjectRole = roleMatch[1].trim().replace(/\s+(wearing|in|with|presenting|walking|standing).*/i, '');
  }

  // 4. Environment / Setting Extraction
  let environment = '';
  if (classification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY) {
    // Extract nature environment directly from prompt
    const natureEnvMatch = text.match(/(?:through|in|across|of)\s+(?:a\s+|an\s+)?([^,.]*(?:forest|mountain|mountains|valley|stream|river|lake|ocean|sea|beach|canyon|glacier|jungle|woods|landscape|meadow|desert|plateau)[^,.]*)/i);
    if (natureEnvMatch && natureEnvMatch[1]) {
      environment = natureEnvMatch[1].trim();
    } else {
      environment = primarySubject;
    }
  } else {
    const envMatch = text.match(/(?:across|inside|in|within|at)\s+(?:a\s+|an\s+)?((?:(?:modern|sunlit|collaborative|innovation|high-tech|architectural|glass|urban|outdoor|open|clean|spacious|studio|natural)\s+)*\b(?:workspace|studio|laboratory|lab|office|room|landscape|environment|datacenter|stage|center|building|campus|interior|forest|setting)\b[^,.]*)/i);
    if (envMatch && envMatch[1]) {
      environment = envMatch[1].trim().replace(/,\s*with\s+.*/i, '');
    }
  }

  // 5. Natural Elements & Key Objects Extraction
  const naturalElements = [];
  if (/mist|misty/i.test(text)) naturalElements.push('Soft atmospheric morning mist');
  if (/pine|evergreen|tall trees|forest/i.test(text)) naturalElements.push('Tall evergreen pine trees');
  if (/sunrise|dawn|golden rays|sun rays/i.test(text)) naturalElements.push('Golden morning sunbeams piercing through foliage');
  if (/dew|morning dew|glistening/i.test(text)) naturalElements.push('Glistening morning dew droplets');
  if (/moss|emerald moss/i.test(text)) naturalElements.push('Vibrant emerald moss textures');
  if (/stream|mountain stream|creek|river|water/i.test(text)) naturalElements.push('Crystal-clear flowing mountain stream');
  if (/mountains|peaks/i.test(text)) naturalElements.push('Majestic alpine mountain peaks');

  // 6. Lighting Directives
  let lighting = '';
  if (/sunrise|dawn|golden rays|golden hour/i.test(text)) {
    lighting = 'Radiant cinematic golden hour illumination with soft volumetric sunbeams and atmospheric morning glow';
  } else if (/sunset|dusk/i.test(text)) {
    lighting = 'Warm dramatic sunset illumination with amber and violet twilight horizon gradients';
  } else if (/commercial lighting|volumetric|studio lighting|soft light/i.test(text)) {
    lighting = 'High-end commercial studio lighting with soft diffused key light and clean rim separation';
  } else if (/cyber|neon|night/i.test(text)) {
    lighting = 'High-contrast nocturnal illumination with vibrant neon accents and moody cinematic shadows';
  } else {
    lighting = 'Natural cinematic lighting with rich contrast, volumetric atmospheric depth, and lifelike shadow roll-off';
  }

  // 7. Camera Movement & Cinematography
  let cameraMovement = '';
  if (/aerial tracking|aerial|drone/i.test(text)) {
    cameraMovement = 'Smooth gentle aerial drone tracking gliding gracefully above the scene';
  } else if (/tracking|push-in|push in/i.test(text)) {
    cameraMovement = 'Fluid forward tracking push-in with optical stabilization';
  } else if (/orbit|360|pan/i.test(text)) {
    cameraMovement = 'Cinematic orbital camera motion arcing smoothly around the central subject';
  } else if (/macro|close-up|closeup/i.test(text)) {
    cameraMovement = 'Intimate macro slider movement capturing fine glistening textures';
  } else {
    cameraMovement = 'Smooth cinematic camera movement with fluid motion vectors and graceful framing';
  }

  // 8. Mood & Tone
  let mood = '';
  if (/serene|peaceful|calm|tranquil|meditative/i.test(text) || classification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY) {
    mood = 'Serene, breathtaking, tranquil, and awe-inspiring';
  } else if (/energetic|dynamic|fast|high impact/i.test(text) || classification === CONTENT_ARCHETYPES.PROMOTIONAL_VIDEO) {
    mood = 'High-energy, confident, compelling, and commercially impactful';
  } else if (classification === CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS) {
    mood = 'Authoritative, clear, intellectually engaging, and insightful';
  } else {
    mood = 'Inspiring, polished, cinematic, and modern';
  }

  return {
    rawText: text,
    classification,
    isSceneryOnly,
    primarySubject,
    subjectRole,
    wardrobe,
    environment,
    naturalElements,
    lighting,
    cameraMovement,
    mood,
    hasShallowDof: /shallow\s+depth\s+of\s+field|bokeh|cinematic\s+depth/i.test(text),
  };
}

/**
 * Builds the complete unified Continuity Context containing Character, Environment, and Visual Style Bibles.
 */
export function createSceneContinuityContext(videoSpec = {}, rawTopic = '') {
  const mode = videoSpec.mode || 'custom';
  const brandContext = videoSpec.brandContext || {};
  const isBrand = mode === 'brand' || Boolean(brandContext.brandName);
  const visualStyle = videoSpec.visualStyle || 'Cinematic Hyper-Realism';

  const fullPromptText = `${rawTopic} ${videoSpec.objective || ''}`.trim();
  const directives = extractUserDirectives(fullPromptText, mode, brandContext);
  const classification = directives.classification;
  const isSceneryOnly = directives.isSceneryOnly;
  const isPresenterRequired = requiresPresenter(fullPromptText, mode, classification);

  const primaryColor = brandContext.primaryColor || brandContext.colors?.[0] || '#1A365D';
  const secondaryColor = brandContext.secondaryColor || brandContext.colors?.[1] || '#2B6CB0';
  const accentColor = brandContext.accentColor || brandContext.colors?.[2] || '#ED8936';
  const colorsList = brandContext.colors?.length ? brandContext.colors : [primaryColor, secondaryColor, accentColor].filter(Boolean);

  // --- 1. CHARACTER BIBLE (CONDITIONAL: ONLY WHEN PRESENTER IS ACTUALLY REQUIRED) ---
  let characterBible = null;
  let characterIdentity = null;

  if (isPresenterRequired && !isSceneryOnly) {
    let characterRole = directives.subjectRole;
    const brandName = brandContext.brandName || '';

    if (!characterRole) {
      if (classification === CONTENT_ARCHETYPES.EDUCATIONAL_MASTERCLASS) {
        characterRole = 'Masterclass Instructor and Industry Expert';
      } else if (isBrand) {
        characterRole = `${brandName || 'Brand'} Featured Presenter`;
      } else {
        characterRole = 'Lead Presenter';
      }
    }

    let wardrobeDescription = directives.wardrobe;
    if (!wardrobeDescription) {
      if (isBrand) {
        wardrobeDescription = `Clean tailored modern smart-casual attire with refined aesthetic and subtle ${primaryColor} accent`;
      } else {
        wardrobeDescription = 'Minimalist modern crewneck knit sweater in dark navy with slim charcoal trousers';
      }
    }

    const physicalIdentity = '35-year-old articulate professional with neatly groomed hair, attentive expressive eyes, natural skin texture, and confident posture';
    const characterAnchorToken = `[MAIN CHARACTER - IDENTITY LOCKED]: ${characterRole}, ${physicalIdentity}, wearing ${wardrobeDescription}. (Preserve identical facial structure, hair, and wardrobe across all cuts).`;

    characterBible = {
      name: characterRole,
      role: characterRole,
      physicalIdentity,
      wardrobe: wardrobeDescription,
      anchorToken: characterAnchorToken,
      demeanor: 'Articulate, confident, intellectually commanding, engaging presence',
      referenceImages: [],
    };

    characterIdentity = {
      role: characterRole,
      appearance: characterAnchorToken,
      wardrobe: wardrobeDescription,
      continuityStrict: true,
    };
  }

  // --- 2. ENVIRONMENT BIBLE ---
  let environmentSetting = directives.environment;
  if (!environmentSetting) {
    if (classification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY) {
      environmentSetting = directives.primarySubject || 'Pristine scenic natural landscape with photorealistic atmospheric depth';
    } else if (isBrand) {
      const indLower = (brandContext.industry || '').toLowerCase();
      if (indLower.includes('wellness') || indLower.includes('health') || indLower.includes('fitness')) {
        environmentSetting = `Modern sunlit ${brandContext.brandName || 'Brand'} wellness and lifestyle studio with natural plants, clean minimalist architecture, and soft ambient lighting`;
      } else {
        environmentSetting = `High-end modern ${brandContext.brandName || 'Brand'} innovation studio with sleek architectural glass and ambient branding`;
      }
    } else {
      environmentSetting = 'Contemporary architectural innovation space with floor-to-ceiling windows and refined interior design';
    }
  }

  const environmentBible = {
    setting: environmentSetting,
    naturalElements: directives.naturalElements,
    lighting: directives.lighting,
    colorPalette: colorsList,
    spatialContinuity: 'Persistent unified environment coordinates and lighting across multi-shot sequence',
  };

  // --- 3. VISUAL STYLE BIBLE ---
  const cinematography = [
    'Photorealistic optical depth',
    directives.hasShallowDof ? '35mm prime lens with shallow depth of field and soft background bokeh' : '35mm anamorphic cinematic lens with natural depth',
    'Lifelike organic textures',
    'Rich commercial color grade with balanced dynamic range',
    directives.cameraMovement,
  ].filter(Boolean).join(', ');

  const visualStyleBible = {
    aesthetic: visualStyle,
    cinematography,
    logoUrl: brandContext.logoUrl || null,
    logoPlacement: brandContext.logoPlacement || 'none',
    typography: 'Clean, high-impact modern typography',
  };

  // --- 4. AUDIO CONTINUITY ---
  let voiceActor = 'Aria (Natural Cinematic Narrator)';
  if (classification === CONTENT_ARCHETYPES.CINEMATIC_NATURE_JOURNEY) {
    voiceActor = 'David (Deep Cinematic Documentary Voice)';
  } else if (isBrand) {
    voiceActor = `${brandContext.brandName || 'Brand'} Host (Warm Authoritative Voice)`;
  }

  return {
    contentClassification: classification,
    userDirectives: directives,
    isSceneryOnly,
    characterBible,
    characterIdentity,
    environment: environmentBible,
    environmentBible,
    visualStyle: visualStyleBible,
    visualStyleBible,
    audioContinuity: {
      voiceActor,
      voiceTimbre: 'Warm, resonant, natural human narration with consistent acoustic resonance across all cuts',
      speakingCadence: 'Natural deliberate pacing (0.95x) with smooth narrative continuity',
    },
    continuityRules: [
      isSceneryOnly
        ? 'STRICT NATURE MANDATE: Strictly forbid human presenters, talking heads, or UI telemetry screens. Focus exclusively on natural scenery, landscape discovery, and lighting transitions.'
        : 'CHARACTER MANDATE: Maintain exact character physical features, haircut, and wardrobe identically across all generated scenes.',
      'Preserve user-specified environment, natural elements, and lighting keywords as immutable priorities in every scene prompt.',
      'Preserve identical physical setting, color grade, and atmosphere from first frame to final frame.',
    ],
  };
}

