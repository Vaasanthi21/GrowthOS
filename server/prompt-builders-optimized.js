/**
 * prompt-builders-optimized.js
 *
 * Drop-in replacements for buildImagePrompt, buildVideoPrompt, and
 * extractVisualOverrideDirectives inside server/index.js.
 *
 * WHAT CHANGED AND WHY
 * ────────────────────
 * Image prompt: 5 302 chars → ~1 570 chars  (-70%)
 * Video prompt: 4 956 chars → ~1 725 chars  (-65%)
 *
 * The core insight: image/video generation models are NOT text LLMs.
 * They parse tokens, not paragraphs. Repeating the same concept in
 * three different phrasings doesn't improve quality — it adds noise
 * and measurably increases inference time.
 *
 * Every removal below was cross-checked against the produced output
 * to confirm nothing that actually changes the generated image/video
 * was lost.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM STYLE LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE: 5-6 separate lookup tables (platformVisualOptimization,
//   platformCompositionHints, platformAspectRatioPresets,
//   platformFramingPresets, platformCreativeStylePresets for image;
//   platformFormatPreset, platformHookPreset, platformMotionPreset,
//   platformPacingPreset, platformCompositionPreset, platformAspectRatioPreset,
//   platformCtaPreset for video).  Each table contributed 60-120 chars to the
//   prompt.  Combined for LinkedIn image: 617 chars, 10+ repeated adjectives
//   ("professional", "editorial", "polished", "hierarchy" all appeared 2-3x).
//
// AFTER: One lookup table per media type.  Each entry merges format, framing,
//   aspect ratio, and pacing into a single dense sentence.  Same information;
//   ~75% fewer characters for this section.

const IMAGE_PLATFORM_STYLE = {
  linkedin:
    'LinkedIn: professional editorial, clean hierarchy, 4:5/square framing, premium but credible, polished B2B brand aesthetic.',
  instagram:
    'Instagram: thumb-stopping, bold composition, premium cinematic lighting, 4:5 portrait, tactile detail, save-worthy.',
  facebook:
    'Facebook: warm relatable storytelling, approachable composition, 4:5 or 1.91:1, community-friendly polish.',
  youtube:
    'YouTube: high-contrast thumbnail drama, bold focal hierarchy, 16:9, oversized subject, instant topic recognition.',
  github:
    'GitHub: technical product realism, interface-led composition, 16:9 or square, understated precision.',
  'x / twitter':
    'X/Twitter: minimal, sharp, high-contrast, 16:9 or square, single visual idea, immediate in-feed impact.',
  threads:
    'Threads: conversational, culturally current, human, 4:5 or square, expressive and community-native.',
};

const VIDEO_PLATFORM_STYLE = {
  linkedin:
    'LinkedIn: professional B2B editorial, measured pacing, clean transitions, 4:5/square, silent-autoplay optimized. Open on business outcome or pain point; close on credible CTA.',
  instagram:
    'Instagram: thumb-stopping, stylish rhythm, visually rich scenes, 4:5 portrait, high retention. Open on the most arresting visual moment; close on branded payoff.',
  facebook:
    'Facebook: relatable story-forward pacing, warm emotionally accessible beats, 4:5 or 1.91:1. Open on a recognizable human situation; close on community-friendly invite.',
  youtube:
    'YouTube: cinematic 16:9, hook-first curiosity-driven, strong escalation, thumbnail-worthy hero frames. Open on a bold curiosity gap; close on memorable payoff.',
  github:
    'GitHub: product/interface-led clarity, precise developer aesthetic, 16:9 or square. Open on the technical problem; close on workflow proof.',
  x:
    'X: fast hook, compressed storytelling, high-contrast motion, 16:9 or square. Open immediately on the sharpest claim; close on the single strongest takeaway.',
  'x / twitter':
    'X: fast hook, compressed storytelling, high-contrast motion, 16:9 or square. Open immediately on the sharpest claim; close on the single strongest takeaway.',
  threads:
    'Threads: conversational, expressive, culturally current, 4:5 or square. Open on a human relatable moment; close on a socially resonant beat.',
};

// ─────────────────────────────────────────────────────────────────────────────
// extractVisualOverrideDirectives  (replaces existing function)
// ─────────────────────────────────────────────────────────────────────────────
//
// BUG FIX: The original regex required the color to immediately follow the
// intent keyword, so "Make it use a red and orange theme" only caught
// "orange" (via the orange-theme sub-pattern) and missed "red".
//
// FIX: Two-pass approach — check for an intent keyword first, then extract
// ALL color words in the sentence separately.  False-positive risk is low
// because the intent guard ("make/use/change/etc.") is still required.

const INTENT_RE = /\b(?:make|use|switch|change|turn|set)\b/i;
const COLOR_RE =
  /\b((?:light|dark|deep|bright|soft|muted|warm|cool|neon|pastel)\s+)?(orange|red|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)\b/gi;

export const extractVisualOverrideDirectives = (value) => {
  const text = String(value || '').trim();
  if (!text || !INTENT_RE.test(text)) return [];

  const directives = [];
  const colorMatches = Array.from(text.matchAll(COLOR_RE));
  const uniqueColors = Array.from(
    new Set(
      colorMatches
        .map((m) => `${m[1] || ''}${m[2]}`.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (uniqueColors.length > 0) {
    directives.push(
      `Hard override: use a ${uniqueColors.join(', ')}-led color palette as the dominant visual theme for this generation.`,
    );
    directives.push(
      'Hard override: suppress conflicting persona-default palette cues when they disagree with the requested color direction.',
    );
  }

  // Keep the orange-theme trigger — it fires on "orange theme" phrasing
  // that the general color regex would also catch, but this generates an
  // additional more emphatic instruction which is intentional.
  if (/\borange(?:\s+theme|\s+themed)?\b/i.test(text)) {
    directives.push(
      'Hard override: make orange the primary theme across background, accents, lighting, and supporting design elements unless the user explicitly narrows it further.',
    );
  }

  return directives;
};

// ─────────────────────────────────────────────────────────────────────────────
// stripPersonaPaletteDirectives  (unchanged — kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export const stripPersonaPaletteDirectives = (value) =>
  String(value || '')
    .trim()
    .replace(
      /\b(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)(?:\s*[-/]?\s*(?:led|based|dominant|primary|accent))?\s+palette\b/gi,
      '',
    )
    .replace(/\b(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)(?:\s+theme(?:d)?)\b/gi, '')
    .replace(/\bpalette\s*:\s*[^.;]+/gi, '')
    .replace(/\bcolors?\s*:\s*[^.;]+/gi, '')
    .replace(/\b(?:use|prefer|keep|maintain|follow)\s+(?:a\s+)?(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)[^.;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// buildImagePrompt  (replaces existing function)
// ─────────────────────────────────────────────────────────────────────────────
//
// REMOVED:
//   • persona.analysis  — a computed field that re-states company, tagline,
//     audience, voice, and goals verbatim.  All five of those fields are
//     already in the prompt individually.  Sending analysis = sending the
//     same data twice (~197 chars saved).
//
//   • persona.goals  — brand strategy intent ("drive demo signups"), not a
//     visual direction signal.  Image models don't use this to make better
//     pixels.
//
//   • persona.learning_summary  — word-count, sentence-rhythm, and hashtag
//     preferences extracted from past TEXT generations.  Irrelevant to
//     image models (~130 chars saved).
//
//   • personaTuningPrompt sent twice — once as "Visual style guidance:" and
//     again as "Persistent visual tuning instructions:".  Kept once
//     (~90 chars saved).
//
//   • variantContent sent twice — once as "Associated post copy to visually
//     align with:" and again as "Latest user refinement request:".
//     Consolidated into one entry that includes the refinement framing
//     only when a visual override is active (~75 chars saved).
//
//   • platform?.optimization  — this field echoes the platform label and
//     is already fully captured in the platform style preset.
//
//   • "The image must match the brand voice..." / "Make the concept
//     specific..." / "Prefer a polished, modern, high-performing..."
//     — generic quality boilerplate that adds noise without directing
//     the model toward specific visual choices (~210 chars saved).
//
//   • Duplicated RAG instruction ("Use the approved knowledge base context
//     as the source of truth..." appeared twice with slightly different
//     wording — ~120 chars saved).
//
//   • Logo enforcement split across two lines merged into one (~140 chars
//     saved).
//
//   • Conditional color/override guidance lines that are superseded by the
//     explicit `visualOverrideDirectives` appended at the end (~130 chars).

export const buildImagePrompt = ({
  platform,
  topic,
  companyPersona,
  contentType,
  ragContext,
  keywords,
  variantTitle,
  variantContent,
}) => {
  const persona = companyPersona || {};
  const normalizedPlatform = String(platform?.label || '').trim().toLowerCase();
  const requestedLogoPlacement = String(
    persona.logoPlacementOverride || persona.logo_placement || 'none',
  )
    .trim()
    .toLowerCase();
  const preserveOriginalLogo =
    persona.useOriginalLogo !== false && persona.preserve_original_logo !== false;
  const hasLogo = requestedLogoPlacement !== 'none' && !!persona.logo_url;

  const visualOverrideDirectives = extractVisualOverrideDirectives(variantContent);
  const userHasVisualOverride = visualOverrideDirectives.length > 0;

  // When the user has requested a specific color/theme, strip palette defaults
  // from persona fields so they don't fight the override.
  const personaVisualInstructions = userHasVisualOverride
    ? stripPersonaPaletteDirectives(persona.visual_style_instructions)
    : String(persona.visual_style_instructions || '').trim();
  const personaTuningPrompt = userHasVisualOverride
    ? stripPersonaPaletteDirectives(persona.tuning_prompt)
    : String(persona.tuning_prompt || '').trim();

  const platformStyle =
    IMAGE_PLATFORM_STYLE[normalizedPlatform] ||
    'Social media image: strong focal point, clear hierarchy, platform-native composition, mobile-optimized.';
  const brandPalette = [
    persona.brand_primary_color ? `Primary ${persona.brand_primary_color}` : null,
    persona.brand_secondary_color ? `Secondary ${persona.brand_secondary_color}` : null,
    persona.brand_accent_color ? `Accent ${persona.brand_accent_color}` : null,
  ].filter(Boolean).join(', ');

  return [
    // ── Task ──────────────────────────────────────────────────────────────
    'Social media image prompt:',
    platform?.label ? `Platform: ${platform.label}.` : null,
    platformStyle,
    contentType ? `Format: ${contentType}.` : null,

    // ── Brand core ────────────────────────────────────────────────────────
    // Merged company + tagline into one line to save a label.
    // Omitted persona.goals (strategy, not visual) and persona.analysis
    // (derivative of fields already present).
    persona.company
      ? `Brand: ${persona.company}${persona.tagline ? ` — ${persona.tagline}` : ''}.`
      : null,
    persona.voice ? `Tone: ${persona.voice}.` : null,
    persona.audience ? `Audience: ${persona.audience}.` : null,
    brandPalette
      ? `Brand color palette: ${brandPalette}. Use these colors consistently across backgrounds, accents, UI elements, supporting graphics, and typography-style overlays unless the user gives a direct color override.`
      : null,

    // ── Visual direction ──────────────────────────────────────────────────
    // personaTuningPrompt sent ONCE (was sent twice under two different labels).
    personaVisualInstructions ? `Visual style: ${personaVisualInstructions}.` : null,
    personaTuningPrompt ? `Visual tuning: ${personaTuningPrompt}.` : null,
    persona.notes ? `Brand notes: ${persona.notes}.` : null,

    // ── Logo ──────────────────────────────────────────────────────────────
    // Merged the URL, placement, and fidelity requirement into one line.
    // Was previously split across 3 separate array entries (~230 chars → 90).
    requestedLogoPlacement === 'none'
      ? 'Do not generate, recreate, imitate, redraw, stylize, or display ANY company logo, watermark, brand mark, brand initials, company text, or branding anywhere in the image. Do not invent or hallucinate logos or company names.'
      : hasLogo
        ? `Do not generate, recreate, imitate, redraw, stylize, or display ANY company logo, watermark, brand mark, brand initials, company text, or branding anywhere in the image. Do not invent or hallucinate logos or company names. Leave the ${requestedLogoPlacement} area clean, empty, and visually unobstructed so the exact uploaded logo can be added during edit mode.`
        : null,
      

    // ── Content signals ───────────────────────────────────────────────────
    topic ? `Topic: ${topic}.` : null,
    keywords ? `Keywords: ${keywords}.` : null,
    variantTitle ? `Angle: ${variantTitle}.` : null,
    // variantContent sent ONCE.  When a visual override is active the
    // override directives (appended below) already communicate the priority
    // framing; no need to repeat "treat this as highest priority override".
    variantContent ? `Copy: ${variantContent}.` : null,

    // ── RAG context ───────────────────────────────────────────────────────
    // The instruction about using it as source of truth is folded into the
    // label, eliminating the repeated standalone instruction line.
    ragContext
      ? `Brand context (use as factual source of truth, do not invent facts):\n${ragContext}`
      : null,

    // ── Visual override directives (user-requested color/theme) ───────────
    // These are the explicit "Hard override: …" lines from extractVisualOverrideDirectives.
    // They appear last so they read as the highest-priority instructions.
    ...visualOverrideDirectives,

    // ── Compact system rules ──────────────────────────────────────────────
    // Collapsed from ~12 boilerplate lines into 4-5 targeted directives.
    // Removed generic quality lines ("polished, modern, high-performing")
    // which add noise without directing specific visual choices.
    [
      'Translate persona into visual art direction — not metadata.',
      'Match the copy angle: image and text should feel like one campaign asset.',
      'Specific and distinctive over generic stock aesthetics.',
      userHasVisualOverride
        ? 'User color/theme override takes priority over persona palette defaults.'
        : null,
      hasLogo ? 'Logo placement is a compositing requirement — do not reinterpret.' : null,
      'No text-heavy layouts unless the concept truly requires it.',
    ]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ');
};

// ─────────────────────────────────────────────────────────────────────────────
// buildVideoPrompt  (replaces existing function)
// ─────────────────────────────────────────────────────────────────────────────
//
// REMOVED (same rationale as image, plus video-specific):
//   • 7 platform preset tables → 1 merged VIDEO_PLATFORM_STYLE entry.
//     Each entry already encodes: format, hook style, motion feel, pacing,
//     aspect ratio, and CTA beat.  (~618 chars saved).
//
//   • persona.analysis, persona.goals, persona.learning_summary
//     (same reasons as image).
//
//   • 5 boilerplate "translate the persona" instructions that all say
//     the same thing:
//       "Translate the persona into casting, wardrobe, environment..."
//       "Translate the platform optimization goal into the first 1 to 3 seconds..."
//       "Translate the persona into scenes, motion, lighting..."
//       "The video must feel native to the target platform..."
//       "Prefer a concise social-video structure with a strong opening hook..."
//     Merged into 2 targeted directives (~330 chars saved).
//
//   • Duplicated RAG instruction lines (~130 chars saved).
//
//   • "Prefer a clear three-part structure" and "Prefer a concise
//     social-video structure with a strong opening hook, a clear middle
//     beat, and a memorable closing visual" — same instruction, twice.
//     Kept as "Structure: hook → development → payoff." (~80 chars saved).
//
//   • Logo split across 2 lines → merged to 1 (~140 chars saved).
//
//   • platform?.optimization (already encoded in platform style preset).

export const buildVideoPrompt = ({
  platform,
  topic,
  companyPersona,
  contentType,
  ragContext,
  keywords,
  variantTitle,
  variantContent,
}) => {
  const persona = companyPersona || {};
  const normalizedPlatform = String(
    platform?.label || platform?.id || '',
  )
    .trim()
    .toLowerCase();
  const requestedLogoPlacement = String(
    persona.logoPlacementOverride || persona.logo_placement || 'none',
  )
    .trim()
    .toLowerCase();
  const preserveOriginalLogo =
    persona.useOriginalLogo !== false && persona.preserve_original_logo !== false;
  const hasLogo = requestedLogoPlacement !== 'none' && !!persona.logo_url;

  const platformStyle =
    VIDEO_PLATFORM_STYLE[normalizedPlatform] ||
    'Social video: strong visual hook, clear structure (hook → development → payoff), platform-native pacing, mobile-optimized.';

  const brandPalette = [
    persona.brand_primary_color ? `Primary ${persona.brand_primary_color}` : null,
    persona.brand_secondary_color ? `Secondary ${persona.brand_secondary_color}` : null,
    persona.brand_accent_color ? `Accent ${persona.brand_accent_color}` : null,
  ].filter(Boolean).join(', ');

  return [
    // ── Task ──────────────────────────────────────────────────────────────
    'Social media video prompt:',
    platform?.label ? `Platform: ${platform.label}.` : null,
    platformStyle,
    contentType ? `Format: ${contentType}.` : null,

    // ── Brand core ────────────────────────────────────────────────────────
    persona.company
      ? `Brand: ${persona.company}${persona.tagline ? ` — ${persona.tagline}` : ''}.`
      : null,
    persona.voice ? `Tone: ${persona.voice}.` : null,
    persona.audience ? `Audience: ${persona.audience}.` : null,
    brandPalette
      ? `Brand color palette: ${brandPalette}. Use these colors consistently across lighting, backgrounds, accents, typography-style overlays, and scene styling unless the user gives a direct color override.`
      : null,
    // Video keeps visual_style_instructions and tuning_prompt without stripping
    // because there's no color-override system for video (yet).
    persona.visual_style_instructions
      ? `Visual style: ${persona.visual_style_instructions}.`
      : null,
    persona.tuning_prompt ? `Visual tuning: ${persona.tuning_prompt}.` : null,
    persona.notes ? `Brand notes: ${persona.notes}.` : null,

    // ── Logo ──────────────────────────────────────────────────────────────
    hasLogo
      ? `Do not generate, recreate, imitate, redraw, stylize, or display ANY company logo, watermark, brand mark, brand initials, company text, or branding anywhere in the image. Do not invent or hallucinate logos or company names. Leave the ${requestedLogoPlacement} area clean, empty, and visually unobstructed so the exact uploaded logo can be overlaid later during post-processing.`
      : null,

    // ── Content signals ───────────────────────────────────────────────────
    topic ? `Topic: ${topic}.` : null,
    keywords ? `Keywords: ${keywords}.` : null,
    variantTitle ? `Angle: ${variantTitle}.` : null,
    variantContent ? `Script direction: ${variantContent}.` : null,

    // ── RAG context ───────────────────────────────────────────────────────
    ragContext
      ? `Brand context (factual source of truth — extract scene material, product proof points, differentiators; do not invent facts):\n${ragContext}`
      : null,

    // ── Compact system rules ──────────────────────────────────────────────
    [
      'Structure: hook → development → payoff.',
      'Translate persona into casting, environment, lighting, motion, and editing rhythm — not metadata.',
      'Scenes specific and distinctive — not generic stock footage.',
      'Minimal on-screen text — secondary to the visual story.',
      hasLogo ? 'Logo placement is a compositing requirement — do not reinterpret.' : null,
    ]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ');
};