// Builds the companyPersona payload shape expected by the backend's
// /api/generate-image and /api/generate-video handlers.
//
// IMPORTANT: those backend routes only read req.body.companyPersona (a fully
// resolved persona object with logoUrl/logo_url already on it) - they do NOT
// look up a persona by persona_id server-side. So any caller that only has a
// persona ID must resolve it to the full persona object first (e.g. from a
// personasList already fetched via /company-personas) and pass that object
// here before sending it to the backend.
//
// This mirrors buildMediaCompanyPersona() in Generate.jsx exactly, since that
// is the shape the backend is actually built to consume.
export const buildCompanyPersonaPayload = (companyPersona) => {
  if (!companyPersona) {
    return null;
  }

  return {
    id: companyPersona.id || companyPersona._id,
    name: companyPersona.name || companyPersona.personaName || companyPersona.persona_name,
    company: companyPersona.company,
    tagline: companyPersona.tagline,
    audience: companyPersona.audience,
    voice: companyPersona.voice,
    goals: companyPersona.goals,
    notes: companyPersona.notes,
    logoUrl: companyPersona.logoUrl || companyPersona.logo_url || "",
    logo_url: companyPersona.logo_url || companyPersona.logoUrl || "",
    logoPlacement: companyPersona.logoPlacement || companyPersona.logo_placement,
    logo_placement: companyPersona.logo_placement || companyPersona.logoPlacement,
    preserveOriginalLogo:
      companyPersona.preserveOriginalLogo ?? companyPersona.preserve_original_logo,
    preserve_original_logo:
      companyPersona.preserve_original_logo ?? companyPersona.preserveOriginalLogo,
    visualStyleInstructions:
      companyPersona.visualStyleInstructions ||
      companyPersona.visual_style_instructions ||
      "",
    visual_style_instructions:
      companyPersona.visual_style_instructions ||
      companyPersona.visualStyleInstructions ||
      "",
    tuningPrompt: companyPersona.tuningPrompt || companyPersona.tuning_prompt || "",
    tuning_prompt: companyPersona.tuning_prompt || companyPersona.tuningPrompt || "",
    brand_primary_color: companyPersona.brand_primary_color,
    brand_secondary_color: companyPersona.brand_secondary_color,
    brand_accent_color: companyPersona.brand_accent_color,
  };
};