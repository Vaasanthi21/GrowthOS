/**
 * server/video/context/scene-continuity.context.js
 *
 * Global Character Bible and Continuity Context attached to VideoSpec.
 * Preserves user-provided prompt directives (wardrobe, environment, lighting, lenses)
 * with the highest priority and propagates unified identity anchors across all scenes.
 */

function extractUserDirectives(promptText = '') {
  const text = String(promptText || '').trim();
  const lower = text.toLowerCase();

  // 1. Extract wardrobe directives
  let wardrobe = '';
  const wardrobePatterns = [
    /(?:wearing|in)\s+(?:a\s+|an\s+)?([a-z\s-]*?(?:crewneck\s+sweater|crewneck|hoodie|sweater|blazer|suit|turtleneck|jacket|shirt|t-shirt|cardigan|coat))/i,
    /([a-z\s-]*?(?:navy\s+crewneck\s+sweater|crewneck|hoodie|sweater|blazer|suit|turtleneck|jacket|shirt))/i,
  ];

  for (const pat of wardrobePatterns) {
    const match = text.match(pat);
    if (match && match[1] && match[1].trim().length > 3) {
      wardrobe = match[1].trim().replace(/\s+(presenting|speaking|standing|talking|building|working|walking).*/i, '');
      break;
    }
  }

  // 2. Extract subject role / identity
  let subjectRole = '';
  const roleMatch = text.match(/(?:a|an)\s+([a-z\s-]*?(?:architect|founder|engineer|developer|presenter|creator|leader|executive|student|specialist|analyst|designer|athlete|expert|director|consultant))/i);
  if (roleMatch && roleMatch[1]) {
    subjectRole = roleMatch[1].trim().replace(/\s+(wearing|in|with|presenting).*/i, '');
  }

  // 3. Extract environment / setting
  let environment = '';
  const envMatch = text.match(/(?:across|inside|in|within)\s+(?:a\s+|an\s+)?((?:(?:modern|sunlit|collaborative|innovation|high-tech|architectural|glass|urban|outdoor|open|clean|spacious)\s+)*\b(?:workspace|studio|laboratory|lab|office|room|landscape|environment|datacenter|stage|center|building|campus|interior)\b[^,.]*)/i);
  if (envMatch && envMatch[1]) {
    environment = envMatch[1].trim().replace(/,\s*with\s+.*/i, '');
  }

  // 4. Extract lighting & camera directives
  const hasShallowDof = /shallow\s+depth\s+of\s+field|bokeh|cinematic\s+depth/i.test(text);
  const hasCommercialLighting = /commercial\s+lighting|volumetric|studio\s+lighting|key\s+light|soft\s+light/i.test(text);

  return {
    wardrobe,
    subjectRole,
    environment,
    hasShallowDof,
    hasCommercialLighting,
  };
}

function isSceneryOrSubjectWithoutPresenter(text = '') {
  const lower = String(text || '').toLowerCase();
  const hasHumanKeywords = /\b(person|man|woman|guy|girl|actor|presenter|character|people|architect|engineer|developer|founder|executive|speaker|student|chef|doctor|astronaut|pianist|model|teacher|host|narrator|expert|leader|individual|team)\b/i.test(lower);
  if (hasHumanKeywords) return false;

  const sceneryKeywords = /\b(sunset|sunrise|nature|landscape|mountain|mountains|ocean|sea|beach|forest|jungle|sky|clouds|drone|cinematic shot|cinematic view|timelapse|waterfall|city|cityscape|street|highway|car|vehicle|animal|dog|cat|bird|space|galaxy|nebula|abstract|weather|rain|snow|underwater)\b/i.test(lower);
  return sceneryKeywords;
}

export function createSceneContinuityContext(videoSpec = {}, rawTopic = '') {
  const mode = videoSpec.mode || 'custom';
  const brandContext = videoSpec.brandContext || {};
  const isBrand = mode === 'brand' || Boolean(brandContext.brandName);
  const visualStyle = videoSpec.visualStyle || 'Cinematic Hyper-Real';

  const primaryColor = brandContext.primaryColor || brandContext.colors?.[0] || '#1A365D';
  const secondaryColor = brandContext.secondaryColor || brandContext.colors?.[1] || '#2B6CB0';
  const accentColor = brandContext.accentColor || brandContext.colors?.[2] || '#ED8936';
  const colorsList = brandContext.colors?.length ? brandContext.colors : [primaryColor, secondaryColor, accentColor].filter(Boolean);

  const fullPromptText = `${rawTopic} ${videoSpec.objective || ''}`.trim();
  const directives = extractUserDirectives(fullPromptText);
  const topicText = fullPromptText.toLowerCase();
  const isSceneryOnly = !isBrand && isSceneryOrSubjectWithoutPresenter(fullPromptText);

  // --- 1. CHARACTER BIBLE & FACE CONTINUITY ---
  let characterRole = '';
  let wardrobeDescription = '';
  let physicalIdentity = '';
  let characterAnchorToken = '';

  if (!isSceneryOnly) {
    characterRole = directives.subjectRole;
    const brandName = brandContext.brandName || '';
    const brandPurpose = brandContext.purpose || brandContext.productDescription || brandContext.tagline || '';
    const isUdenOrHR = brandName.toLowerCase().includes('uden') || brandPurpose.toLowerCase().includes('hr') || brandPurpose.toLowerCase().includes('recruit') || brandPurpose.toLowerCase().includes('talent') || topicText.includes('hr') || topicText.includes('recruitment') || topicText.includes('career') || topicText.includes('student');

    if (!characterRole) {
      if (isUdenOrHR) {
        characterRole = `Lead Talent Innovation Strategist at ${brandName || 'UDEN'}`;
      } else if (topicText.includes('architect') || topicText.includes('cloud')) {
        characterRole = 'Visionary Software Architect';
      } else if (topicText.includes('developer') || topicText.includes('engineer') || topicText.includes('coder')) {
        characterRole = 'Lead Software Engineer';
      } else if (topicText.includes('founder') || topicText.includes('executive') || topicText.includes('ceo')) {
        characterRole = 'Tech Founder and Executive';
      } else if (topicText.includes('student') || topicText.includes('graduate') || topicText.includes('career')) {
        characterRole = 'Aspirational Career Professional';
      } else {
        characterRole = isBrand ? `${brandName || 'Brand'} Global Platform Strategist` : 'Lead Presenter';
      }
    }

    // Exact wardrobe (User prompt directive takes highest precedence)
    wardrobeDescription = directives.wardrobe;
    if (!wardrobeDescription) {
      if (isBrand) {
        wardrobeDescription = `Clean tailored modern smart-casual attire in dark tones with subtle ${primaryColor} accent`;
      } else if (topicText.includes('architect') || topicText.includes('engineer')) {
        wardrobeDescription = 'Dark navy-blue crewneck knit sweater with white under-collar and dark tailored trousers';
      } else {
        wardrobeDescription = 'Minimalist modern crewneck knit sweater in dark navy, slim charcoal trousers';
      }
    }

    // Physical attributes & facial consistency anchor (locked identical person across all cuts)
    physicalIdentity = '35-year-old professional with neatly groomed dark hair, subtle light stubble, sharp attentive eyes, natural skin texture, and athletic confident posture';

    // Master immutable Character Bible Anchor Token
    characterAnchorToken = `[MAIN SUBJECT - IDENTITY LOCKED]: ${characterRole}, ${physicalIdentity}, wearing ${wardrobeDescription}. (Same identical individual across all scenes, preserve identical facial bone structure, skin complexion, hair, and clothing).`;
  }

  // --- 2. ENVIRONMENT BIBLE ---
  let environmentSetting = directives.environment;
  if (!environmentSetting) {
    if (isSceneryOnly) {
      environmentSetting = `Expansive scenic atmosphere: ${rawTopic || 'Vibrant natural landscape with photorealistic depth'}`;
    } else {
      const brandName = brandContext.brandName || '';
      const brandPurpose = brandContext.purpose || brandContext.productDescription || brandContext.tagline || '';
      const isUdenOrHR = brandName.toLowerCase().includes('uden') || brandPurpose.toLowerCase().includes('hr') || brandPurpose.toLowerCase().includes('recruit') || brandPurpose.toLowerCase().includes('talent') || topicText.includes('hr');

      if (isUdenOrHR) {
        environmentSetting = `Modern sunlit ${brandName || 'UDEN'} talent innovation hub with sleek glass architectural partitions, transparent candidate telemetry displays, and open collaborative workstations`;
      } else if (topicText.includes('cloud') || topicText.includes('architecture') || topicText.includes('workspace') || topicText.includes('collaborative')) {
        environmentSetting = 'Sunlit modern collaborative innovation workspace with glass partitions, wood architectural slats, and clean open tech layout';
      } else if (topicText.includes('nature') || topicText.includes('outdoor')) {
        environmentSetting = 'Expansive natural outdoor architectural setting with clean horizon and organic textures';
      } else if (isBrand) {
        environmentSetting = `High-end modern ${brandName} innovation studio with architectural glass displays, clean lighting, and brand design elements`;
      } else {
        environmentSetting = 'Contemporary architectural innovation space with floor-to-ceiling windows and refined interior design';
      }
    }
  }

  // Lighting & atmosphere (User directives prioritized)
  let lightingSetting = 'Consistent commercial studio lighting with soft diffused key light, subtle rim separation, and natural warm ambient fill';
  if (directives.hasCommercialLighting || topicText.includes('commercial lighting')) {
    lightingSetting = 'High-end commercial studio lighting grade, soft volumetric key light with balanced fill and warm rim light';
  } else if (isSceneryOnly && (topicText.includes('sunset') || topicText.includes('sunrise') || topicText.includes('golden'))) {
    lightingSetting = 'Natural cinematic golden hour illumination with radiant volumetric glow, warm atmospheric rim light, and soft dusk shadows';
  }

  // --- 3. CINEMATOGRAPHY SPEC ---
  const cinematography = [
    'Photorealistic optical depth',
    directives.hasShallowDof || topicText.includes('shallow depth of field') ? '35mm prime lens with shallow depth of field and soft background bokeh' : '35mm cinematic lens with optical depth',
    'Natural lifelike textures',
    'Rich commercial color grade with balanced contrast',
    'Smooth fluid camera motion vectors',
  ].join(', ');

  return {
    isSceneryOnly,
    characterBible: isSceneryOnly ? null : {
      name: characterRole,
      role: characterRole,
      physicalIdentity,
      wardrobe: wardrobeDescription,
      anchorToken: characterAnchorToken,
      demeanor: 'Articulate, confident, intellectually commanding, engaging presence',
      referenceImages: brandContext.logoUrl ? [brandContext.logoUrl] : [],
    },
    characterIdentity: isSceneryOnly ? null : {
      role: characterRole,
      appearance: characterAnchorToken,
      wardrobe: wardrobeDescription,
      continuityStrict: true,
    },
    environment: {
      setting: environmentSetting,
      lighting: lightingSetting,
      colorPalette: colorsList,
      spatialContinuity: 'Persistent unified architectural coordinates across multi-shot sequence',
    },
    audioContinuity: {
      voiceActor: isBrand ? 'Brand Host (Warm Authoritative Voice)' : 'Aria (Natural Cinematic Narrator)',
      voiceTimbre: 'Warm, resonant, natural human speech with consistent acoustic resonance across all cuts',
      speakingCadence: 'Natural deliberate pacing (0.95x) with smooth narrative continuity',
    },
    visualStyle: {
      aesthetic: visualStyle,
      cinematography,
      logoUrl: brandContext.logoUrl || null,
      logoPlacement: brandContext.logoPlacement || 'top-right',
      typography: 'Clean, high-impact modern sans-serif typography',
    },
    continuityRules: [
      'Maintain exact character physical features, haircut, and wardrobe identically across all generated scenes',
      'Never alter the character clothing or facial appearance between consecutive scene cuts',
      'Preserve identical physical setting, glass architecture, and lighting grade from first frame to final frame',
      'Preserve user-specified wardrobe and environment keywords as immutable priorities in every scene prompt',
    ],
  };
}

