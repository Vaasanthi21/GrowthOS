/**
 * server/video/creative-director/creative-director.service.js
 *
 * Creative Director service converting user briefs & brand intelligence into
 * structured, validated VideoSpec JSON documents.
 */

import { validateVideoSpec } from './spec-schema.js';
import { defaultLLMProvider } from './llm-provider.js';
import { createSceneContinuityContext } from '../context/scene-continuity.context.js';

export class CreativeDirectorService {
  constructor(llmProvider = defaultLLMProvider) {
    this.llmProvider = llmProvider;
  }

  /**
   * Generates a validated VideoSpec from a user prompt brief and context.
   */
  async createVideoSpec({
    prompt,
    platform = 'instagram',
    aspectRatio = '9:16',
    duration = 15,
    mode = 'custom',
    companyPersona = null,
    company = null,
    contentType = 'cinematic',
    keywords = '',
    ragContext = '',
    logoUrl = '',
    logoPlacement = 'none',
  }) {
    const rawPrompt = String(prompt || '').trim();
    if (!rawPrompt) {
      throw new Error('Creative Director requires a non-empty user prompt brief.');
    }
    const reqDur = Number(duration) || 15;

    const activeLogoPlacement = String(
      logoPlacement && logoPlacement !== 'none'
        ? logoPlacement
        : (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
    ).trim().replace('_', '-');

    const activeLogoUrl = String(
      logoUrl || companyPersona?.logoUrl || companyPersona?.logo_url || company?.logo || ''
    ).trim();

    // Build structured brand context strictly if in Brand Mode
    const isBrandMode = mode === 'brand';
    const resolvedBrandContext = isBrandMode
      ? {
          brandId: companyPersona?.id || companyPersona?._id || company?._id || null,
          brandName: companyPersona?.company || companyPersona?.name || company?.companyName || company?.name || 'Brand',
          tagline: companyPersona?.tagline || company?.tagline || '',
          purpose: companyPersona?.goals || companyPersona?.notes || companyPersona?.description || company?.productDescription || company?.description || '',
          industry: companyPersona?.industry || company?.industry || 'Technology & Innovation',
          colors: [
            companyPersona?.brand_primary_color || company?.brandPrimaryColor,
            companyPersona?.brand_secondary_color || company?.brandSecondaryColor,
            companyPersona?.brand_accent_color || company?.brandAccentColor,
          ].filter(Boolean),
          visualStyle: companyPersona?.visual_style_instructions || companyPersona?.visualStyleInstructions || companyPersona?.tuning_prompt || companyPersona?.tuningPrompt || company?.visualGuidelines || '',
          voice: companyPersona?.voice || company?.brandVoice || 'Authoritative, Inspiring, High-Tech',
          audience: companyPersona?.audience || company?.targetAudience || 'Enterprises, Recruiters, and Career Professionals',
          productDescription: companyPersona?.productDescription || companyPersona?.notes || companyPersona?.goals || company?.productDescription || '',
          logoRequired: activeLogoPlacement !== 'none' && Boolean(activeLogoUrl),
          logoPlacement: activeLogoPlacement,
          logoUrl: activeLogoUrl,
        }
      : {
          brandId: null,
          brandName: '',
          tagline: '',
          purpose: '',
          industry: '',
          colors: [],
          visualStyle: '',
          voice: '',
          audience: '',
          productDescription: '',
          logoRequired: false,
          logoPlacement: 'none',
          logoUrl: '',
        };

    const systemPrompt = `You are an elite AI Creative Director specializing in social video advertising.
Your task is to analyze the user's brief, extract creative intent, define a strategic video objective, target audience, emotional tone, and visual direction, and output a structured JSON VideoSpec.

Output strictly a JSON object with this exact schema:
{
  "version": "1.0",
  "objective": "Clear commercial objective of the video",
  "audience": "Primary target demographic and psychology",
  "tone": "Emotional tone and brand personality",
  "visualStyle": "Cinematic visual art direction, lighting, and camera motion style",
  "duration": ${reqDur},
  "requestedDuration": ${reqDur},
  "effectiveDuration": ${reqDur},
  "providerDuration": ${reqDur},
  "aspectRatio": "${aspectRatio}",
  "platform": "${platform}",
  "mode": "${isBrandMode ? 'brand' : 'custom'}",
  "brandContext": {
    "brandId": "${resolvedBrandContext.brandId || ''}",
    "brandName": "${resolvedBrandContext.brandName}",
    "tagline": "${resolvedBrandContext.tagline}",
    "purpose": "${(resolvedBrandContext.purpose || '').replace(/"/g, "'")}",
    "colors": ${JSON.stringify(resolvedBrandContext.colors)},
    "visualStyle": "${resolvedBrandContext.visualStyle}",
    "voice": "${resolvedBrandContext.voice}",
    "logoRequired": ${resolvedBrandContext.logoRequired},
    "logoPlacement": "${resolvedBrandContext.logoPlacement}",
    "logoUrl": "${resolvedBrandContext.logoUrl}"
  },
  "audioPlan": {
    "voiceover": false,
    "music": true,
    "soundEffects": true
  }
}`;

    const userPrompt = `USER BRIEF: "${rawPrompt}"
PLATFORM: ${platform}
FORMAT STYLE: ${contentType}
ASPECT RATIO: ${aspectRatio}
TARGET DURATION: ${duration} seconds
KEYWORDS: ${keywords}
${ragContext ? `FACTUAL BRAND KNOWLEDGE:\n${ragContext}` : ''}
${isBrandMode ? `BRAND PROFILE:\nBrand Name: ${resolvedBrandContext.brandName}\nTagline: ${resolvedBrandContext.tagline}\nCore Brand Purpose / Mission: ${resolvedBrandContext.purpose}\nIndustry: ${resolvedBrandContext.industry}\nBrand Voice: ${resolvedBrandContext.voice}\nBrand Colors: ${resolvedBrandContext.colors.join(', ')}\nVisual Direction: ${resolvedBrandContext.visualStyle}` : 'MODE: Custom / Freeform Creative Mode'}`;

    try {
      const llmResult = await this.llmProvider.generateJSON({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
      });

      const validation = validateVideoSpec(llmResult);
      const finalSpec = validation.normalizedSpec;
      finalSpec.continuityContext = createSceneContinuityContext(finalSpec, rawPrompt);
      return finalSpec;
    } catch (err) {
      console.error('[CREATIVE DIRECTOR ERROR] Failed to generate VideoSpec via LLM:', err.message);
      
      // Fallback deterministic VideoSpec
      const fallbackSpec = this.createFallbackVideoSpec({
        prompt: rawPrompt,
        platform,
        aspectRatio,
        duration,
        mode: isBrandMode ? 'brand' : 'custom',
        brandContext: resolvedBrandContext,
      });
      fallbackSpec.continuityContext = createSceneContinuityContext(fallbackSpec, rawPrompt);
      return fallbackSpec;
    }
  }

  /**
   * Deterministic fallback VideoSpec when LLM service is unreachable or errors.
   */
  createFallbackVideoSpec({ prompt, platform, aspectRatio, duration, mode, brandContext }) {
    const dur = Number(duration) || 15;
    const isBrand = mode === 'brand' || Boolean(brandContext?.brandName);
    const brandName = brandContext?.brandName || 'Brand';
    const brandPurpose = brandContext?.purpose || brandContext?.productDescription || brandContext?.tagline || 'Next-generation intelligent solutions';

    const { normalizedSpec } = validateVideoSpec({
      version: '1.0',
      objective: isBrand
        ? `Showcase ${brandName}'s core mission: ${brandPurpose.slice(0, 120)}`
        : `Drive engagement for "${prompt.slice(0, 80)}"`,
      audience: brandContext?.audience || 'Target professional and social audience',
      tone: brandContext?.voice || 'Inspiring, authoritative, and forward-looking',
      visualStyle: brandContext?.visualStyle || 'High-contrast modern cinematic editorial with rich volumetric lighting',
      duration: dur,
      requestedDuration: dur,
      effectiveDuration: dur,
      providerDuration: dur,
      aspectRatio,
      platform,
      mode,
      brandContext,
      audioPlan: {
        voiceover: false,
        music: true,
        soundEffects: true,
      },
    });

    return normalizedSpec;
  }
}

export const defaultCreativeDirector = new CreativeDirectorService();
