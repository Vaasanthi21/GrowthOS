import aiService from '../aiService.js';



class BriefGenerator {
  /**
   * Generates a structured SEO Brief for a given keyword
   * @param {String} keyword - The primary seed keyword
   * @returns {Promise<Object>} The structured SEO Brief object
   */
  async generateBrief(keyword) {
    if (!keyword || !keyword.trim()) {
      throw new Error('Keyword is required to generate an SEO Brief');
    }

    const cleanKeyword = keyword.trim();

    const systemPrompt = `You are a Senior SEO Analyst, Search Intent Expert, and Content Planner.
Your task is to analyze the given keyword and generate a comprehensive, strategic SEO Brief.
You MUST respond strictly in a valid JSON object format matching the exact structure below. Do not wrap it in markdown codeblocks.

Required JSON Structure:
{
  "primaryKeyword": "The exact input keyword",
  "secondaryKeywords": [
    "High-impact secondary keyword 1",
    "High-impact secondary keyword 2",
    "High-impact secondary keyword 3"
  ],
  "searchIntent": "Informational" | "Commercial" | "Transactional" | "Navigational",
  "h1Suggestion": "A compelling, click-worthy H1 title containing the primary keyword",
  "h2Suggestions": [
    "Subheading 1 addressing a core talking point",
    "Subheading 2 detailing technical or execution steps",
    "Subheading 3 providing best practices or optimization tips",
    "Subheading 4 focusing on business value or KPIs"
  ],
  "semanticKeywords": [
    "Relevant LSI keyword or key phrase 1",
    "Relevant LSI keyword or key phrase 2",
    "Relevant LSI keyword or key phrase 3"
  ],
  "recommendedWordCount": 1000
}`;

    const userPrompt = `Generate a detailed SEO Brief for the keyword: "${cleanKeyword}"`;

    try {
      console.log(`[SEO BRIEF ENGINE] Triggering AI prompt to generate brief for keyword: "${cleanKeyword}"...`);
      const responseText = await aiService.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.6, max_tokens: 1500 });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (
        parsedData.primaryKeyword &&
        parsedData.secondaryKeywords &&
        parsedData.searchIntent &&
        parsedData.h1Suggestion &&
        parsedData.h2Suggestions &&
        parsedData.semanticKeywords &&
        parsedData.recommendedWordCount
      ) {
        return parsedData;
      }
      throw new Error('Sourced AI JSON is missing required SEO Brief fields.');
    } catch (err) {
      console.warn('[SEO BRIEF ENGINE WARNING] generateBrief failed. Sourcing local resilient mock fallback...', err.message);
      
      // Resilient fallback brief
      return {
        primaryKeyword: cleanKeyword,
        secondaryKeywords: [
          `best ${cleanKeyword} tools`,
          `how to implement ${cleanKeyword}`,
          `${cleanKeyword} setup guide`
        ],
        searchIntent: 'Informational',
        h1Suggestion: `The Ultimate Strategic Guide to ${cleanKeyword}`,
        h2Suggestions: [
          `Introduction to ${cleanKeyword}`,
          `Core Pillars of ${cleanKeyword} Optimization`,
          `Step-by-Step Implementation Workflow`,
          `Mitigating Common Pitfalls and Bottlenecks`
        ],
        semanticKeywords: [
          `performance optimization`,
          `system integration`,
          `capacity planning`
        ],
        recommendedWordCount: 1000
      };
    }
  }
}

const serviceInstance = new BriefGenerator();
export default serviceInstance;
