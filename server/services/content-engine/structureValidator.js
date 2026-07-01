/**
 * Structure Validator for Growth OS Content Validation Layer
 * Rules:
 * - Valid H1 heading required.
 * - Minimum 4 H2 headings.
 * - Meta description required.
 * - SEO slug required.
 * - Conclusion section required.
 */
class StructureValidator {
  /**
   * Validates structural requirements of the blog payload
   * @param {Object} blogData - The blog data containing title, content, metaDescription, and slug
   * @returns {Object} Validation result: { valid: Boolean, errors: Array<String>, metrics: Object }
   */
  validate(blogData = {}) {
    const errors = [];
    const content = (blogData.content || '').trim();
    const metaDescription = (blogData.metaDescription || '').trim();
    const slug = (blogData.slug || '').trim();

    // 1. Valid H1 Heading Check
    const hasH1 = /^#\s+(.+)$/m.test(content) || /<h1>(.*?)<\/h1>/i.test(content);
    if (!hasH1) {
      errors.push("Valid H1 heading required (starts with '#' in Markdown or '<h1>' in HTML).");
    }

    // 2. Minimum 4 H2 Headings Check
    const h2MdMatches = content.match(/^##\s+/mg);
    const h2HtmlMatches = content.match(/<h2>/mig);
    const h2Count = (h2MdMatches ? h2MdMatches.length : 0) + (h2HtmlMatches ? h2HtmlMatches.length : 0);
    if (h2Count < 4) {
      errors.push(`Minimum 4 H2 headings required (current H2 headings count: ${h2Count}).`);
    }

    // 3. Meta Description Check
    const hasMeta = metaDescription.length > 0;
    if (!hasMeta) {
      errors.push("Meta description is required.");
    }

    // 4. SEO Slug Check
    const hasSlug = slug.length > 0;
    if (!hasSlug) {
      errors.push("SEO slug is required.");
    }

    // 5. Conclusion Section Check
    const conclusionRegex = /(?:conclusion|key\s+takeaways|summary|wrapping\s+up|final\s+thoughts)/i;
    const hasConclusion = conclusionRegex.test(content);
    if (!hasConclusion) {
      errors.push("Conclusion section is required (must contain keywords like 'conclusion', 'summary', 'key takeaways', or 'final thoughts').");
    }

    return {
      valid: errors.length === 0,
      errors,
      metrics: {
        hasH1,
        h2Count,
        hasMeta,
        hasSlug,
        hasConclusion
      }
    };
  }
}

const serviceInstance = new StructureValidator();
export default serviceInstance;
