/**
 * server/video/creative-director/llm-provider.js
 *
 * Abstract LLM provider layer for Creative Director prompt intelligence.
 * Wraps Azure OpenAI GPT-4o-mini with clean fallback & JSON structure handling.
 */

export class LLMProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.AZURE_OPENAI_API_KEY;
    this.endpoint = config.endpoint || process.env.AZURE_OPENAI_ENDPOINT || 'https://gpt5-azureai.openai.azure.com';
    this.deployment = config.deployment || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.4';
    this.apiVersion = config.apiVersion || '2024-02-15-preview';
  }

  /**
   * Complete prompt request expecting JSON output.
   */
  async generateJSON({ systemPrompt, userPrompt, temperature = 0.4 }) {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('LLM Provider credentials missing (AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT)');
    }

    const cleanEndpoint = this.endpoint.replace(/\/+$/, '');
    const url = `${cleanEndpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM call failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM response returned empty content');
    }

    try {
      return JSON.parse(content);
    } catch (err) {
      // Attempt JSON repair for common formatting issues
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse LLM JSON response: ${err.message}`);
    }
  }
}

export const defaultLLMProvider = new LLMProvider();
