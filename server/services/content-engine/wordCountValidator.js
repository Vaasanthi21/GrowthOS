/**
 * Word Count Validator for Growth OS Content Validation Layer
 * Rule: Word count must be between 800 and 1200 words (inclusive).
 */
class WordCountValidator {
  /**
   * Validates word count of the blog content
   * @param {String} content - The markdown or HTML body content
   * @returns {Object} Validation result: { valid: Boolean, errors: Array<String>, metrics: Object }
   */
  validate(content = '') {
    const errors = [];
    const cleanContent = (content || '').trim();
    
    // Split on whitespace to get word tokens
    const words = cleanContent ? cleanContent.split(/\s+/).filter(w => w.length > 0) : [];
    const wordCount = words.length;

    if (wordCount < 800 || wordCount > 1200) {
      errors.push(`Content word count must be between 800 and 1200 words (current: ${wordCount} words).`);
    }

    return {
      valid: errors.length === 0,
      errors,
      metrics: {
        wordCount
      }
    };
  }
}

const serviceInstance = new WordCountValidator();
export default serviceInstance;
