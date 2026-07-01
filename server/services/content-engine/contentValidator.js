import wordCountValidator from './wordCountValidator.js';
import structureValidator from './structureValidator.js';



/**
 * Custom Error Class representing Content Validation Failures
 */
class ContentValidationError extends Error {
  constructor(errors = []) {
    const message = `Content validation failed: ${errors.join('; ')}`;
    super(message);
    this.name = 'ContentValidationError';
    this.errors = errors;
    this.statusCode = 400;
  }
}

/**
 * Content Validator Orchestrator for Growth OS Content Validation Layer
 */
class ContentValidator {
  constructor() {
    this.ContentValidationError = ContentValidationError;
  }

  /**
   * Helper to count words by whitespace splitting
   */
  countWords(text = '') {
    const clean = (text || '').trim();
    return clean ? clean.split(/\s+/).filter(w => w.length > 0).length : 0;
  }

  /**
   * Resiliently trims content if it exceeds 1200 words, preserving structure
   */
  autoTrimContent(content = '') {
    const wordCount = this.countWords(content);
    if (wordCount <= 1200) {
      return content;
    }

    const origHasConclusion = /(?:conclusion|key\s+takeaways|summary|wrapping\s+up|final\s+thoughts)/i.test(content);
    console.log(`[CONTENT VALIDATOR] Word count (${wordCount}) exceeds 1200. Original has conclusion: ${origHasConclusion}.`);

    const lines = content.split(/\r?\n/);
    // Find the index of the conclusion section header
    const conclusionRegex = /^(?:##|###)\s+.*(?:conclusion|key\s+takeaways|summary|wrapping\s+up|final\s+thoughts)/i;
    let conclusionIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (conclusionRegex.test(lines[i])) {
        conclusionIndex = i;
        break;
      }
    }

    console.log(`[CONTENT VALIDATOR] Identified conclusionIndex: ${conclusionIndex} (Line: "${conclusionIndex !== -1 ? lines[conclusionIndex] : 'N/A'}")`);

    // If we can't find a conclusion header, fall back to the last 15% of lines
    if (conclusionIndex === -1) {
      conclusionIndex = Math.floor(lines.length * 0.85);
      console.log(`[CONTENT VALIDATOR] Falling back to conclusionIndex: ${conclusionIndex}`);
    }

    const preLines = lines.slice(0, conclusionIndex);
    const postLines = lines.slice(conclusionIndex);

    // We want to reduce words until total <= 1180 words (a safe margin)
    let currentTotal = wordCount;
    const targetWords = 1180;

    // Modify preLines backwards
    for (let i = preLines.length - 1; i >= 0; i--) {
      if (currentTotal <= targetWords) break;

      const line = preLines[i].trim();
      // Skip headers, list items, code blocks, empty lines, and links
      if (!line) continue;
      if (line.startsWith('#') || line.startsWith('-') || line.startsWith('*') || line.startsWith('`') || line.startsWith('|') || line.startsWith('>') || /^\d+\./.test(line)) {
        continue;
      }

      // It's a plain text line. Split it into sentences.
      // Use regex to split on sentence boundaries (. ! ?) followed by whitespace
      const sentences = line.split(/(?<=[.!?])\s+/);
      if (sentences.length > 1) {
        // Remove sentences from the end of this line one by one
        while (sentences.length > 1 && currentTotal > targetWords) {
          sentences.pop();
          const newLine = sentences.join(' ');
          preLines[i] = newLine;
          
          // Recalculate word count
          const newContent = [...preLines, ...postLines].join('\n');
          currentTotal = this.countWords(newContent);
        }
      } else {
        // If only one sentence, we can clear the line
        preLines[i] = '';
        const newContent = [...preLines, ...postLines].join('\n');
        currentTotal = this.countWords(newContent);
      }
    }

    const healedContent = [...preLines, ...postLines].join('\n');
    const healedHasConclusion = /(?:conclusion|key\s+takeaways|summary|wrapping\s+up|final\s+thoughts)/i.test(healedContent);
    console.log(`[CONTENT VALIDATOR] Self-healing completed. New word count: ${this.countWords(healedContent)} words. Healed has conclusion: ${healedHasConclusion}`);
    return healedContent;
  }

  /**
   * Validates a blog payload against all word count and structure validation rules
   * @param {Object} blogData - The blog payload: { title, content, metaDescription, slug }
   * @returns {Object} Combined validation results: { valid: Boolean, errors: Array<String>, metrics: Object }
   */
  validate(blogData = {}) {
    // Resilient auto-trimming for word count limits
    if (blogData.content) {
      blogData.content = this.autoTrimContent(blogData.content);
    }

    const errors = [];
    const metrics = {};

    // Run Word Count validation
    const wcResult = wordCountValidator.validate(blogData.content);
    if (!wcResult.valid) {
      errors.push(...wcResult.errors);
    }
    metrics.wordCount = wcResult.metrics.wordCount;

    // Run Structure validation
    const structResult = structureValidator.validate(blogData);
    if (!structResult.valid) {
      errors.push(...structResult.errors);
    }
    
    // Merge metrics
    Object.assign(metrics, structResult.metrics);

    return {
      valid: errors.length === 0,
      errors,
      metrics
    };
  }
}

const serviceInstance = new ContentValidator();
export default serviceInstance;
