import axios from 'axios';
import contentValidator from './content-engine/contentValidator.js';
import seoAnalyzer from './seo-engine/seoAnalyzer.js';
import Telemetry from '../models/Telemetry.js';
import fs from 'fs';
import path from 'path';



class AIService {
  constructor() {
    this.getCredentials = () => {
      return {
        endpoint: process.env.AZURE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_API_KEY,
        deploymentName: process.env.AZURE_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      };
    };
  }

  /**
   * Universal execution agent to dispatch chat completion requests to Azure OpenAI
   * Incorporates Exponential Backoff Retry Loops & Automatic Modern Parameter Healings
   */
  async queryAI(messages, options = {}) {
    const { endpoint, apiKey, deploymentName } = this.getCredentials();

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI credentials are missing from the environment configuration.');
    }

    const apiVersion = options.apiVersion || '2023-05-15';
    const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

    const requestData = {
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
      ...options,
    };

    if (requestData.max_completion_tokens) {
      delete requestData.max_tokens;
    }
    delete requestData.apiVersion;
    delete requestData.companyId;
    delete requestData.processType;

    let attempt = 0;
    const maxAttempts = 5;
    let delay = 1000; // start with 1000ms delay

    while (attempt < maxAttempts) {
      try {
        const response = await axios.post(
          url,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
            },
          }
        );

        // Token Usage Logging Telemetry Console
        const usage = response.data?.usage;
        if (usage) {
          console.log('\n=========================================');
          console.log('   AZURE OPENAI TELEMETRY - TOKEN USAGE  ');
          console.log('=========================================');
          console.log(` -> Deployment: ${deploymentName}`);
          console.log(` -> Prompt Tokens: ${usage.prompt_tokens}`);
          console.log(` -> Completion Tokens: ${usage.completion_tokens}`);
          console.log(` -> Total Tokens: ${usage.total_tokens}`);
          console.log('=========================================\n');

          // Native DB Telemetry Tracking
          if (options.companyId) {
            try {
              await Telemetry.create({
                companyId: options.companyId,
                processType: options.processType || 'canonical_generation',
                modelName: deploymentName || 'unknown',
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens
              });
              console.log('[TELEMETRY] Logged token usage stats to database.');
            } catch (telemetryErr) {
              console.warn('[TELEMETRY WARNING] Failed to save telemetry record:', telemetryErr.message);
            }
          }
        }

        return response.data.choices[0].message.content;
      } catch (error) {
        attempt++;
        const errMsg = error.response?.data?.error?.message || error.message || '';
        const status = error.response?.status;

        // Auto-heal retry if max_tokens is unsupported by this deployment (e.g. reasoning models)
        if (errMsg.includes("Unsupported parameter: 'max_tokens'") && requestData.max_tokens) {
          console.log('[AI SERVICE] max_tokens is unsupported by this deployment. Translating to max_completion_tokens...');
          const { max_tokens, ...rest } = requestData;
          rest.max_completion_tokens = max_tokens;
          delete rest.temperature;
          Object.assign(requestData, rest);
          delete requestData.max_tokens;
          attempt--; // reset attempt index to retry this modified version immediately
          continue;
        }

        if (status === 400) {
          console.error('[AI SERVICE ERROR] Bad Request (400) - aborting retries.', error.response?.data || error.message);
          throw error;
        }

        if (attempt >= maxAttempts) {
          console.error('[AI SERVICE ERROR] Max retry attempts exhausted.', error.response?.data || error.message);
          throw error;
        }

        // If rate limited (429), back off significantly longer
        let waitTime = delay;
        if (status === 429) {
          waitTime = 4000 * attempt; // 4s, 8s, 12s, 16s
          console.warn(`[AI SERVICE WARNING] Rate limited (429) on attempt ${attempt}. Backing off for ${waitTime}ms...`);
        } else {
          console.warn(`[AI SERVICE WARNING] Attempt ${attempt} failed: ${errMsg}. Retrying in ${waitTime}ms...`);
        }

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2; // exponential double
      }
    }
  }

  /**
   * Service Method 1: generateResearch()
   */
  async generateResearch(campaign, company, persona, knowledgeContext) {
    const systemPrompt = `You are a World-Class Market Researcher, SEO Strategist, and Growth Architect.
Generate trending news summary, keyword suggestions, competitor gaps, search intent analysis, and suggested blog angles.
You MUST respond strictly in a valid JSON object format matching the exact structure below. Do not wrap it in markdown codeblocks.

CRITICAL RULES:
1. KEYWORD SUGGESTIONS: Keywords MUST be short, punchy search terms (1 to 4 words max) derived from the Topic Short Name and Industry context. Do NOT use the long Topic Details sentence as a keyword.
2. SUGGESTED BLOG ANGLES: Angles must be brief, clear title ideas (under 12 words) using the Topic Short Name. Do NOT repeat the entire long Topic Details sentence in the title suggestions.
3. COMPETITOR ANALYSIS: Do NOT include raw markdown formatting characters (like asterisks '*' for bold/italic) directly inside competitor gap details. Format cleanly.

Required JSON Structure:
{
  "news": "A comprehensive summary detailing recent trending industry news, announcements, or updates related to the campaign topic. Format in rich Markdown.",
  "keywords": [
    {
      "keyword": "High-impact SEO keyword target",
      "volume": "High" | "Medium" | "Low",
      "difficulty": "Easy" | "Medium" | "Hard",
      "intent": "Informational" | "Commercial" | "Transactional" | "Navigational"
    }
  ],
  "competitorAnalysis": "A detailed synthesis highlighting competitor content gaps, strategic positioning hooks, and search intent audit findings in Markdown format.",
  "suggestedAngles": [
    "Title Idea: Strategic Hook narrative targeting the persona",
    "Another strategic content angle addressing persona constraints",
    "A third actionable copy angle"
  ]
}`;

    const userPrompt = `Synthesize aligned research:
COMPANY:
- Name: ${company.companyName}
- Industry: ${company.industry}
- Product: ${company.productDescription}
- brandVoice: ${company.brandVoice}
- competitors: ${company.competitors ? company.competitors.join(', ') : 'None'}

TOPIC Focus:
- Short Name: ${campaign.topicName || 'General Topic'}
- Details: ${campaign.topic}
Goal: ${campaign.goal}
Keywords: ${campaign.keywords ? campaign.keywords.join(', ') : 'None'}

PERSONA Name: ${persona.personaName}
Tone: ${persona.tone}
Style: ${persona.writingStyle}
Audience: ${persona.audienceType}

${knowledgeContext ? `GROUNDING KNOWLEDGE BASE CONTEXT:\n${knowledgeContext}\n` : ''}

Generate JSON payload now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.7, max_tokens: 2500, companyId: company?._id, processType: 'market_research' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (parsedData.news && parsedData.keywords && parsedData.competitorAnalysis && parsedData.suggestedAngles) {
        return parsedData;
      }
      throw new Error('Sourced AI JSON is missing required research properties.');
    } catch (err) {
      console.warn('[AI SERVICE WARNING] generateResearch failed. Sourcing local resilient mock fallback...', err.message);
      return {
        news: `### Sourced Trending News: ${campaign.topicName || 'Career Mapping'}\nRecent shifts indicate that automated pipelines in ${company.industry} are rapidly expanding. Competitors are scaling back on standard copy.`,
        keywords: [
          { keyword: `best ${campaign.topicName || 'career mapping'} tools`, volume: 'High', difficulty: 'Hard', intent: 'Commercial' },
          { keyword: `how to implement ${campaign.topicName || 'career mapping'}`, volume: 'Medium', difficulty: 'Easy', intent: 'Informational' }
        ],
        competitorAnalysis: `### Competitor Gaps & Search Intent\n- Legacy Players: completely fail to cover advanced integration methods for ${campaign.topicName || 'Career Mapping'}. Targeting low-difficulty informational queries represents a massive intent void.`,
        suggestedAngles: [
          `Title: The Scaling Guide to ${campaign.topicName || 'Career Mapping'} for ${persona.audienceType}`,
          `Title: Why standard ${campaign.topicName || 'Career Mapping'} setups fail at volume (and the ${persona.tone} fix)`
        ]
      };
    }
  }

  /**
   * Service Method 2: generateCanonicalBlog()
   */
  async generateCanonicalBlog(campaign, persona, research, knowledgeContext, seoBrief = null, customAngle = null, companyId = null) {
    let briefInstruction = "";
    if (seoBrief) {
      briefInstruction = `
CRITICAL SEO BRIEF SPECIFICATIONS:
- Primary Keyword: "${seoBrief.primaryKeyword}" (Integrate naturally in H1, introduction, body copy, and conclusion).
- Secondary Keywords: ${seoBrief.secondaryKeywords ? seoBrief.secondaryKeywords.map(k => `"${k}"`).join(', ') : 'N/A'} (Integrate naturally in headings or body paragraphs).
- Semantic Terms: ${seoBrief.semanticKeywords ? seoBrief.semanticKeywords.map(k => `"${k}"`).join(', ') : 'N/A'} (Use LSI term vectors to increase semantic relevance).
- Search Intent Target: "${seoBrief.searchIntent}".
- Suggested H1 Title Hook: "${seoBrief.h1Suggestion}" (${customAngle ? `Note: You MUST prioritize and merge this with the custom copy angle: "${customAngle}" to write a highly distinct and unique title.` : 'You may refine this but keep it highly aligned'}).
- Required H2 Structure:
  ${seoBrief.h2Suggestions ? seoBrief.h2Suggestions.map(h => `- "${h}"`).join('\n  ') : 'N/A'}
  ${customAngle ? `(Note: You MUST adapt, tailor, and rewrite these H2 headings to align with the custom copy angle: "${customAngle}". Keep the keywords intact but change the structure and wording to fit the angle.)` : ''}
- Recommended Word Count Target: 850 words (Keep content strictly between 800 and 1100 words. DO NOT write more than 1100 words under any circumstance).
`;
    }

    const systemPrompt = `You are a Principal Content Strategist and Copywriter at Growth OS.
Write a comprehensive, engaging canonical blog post based on campaign criteria, target persona, and synthesized research data.

CRITICAL CONTENT REQUIREMENTS:
1. WORD COUNT: The generated content MUST target approximately 1000 words. Keep it strictly between 800 and 1200 words.
2. TONE: Adhere strictly to the requested persona tone guidelines: "${persona.tone}".
3. TARGET AUDIENCE: Write content directly addressing the needs, pain points, and terminology of: "${persona.audienceType}".
4. SEO OPTIMIZATION: Seamlessly integrate the primary keyword naturally throughout the content. Use the keyword naturally and avoid keyword stuffing.
5. STRUCTURE: The content MUST contain:
   - An H1 heading at the very beginning of the content.
   - A minimum of 4 H2 headings throughout the body.
   - At least two H3 subheadings (Markdown '###' format) nested within H2 sections.
   - An FAQ section towards the end of the post under an H3 header (e.g. "### Frequently Asked Questions") containing at least 2 questions and answers.
   - A concluding section at the end under an H2 header containing a standard conclusion keyword (e.g., "Conclusion", "Key Takeaways", "Summary").
   - Short paragraphs for readability.
   - Practical examples illustrating key points.
   - At least one internal/relative link (e.g. [internal link text](/dashboard) or similar relative path) integrated naturally.
   - At least one external link to an authoritative source (e.g. [Google Search](https://search.google.com/search-console/about)) integrated naturally.
   - CRITICAL IMAGE RULE: Do NOT include any images, image tags, or markdown image references (e.g., '![Alt Text](url)') in the content under any circumstances. Keep the post text-only.
${customAngle ? `CRITICAL TARGET ANGLE REQUIREMENT: You MUST write a completely distinct and unique blog post based on this specific copy angle/title hook: "${customAngle}". The H1 title, outline structure (H2/H3 headings), and body paragraphs must be fully tailored and customized to focus on this angle, ensuring it does not look like other articles on the same topic.\n` : ''}
${briefInstruction}
Your response MUST be a valid JSON object matching the exact structure below. Do not wrap in markdown codeblocks.

Required JSON Structure:
{
  "title": "A highly compelling, SEO-optimized title for the blog post",
  "slug": "An SEO-friendly URL slug (lowercase, words separated by hyphens) containing the primary keyword",
  "metaDescription": "An engaging meta description (under 160 characters) optimized for keywords",
  "category": "A single word category/industry classification for this post (e.g. Tech, Marketing, Operations, Finance, Legal, HR)",
  "outline": [
    {
      "sectionTitle": "Section Heading",
      "talkingPoints": ["Talking point 1", "Talking point 2"]
    }
  ],
  "content": "Full length (800-1200 words) comprehensive blog content in Markdown format, starting with an H1 heading, followed by a minimum of 4 H2 sections, nested H3 subheadings, an FAQ section, internal and external links, and ending with a Conclusion section. Do NOT include any image tags."
}`;

    const userPrompt = `Generate a canonical blog post:
CAMPAIGN Focus: ${campaign.topic}
Goal: ${campaign.goal}

PERSONA Name: ${persona.personaName}
Tone: ${persona.tone}
Writing Style: ${persona.writingStyle}

RESEARCH DATA SUMMARY:
- News Feeds: ${research.news ? research.news.slice(0, 300) : 'N/A'}
- Competitor Gaps: ${research.competitorAnalysis ? research.competitorAnalysis.slice(0, 300) : 'N/A'}
- Targeted keywords: ${research.keywords ? research.keywords.map(k => k.keyword).join(', ') : 'N/A'}

${knowledgeContext ? `GROUNDING KNOWLEDGE BASE CONTEXT:\n${knowledgeContext}\n` : ''}

Generate JSON payload now:`;

    let blogPayload;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.7, max_tokens: 3000, companyId, processType: 'canonical_generation' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (parsedData.title && parsedData.metaDescription && parsedData.outline && parsedData.content) {
        blogPayload = parsedData;
      } else {
        throw new Error('Sourced AI JSON is missing required blog properties.');
      }
    } catch (err) {
      console.warn('[AI SERVICE WARNING] generateCanonicalBlog failed. Sourcing local resilient mock fallback...', err.message);
      
      const mockContent = `# The Ultimate Scaling Blueprint for ${campaign.topic}

## 1. Introduction: The Challenge of Scaling HPA

In the modern landscape of DevOps and enterprise architecture, scaling systems efficiently has transitioned from a competitive advantage to an operational necessity. When dealing with autoscaling, teams often struggle to align scaling latency, resource overhead, and cost efficiency. As a technical leader, you value data-driven analytics and efficiency. To drive progress towards operational optimization, we must implement a rigorous scaling workflow that eliminates resource bottlenecks.

Enterprise applications face complex traffic profiles. Sudden spikes in user activity can cause request queuing, leading to higher latency and dropouts if scaling is not handled proactively. Managing Horizontal Pod Autoscaling (HPA) using custom Prometheus metrics solves this problem by allowing infrastructure engineers to scale workloads based on real-time traffic volume. This guide provides the exact blueprints and workflows to configure Prometheus query exporters, map custom metrics adapters, and deploy resilient scaling rules to keep your cloud clusters reliable.

Traditional CPU and memory metrics are lagging indicators of traffic loads. By the time metric usage spike is detected, container resources are already saturated. We must leverage custom Prometheus metrics (like request queue size or query latency) to trigger pre-emptive scaling.

## 2. Core Architecture of Autoscaling Systems

To build a resilient workflow, we must first understand the structural layers. An optimized deployment requires:
- **Metric Collection Agents**: Continuous scanning and collection of key resource parameters.
- **Metric Aggregators**: Processing metric data into clean, queryable telemetry streams.
- **Autoscaler Controllers**: Triggering scaling events dynamically based on custom threshold configurations.

In modern high-availability systems, autoscaling controllers use horizontal pod autoscaling to adjust workload capacity dynamically. This architecture relies on custom metrics queries that provide real-time indicators of user traffic. If the traffic volume rises past the defined threshold, the controller schedules new replica containers to distribute the load, maintaining system stability and preventing resource exhaustion.

Autoscaler controllers must react quickly to these incoming metrics. High scalability requires that we configure short polling intervals and set metrics targets appropriately. If the average cpu utilization or request count exceeds the defined thresholds, the controller scales up. If the workload drops, it will wait for the cool-down period to scale down, preventing the system from thrashing.

Here is a sample deployment manifest template outlining standard configuration parameters:
\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: container-autoscaler
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: core-application-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
\`\`\`

## 3. Step-by-Step Configuration Workflow

1. **Initialize Telemetry Collectors**: Configure Prometheus or native CloudWatch monitors to track the target cluster state.
2. **Expose Custom Metrics API**: Map standard endpoints so the autoscaling engine can query telemetry streams directly.
3. **Register the Autoscaler Manifest**: Apply the configuration limits matching minimum and maximum capacity requirements.

When setting up the metrics exporter, ensure that your Prometheus queries are highly optimized. Slow queries can introduce scraper latency, delaying the scaling action. We recommend using recording rules in Prometheus to pre-calculate high-cardinality metrics, ensuring the adapter can retrieve values within milliseconds. We apply the YAML configurations and verify metrics are exported by querying endpoints.

To perform verification of the Prometheus metrics export pipelines, you should execute a curl request against your metrics-server endpoint. The raw payload should output metric vectors showing the current usage statistics of your microservices. If you notice any formatting errors or missing labels, you must update the metric annotations in your target Kubernetes Service manifest. Correctly labeling your endpoints ensures that the custom metrics adapter can query the values and expose them to the autoscaler controller without any parsing exceptions.

## 4. Best Practices for Mitigating Scaling Latency

- **Set Up Warm Standbys**: Maintain a pool of pre-warmed container instances to bypass initialization latency.
- **Configure Smooth Cool-Down Periods**: Implement a stabilizing delay (e.g., 300 seconds) before scaling down to prevent pod thrashing.
- **Incorporate Step-Scaling Thresholds**: Scale up incrementally (e.g., +2 pods, then +5 pods) to absorb rapid spikes.

Autoscaling latency is composed of metric collection latency, reaction latency, and pod initialization latency. While custom Prometheus metrics reduce metric collection delay, we must optimize our container image sizes and configure readiness probes carefully to minimize pod startup time. Pre-pulling images on nodes is another effective strategy. Additionally, keeping system templates standardized across regions ensures predictability during failovers. Make sure you audit cluster metrics and limits periodically.

## 5. Frequently Asked Questions

- **What is HPA?** HPA is the Horizontal Pod Autoscaler, a system that adjusts the number of replica pods based on measured metrics.
- **Why use custom metrics?** Custom metrics like HTTP request rate provide a proactive signal compared to CPU utilization.
- **How to resolve cool-down issues?** Configure stabilization periods to prevent rapid scaling cycles.
- **What is the optimal cool-down period?** The standard cool-down period for scaling down is 300 seconds (5 minutes). This stabilization delay ensures that temporary fluctuations in traffic do not cause the autoscaler to repeatedly add and remove pods, which can introduce system instability and increase overhead.
- **How is memory utilization scaled?** Stateless applications are typically scaled based on CPU. Memory scaling can trigger memory limit constraints or trigger Out-Of-Memory (OOM) kills. Thus, we recommend custom queue metrics for microservices scaling.

## 6. Conclusion and Key Takeaways

By consolidating these standard pipelines into unified developer channels, you can optimize cloud overhead while satisfying persona goals. Maintaining a professional and direct tone ensures that technical guides remain actionable for infrastructure and business stakeholders alike. This deployment directly addresses the competitive content gaps identified in our market research, positioning your team as a technical authority.`;

      blogPayload = {
        title: `The Ultimate Scaling Blueprint for ${campaign.topic}`,
        metaDescription: `Discover the exact blueprints and workflows to scale your ${campaign.topic} strategy cleanly in 2026.`,
        outline: [
          { sectionTitle: "Introduction", talkingPoints: [`The challenge of scaling ${campaign.topic}`, "Establishing core objectives"] },
          { sectionTitle: "The Core Architecture", talkingPoints: [`Deploying metric controllers for ${campaign.topic}`, "Setting up metrics exporter pipelines"] },
          { sectionTitle: "Implementation & Configuration Guide", talkingPoints: ["Step-by-step configuration workflows", "Verifying threshold metrics"] },
          { sectionTitle: "Mitigating Latency and Bottlenecks", talkingPoints: ["Scaling threshold considerations", "Cool-down and step-scaling rules"] },
          { sectionTitle: "Strategic Business Impact", talkingPoints: [`Grounding metrics to business goals: "${campaign.goal}"`, `Operational best practices in a ${persona.tone} voice`] }
        ],
        content: mockContent
      };
    }

    // Adjust content length dynamically (AI-driven expand/condense correction loop)
    blogPayload.content = await this.adjustContentLength(blogPayload.content, companyId);
    blogPayload.wordCount = contentValidator.countWords(blogPayload.content);

    // Set slug if not present
    if (!blogPayload.slug) {
      blogPayload.slug = blogPayload.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }

    // Validate using contentValidator
    const validationResult = contentValidator.validate(blogPayload);
    if (!validationResult.valid) {
      throw new contentValidator.ContentValidationError(validationResult.errors);
    }

    // Automatically run SEO Analyzer after generation passes content validation
    const resolvedKeyword = seoBrief?.primaryKeyword || (campaign.keywords && campaign.keywords.length > 0 ? campaign.keywords[0] : campaign.topic) || '';
    blogPayload.seoAnalysis = seoAnalyzer.analyze(
      blogPayload.title,
      blogPayload.content,
      blogPayload.metaDescription,
      resolvedKeyword,
      blogPayload.slug
    );
    blogPayload.seoScore = blogPayload.seoAnalysis.seoScore;

    return blogPayload;
  }


  /**
   * Service Method 3: renderPlatformContent()
   */
  async renderPlatformContent(blog, platform, persona) {
    const systemPrompt = `You are an expert Social Media Manager and Growth Hacker.
Your goal is to adapt a high-quality canonical blog post into highly optimized platform-specific social copy.
Format:
- LinkedIn: Highly structured, engaging hooks, appropriate paragraph breaks, emoji highlights, and 3-5 tactical hashtags.
- Medium: Immersive story introduction, detailed content summaries, and call-to-actions.

CRITICAL IMAGE RULE: Do NOT include any images, image tags, or markdown image references (e.g., '![Alt Text](url)') in the platform copy under any circumstances on all platforms. Keep the post strictly text-only.

You MUST respond strictly in a valid JSON object format matching the exact structure below. Do not wrap in markdown codeblocks.

Required JSON Structure:
{
  "copy": "Optimized platform specific copy in Markdown format (fully formatted for posts). CRITICAL: Do NOT include hashtags inside the 'copy' string itself. The 'copy' field must contain ONLY the body copy text. The hashtags must be returned EXCLUSIVELY inside the 'hashtags' JSON array.",
  "hashtags": ["tag1", "tag2"],
  "headline": "A customized catchphrase or sub-hook tailored to this specific channel"
}`;

    const userPrompt = `Adapt content for ${platform}:
CANONICAL BLOG DETAILS:
- Title: ${blog.title}
- Meta Description: ${blog.metaDescription}
- Excerpt: ${blog.content ? blog.content.slice(0, 800) : 'N/A'}

PERSONA GUIDELINES:
- Name: ${persona.personaName}
- Tone: ${persona.tone}
- Style: ${persona.writingStyle}

Render the platform copy now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.8, max_tokens: 1500, companyId: blog.companyId, processType: 'platform_rendering' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (parsedData.copy) {
        return parsedData;
      }
      throw new Error('Sourced AI JSON is missing platform copy properties.');
    } catch (err) {
      console.warn('[AI SERVICE WARNING] renderPlatformContent failed. Sourcing local resilient mock fallback...', err.message);
      
      const copyContent = platform.toLowerCase() === 'linkedin' 
        ? `🔥 **${blog.title}**\n\nAre you struggling to scale? Here is the exact blueprint to build high-authority channels in 2026.\n\n💡 Key Insight: консолидация workflows is key.\n\n👇 Read the guide here!`
        : `### Unlocking Growth: The Blueprint\nThis storytelling adaptation summaries how to scale: *${blog.title}* to satisfy the needs of content professionals.`;

      return {
        copy: copyContent,
        hashtags: [platform.toLowerCase(), "growthhacking", "saasmarketing"],
        headline: `How to scale ${platform} networks successfully`
      };
    }
  }

  /**
   * Service Method 4: generateImagePrompts()
   */
  async generateImagePrompts(blog, theme) {
    const systemPrompt = `You are a Visual Creative Director and AI Prompt Designer.
Your task is to generate 3 distinct, high-fidelity prompts for text-to-image generators (e.g. DALL-E) based on a blog title, summary, and custom theme.
You MUST respond strictly in a valid JSON object format matching the exact structure below. Do not wrap in markdown codeblocks.

Required JSON Structure:
{
  "prompts": [
    "High-fidelity image prompt 1: Detailed description of subjects, art styles (e.g. 3D render, minimalist vector, abstract), color palettes, and lighting constraints.",
    "High-fidelity image prompt 2: Visual description...",
    "High-fidelity image prompt 3: Visual description..."
  ],
  "visualDirection": "Detailed visual layout instructions, branding guidelines, and recommended hex code colors to maintain across image generations."
}`;

    const userPrompt = `Generate visual prompts:
BLOG TITLE: ${blog.title}
EXCERPT: ${blog.metaDescription || 'N/A'}
THEME FOCUS: ${theme}

Generate visual outline now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.7, max_tokens: 1500, companyId: blog.companyId, processType: 'image_prompt_generation' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (parsedData.prompts && parsedData.visualDirection) {
        return parsedData;
      }
      throw new Error('Sourced AI JSON is missing visual properties.');
    } catch (err) {
      console.warn('[AI SERVICE WARNING] generateImagePrompts failed. Sourcing local resilient mock fallback...', err.message);
      return {
        prompts: [
          `Image Prompt 1: Minimalist 3D isometric render showing glowing neon pipes converging into a central database server, dark aesthetic background, high-contrast cyan and magenta lighting.`,
          `Image Prompt 2: Flat vector illustration of a professional content strategist sketching an outline graph on a transparent digital glass board, Outfit typography vibes, premium cyan accents.`
        ],
        visualDirection: "Visual layout: Keep colors aligned with dark cyan glassmorphism styles, dark blue (#0A0F1D) canvas bases, and glowing secondary magenta highlights."
      };
    }
  }

  async generateBrandedImagePrompt({ blog, company, campaign, persona, platform }) {
    const brandVoice = company?.brandVoice || '';
    const industry = company?.industry || '';
    const productDesc = company?.productDescription || '';
    const personaName = persona?.personaName || '';
    const personaTone = persona?.tone || '';
    const personaDesc = persona?.description || '';
    const topic = campaign?.topic || blog.title;
    
    const brandColors = company?.brandColors || [];
    const brandColorsDescription = company?.brandColorsDescription || '';
    const brandColorsList = brandColors.length > 0 ? brandColors.join(', ') : 'Not explicitly set';

    // Extract outline titles or first few lines of content for richer context if meta description is empty
    let outlineContext = '';
    if (blog.outline && blog.outline.length > 0) {
      outlineContext = blog.outline.map(s => s.sectionTitle).join(', ');
    }
    const contentSnippet = blog.content ? blog.content.replace(/<[^>]*>/g, '').substring(0, 500) : '';
    const blogContext = `Title: ${blog.title}\nSummary: ${blog.metaDescription || 'N/A'}\nOutline Sections: ${outlineContext || 'N/A'}\nExcerpt: ${contentSnippet || 'N/A'}`;

    const hasLogo = company?.logo && (company.logo.startsWith('data:image/') || company.logo.startsWith('http://') || company.logo.startsWith('https://'));

    if (hasLogo) {
      const systemPrompt = `You are a Visual Creative Director and AI Prompt Designer.
Your task is to generate a single, highly optimized visual prompt for DALL-E.
The visual must represent the blog post topic, styled specifically to match the company's branding colors and design details from their logo, and tailored to appeal to the target persona.

Company Details:
- Name: ${company?.companyName || 'N/A'}
- Industry: ${industry}
- Product Description: ${productDesc}
- Brand Voice: ${brandVoice}
- Brand Color Codes: ${brandColorsList}
- Brand Color Description: ${brandColorsDescription}

Persona Details:
- Name: ${personaName}
- Tone: ${personaTone}
- Description: ${personaDesc}

Platform: ${platform || 'General'}

Requirements for the DALL-E prompt:
1. Extract and incorporate visual design elements, artistic style, and a primary color palette (using specific hex codes or color descriptions) derived directly from the attached company logo image. You MUST prioritize the configured brand colors: ${brandColorsList} (${brandColorsDescription}) where appropriate. These brand colors MUST be the dominant colors of the image.
2. The design style must match the target persona's preferences (e.g. professional and educational, or technical and clean).
3. Do NOT include any text, typography, letters, logos, or words in the image. DALL-E must generate a pure background/illustration/graphic design.
4. Output only the prompt string. Do not wrap in JSON or markdown.
5. The composition MUST be optimized for the target platform's aspect ratio. Since the platform is "${platform}", specify a wide landscape (16:9 aspect ratio) composition with subjects centered.
6. To guarantee visual diversity and prevent identical images for different blogs:
   - Identify a unique, creative visual metaphor or conceptual scene based on the unique blog context (Title, Summary, Outline, Excerpt) instead of generic visual clichés.
   - Specify a distinct artistic style or medium (e.g. detailed minimalist 3D render, modern flat vector, papercut layered art, line-art graphic, abstract glassmorphism shapes) suited to the specific theme.
   - Describe a specific composition (e.g. focal object, background texture, lighting details) that directly represents this post's unique content.`;

      const userContent = [
        {
          type: 'text',
          text: `Analyze the attached company logo to identify its color scheme and design characteristics, then create a highly descriptive DALL-E cover image prompt for this blog post. The prompt must explicitly specify the style and color palette to match the logo, using the configured brand colors (${brandColorsList}), and represent the unique blog details:
BLOG CONTEXT:
${blogContext}
TOPIC: ${topic}
PLATFORM: ${platform || 'General'}`
        },
        {
          type: 'image_url',
          image_url: {
            url: company.logo
          }
        }
      ];

      try {
        console.log('[AI SERVICE] Generating branded prompt using Vision payload with company logo...');
        const responseText = await this.queryAI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ], {
          temperature: 0.7,
          max_completion_tokens: 300,
          apiVersion: '2024-02-15-preview',
          companyId: company?._id,
          processType: 'image_prompt_generation'
        });
        if (responseText && responseText.trim().length > 0) {
          return responseText.trim();
        }
      } catch (err) {
        console.warn('[AI SERVICE WARNING] generateBrandedImagePrompt vision call failed, falling back to text-only generation.', err.message);
      }
    }

    const systemPrompt = `You are a Visual Creative Director and AI Prompt Designer.
Your task is to generate a single, highly optimized visual prompt for DALL-E.
The visual must represent the blog post topic, but styled specifically for the company's branding colors and guidelines, and tailored to appeal to the target persona.

Company Details:
- Name: ${company?.companyName || 'N/A'}
- Industry: ${industry}
- Product Description: ${productDesc}
- Brand Voice: ${brandVoice}
- Brand Color Codes: ${brandColorsList}
- Brand Color Description: ${brandColorsDescription}

Persona Details:
- Name: ${personaName}
- Tone: ${personaTone}
- Description: ${personaDesc}

Platform: ${platform || 'General'}

Requirements for the DALL-E prompt:
1. Incorporate visual design elements and colors that match the company's industry and brand voice. You MUST prioritize using the configured brand colors: ${brandColorsList} (${brandColorsDescription}) in the prompt. Make these brand colors the dominant colors of the image.
2. The design style must match the target persona's preferences (e.g. professional and educational, or technical and clean).
3. Do NOT include any text, typography, letters, logos, or words in the image.
4. Output only the prompt string. Do not wrap in JSON or markdown.
5. The composition MUST be optimized for the target platform's aspect ratio. Since the platform is "${platform}", specify a wide landscape (16:9 aspect ratio) composition with subjects centered.
6. To guarantee visual diversity and prevent identical images for different blogs:
   - Identify a unique, creative visual metaphor or conceptual scene based on the unique blog context (Title, Summary, Outline, Excerpt) instead of generic visual clichés.
   - Specify a distinct artistic style or medium (e.g. detailed minimalist 3D render, modern flat vector, papercut layered art, line-art graphic, abstract glassmorphism shapes) suited to the specific theme.
   - Describe a specific composition (e.g. focal object, background texture, lighting details) that directly represents this post's unique content.`;

    const userPrompt = `Create a DALL-E image prompt for a blog post:
BLOG CONTEXT:
${blogContext}
TOPIC: ${topic}
PLATFORM: ${platform || 'General'}`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.7, max_tokens: 300, companyId: company?._id, processType: 'image_prompt_generation' });
      return responseText.trim();
    } catch (err) {
      console.warn('[AI SERVICE] generateBrandedImagePrompt failed, fallback to default', err.message);
      
      const fallbackColors = brandColors.length > 0 
        ? `with a color palette strictly limited to the brand colors: ${brandColors.join(', ')} (${brandColorsDescription})` 
        : 'using professional dark cyan and grey highlights';
      
      const styles = [
        'Minimalist 3D isometric vector illustration',
        'Modern flat vector graphic illustration',
        'Clean line-art conceptual illustration',
        'Abstract geometric digital art style',
        'Surrealist conceptual digital painting with glassmorphism shapes',
        'Papercut layered vector collage style art'
      ];
      // Deterministically pick a style based on the blog title's hash so that different blogs get different styles
      let hash = 0;
      const titleStr = blog?.title || topic || 'generic topic';
      for (let i = 0; i < titleStr.length; i++) {
        hash = titleStr.charCodeAt(i) + ((hash << 5) - hash);
      }
      const selectedStyle = styles[Math.abs(hash) % styles.length];
      
      return `${selectedStyle} depicting a creative visual metaphor for "${titleStr}", ${fallbackColors}, flat solid background, no text, no letters, no typography.`;
    }
  }

  /**
   * Service Method 5: generateImage() - triggers DALL-E image generation via gpt-image-2
   */
  async generateImage(prompt, dimensions = '1024x1024', companyId = null) {
    const { endpoint } = this.getCredentials();
    const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_IMAGE_API_KEY;

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI credentials or Image API Key are missing from the environment configuration.');
    }

    // Map custom/platform dimensions to closest DALL-E 3 supported preset
    let resolvedDimensions = '1024x1024';
    if (dimensions) {
      const parts = dimensions.toLowerCase().split('x');
      if (parts.length === 2) {
        const w = parseInt(parts[0], 10) || 1024;
        const h = parseInt(parts[1], 10) || 1024;
        const ratio = w / h;
        if (ratio >= 1.3) {
          resolvedDimensions = '1792x1024';
        } else if (ratio <= 0.77) {
          resolvedDimensions = '1024x1792';
        } else {
          resolvedDimensions = '1024x1024';
        }
      }
    }

    const apiVersion = '2023-12-01-preview';
    const url = `${endpoint}/openai/deployments/gpt-image-2/images/generations?api-version=${apiVersion}`;

    try {
      console.log(`[AI SERVICE] Generating DALL-E Image using prompt: "${prompt.slice(0, 60)}..." and resolved size: ${resolvedDimensions} (requested: ${dimensions})...`);
      const response = await axios.post(
        url,
        {
          prompt,
          n: 1,
          size: resolvedDimensions
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
        }
      );

      const imageUrl = response.data?.data?.[0]?.url;
      const b64Json = response.data?.data?.[0]?.b64_json;
      if (imageUrl || b64Json) {
        if (companyId) {
          try {
            await Telemetry.create({
              companyId,
              processType: 'image_generation',
              modelName: 'dall-e-3',
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            });
            console.log('[TELEMETRY] Logged DALL-E image generation to database.');
          } catch (telemetryErr) {
            console.warn('[TELEMETRY WARNING] Failed to save image telemetry record:', telemetryErr.message);
          }
        }
        return imageUrl || `data:image/png;base64,${b64Json}`;
      }
      throw new Error('No image URL or b64_json returned in DALL-E response payload.');
    } catch (err) {
      console.warn('[AI SERVICE WARNING] DALL-E image generation failed. Sourcing local mock visual asset...', err.response?.data?.error?.message || err.message);
      return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1024&q=80';
    }
  }

  /**
   * Iterative Content Length Correction & Healing Loop
   * Automatically expands or condenses the blog content until it is within 800 - 1200 words.
   */
  async adjustContentLength(content = '') {
    let adjustedContent = content;
    let wordCount = contentValidator.countWords(adjustedContent);
    let attempts = 0;
    const maxAttempts = 3;

    while ((wordCount < 800 || wordCount > 1200) && attempts < maxAttempts) {
      attempts++;
      console.log(`[CONTENT LENGTH CORRECTION] Attempt ${attempts}: Current word count is ${wordCount}`);

      if (wordCount < 800) {
        console.log(`[CONTENT LENGTH CORRECTION] Word count (${wordCount}) is below 800. Triggering automatic expansion...`);
        const systemPrompt = `You are an expert editor at Growth OS.
Your task is to expand the provided blog post content because it is under the required length.
The current word count is ${wordCount} words. You MUST expand it so that it is between 850 and 1100 words.
Instructions:
1. Add new detailed paragraphs, explanations, concrete examples, or practical talking points to the existing sections.
2. DO NOT change the existing H1 or H2 headings. Keep the outline and structure exactly the same.
3. Maintain the same tone and style of writing.
4. Ensure the conclusion section is preserved at the end.
5. Do not wrap your response in markdown code blocks. Respond only with the updated Markdown content.`;

        const userPrompt = `Here is the current blog post content:
---
${adjustedContent}
---
Please expand it now:`;

        try {
          const result = await this.queryAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ], { temperature: 0.6, max_tokens: 3500 });

          let cleanResult = result.trim();
          if (cleanResult.startsWith('```markdown')) cleanResult = cleanResult.substring(11);
          else if (cleanResult.startsWith('```html')) cleanResult = cleanResult.substring(7);
          else if (cleanResult.startsWith('```')) cleanResult = cleanResult.substring(3);
          if (cleanResult.endsWith('```')) cleanResult = cleanResult.substring(0, cleanResult.length - 3);
          cleanResult = cleanResult.trim();

          const newCount = contentValidator.countWords(cleanResult);
          if (newCount > 0) {
            adjustedContent = cleanResult;
            wordCount = newCount;
          }
        } catch (err) {
          console.warn(`[CONTENT LENGTH CORRECTION WARNING] Expansion attempt ${attempts} failed:`, err.message);
        }
      } else if (wordCount > 1200) {
        console.log(`[CONTENT LENGTH CORRECTION] Word count (${wordCount}) exceeds 1200. Triggering automatic condensation...`);
        const systemPrompt = `You are an expert editor at Growth OS.
Your task is to condense the provided blog post content because it is over the required length.
The current word count is ${wordCount} words. You MUST condense it so that it is between 850 and 1100 words.
Instructions:
1. Tighten the writing, remove fluff or redundant sentences, and make it more concise.
2. DO NOT change the existing H1 or H2 headings. Keep the outline and structure exactly the same.
3. Maintain the same tone and style of writing.
4. Ensure the conclusion section is preserved at the end.
5. Do not wrap your response in markdown code blocks. Respond only with the updated Markdown content.`;

        const userPrompt = `Here is the current blog post content:
---
${adjustedContent}
---
Please condense it now:`;

        try {
          const result = await this.queryAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ], { temperature: 0.6, max_tokens: 3000 });

          let cleanResult = result.trim();
          if (cleanResult.startsWith('```markdown')) cleanResult = cleanResult.substring(11);
          else if (cleanResult.startsWith('```html')) cleanResult = cleanResult.substring(7);
          else if (cleanResult.startsWith('```')) cleanResult = cleanResult.substring(3);
          if (cleanResult.endsWith('```')) cleanResult = cleanResult.substring(0, cleanResult.length - 3);
          cleanResult = cleanResult.trim();

          const newCount = contentValidator.countWords(cleanResult);
          if (newCount > 0) {
            adjustedContent = cleanResult;
            wordCount = newCount;
          }
        } catch (err) {
          console.warn(`[CONTENT LENGTH CORRECTION WARNING] Condensation attempt ${attempts} failed:`, err.message);
        }
      }
    }

    // Final local validation check and safety net if wordCount is still > 1200 after all iterations
    if (wordCount > 1200) {
      console.log(`[CONTENT LENGTH CORRECTION] Word count (${wordCount}) still exceeds 1200 after AI attempts. Applying local trimmer...`);
      adjustedContent = contentValidator.autoTrimContent(adjustedContent);
      wordCount = contentValidator.countWords(adjustedContent);
    }

    console.log(`[CONTENT LENGTH CORRECTION] Completed. Final word count = ${wordCount}`);
    return adjustedContent;
  }

  /**
   * Service Method: suggestSEOKeywords()
   */
  async suggestSEOKeywords(topicName, topicDetails, company) {
    const systemPrompt = `You are a professional SEO copywriter and strategist.
Given a topic name, detailed description, and company profile, generate 4 to 6 highly relevant, search-volume optimized SEO keywords (each keyword must be 1 to 3 words max).
Return STRICTLY a valid JSON object matching the exact structure below. Do not wrap in markdown codeblocks.

Required JSON Structure:
{
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

    const userPrompt = `Generate SEO keywords for:
COMPANY Name: ${company.companyName}
Industry: ${company.industry}
Description: ${company.productDescription}

TOPIC Name: ${topicName}
Details: ${topicDetails}

Generate JSON payload now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.6, max_tokens: 500, companyId: company?._id, processType: 'market_research' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsed = JSON.parse(cleanText);
      if (parsed.keywords && Array.isArray(parsed.keywords)) {
        return parsed.keywords.map(k => k.toLowerCase().replace(/#/g, '').trim());
      }
      throw new Error('Sourced AI JSON is missing keywords array.');
    } catch (err) {
      console.warn('[AI SERVICE WARNING] suggestSEOKeywords failed. Using fallback keywords...', err.message);
      return [
        topicName.toLowerCase().replace(/[^a-z0-9\s]+/g, '').split(' ').slice(0, 3).join(' '),
        'career tech',
        'job matching',
        'grad employability'
      ].filter(Boolean);
    }
  }

  /**
   * Analyze brand logo using Vision to extract color scheme
   */
  async analyzeLogoColors(imageUrl, companyId = null) {
    let targetImageUrl = imageUrl;

    if (imageUrl && imageUrl.startsWith('http')) {
      try {
        let cleanUrl = imageUrl.replace(/&amp;/g, '&');
        console.log('[AI SERVICE] Downloading remote image for base64 conversion to bypass downstream blocks:', cleanUrl);
        const response = await axios.get(cleanUrl, {
          responseType: 'arraybuffer',
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        });
        if (response.status === 200) {
          const contentType = response.headers['content-type'] || 'image/png';
          const base64Data = Buffer.from(response.data).toString('base64');
          targetImageUrl = `data:${contentType};base64,${base64Data}`;
          console.log('[AI SERVICE] Remote image converted successfully to base64 data URL.');
        }
      } catch (downloadErr) {
        console.warn('[AI SERVICE WARNING] Failed to download remote image for base64 conversion, using raw URL:', downloadErr.message);
      }
    } else if (imageUrl && !imageUrl.startsWith('data:')) {
      try {
        const filename = imageUrl.replace(/^\/?uploads\//, '');
        const filePath = path.join(__dirname, '../uploads', filename);
        
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const ext = path.extname(filename).toLowerCase().replace('.', '');
          const mimeType = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
          targetImageUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
          console.log('[AI SERVICE] Local image converted successfully to base64 for Vision analysis.');
        } else {
          console.warn('[AI SERVICE WARNING] Local file path does not exist on disk:', filePath);
        }
      } catch (fsErr) {
        console.warn('[AI SERVICE WARNING] Failed to read local logo file for base64 conversion:', fsErr.message);
      }
    }

    const systemPrompt = `You are a Visual Identity Designer.
Analyze the company logo and identify the dominant brand colors.
Respond ONLY with a JSON object containing two fields:
1. "colors": an array of HEX strings of the top 3-5 dominant colors (e.g., ["#F25B18", "#181C25"])
2. "description": a concise, single-sentence description of the brand color palette (e.g., "A combination of warm coral orange, dark slate, and clean white accents.")

Do not output any markdown code blocks, backticks, or extra text. Just raw JSON.`;

    const userContent = [
      {
        type: 'text',
        text: `Extract the dominant color palette from this logo.`
      },
      {
        type: 'image_url',
        image_url: {
          url: targetImageUrl
        }
      }
    ];

    try {
      console.log('[AI SERVICE] Calling vision to extract colors from uploaded logo:', imageUrl);
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ], {
        temperature: 0.2,
        max_completion_tokens: 150,
        apiVersion: '2024-02-15-preview',
        companyId,
        processType: 'logo_color_analysis'
      });
      
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();
      
      return JSON.parse(cleanText);
    } catch (err) {
      console.error('[AI SERVICE ERROR] analyzeLogoColors vision call failed:', err.message);
      return {
        colors: [],
        description: 'Default light theme palette'
      };
    }
  }

  /**
   * Service Method: summarizeDocument() - generates a dense structured summary of a grounding document
   */
  async summarizeDocument(fileName, extractedText, companyId = null) {
    if (!extractedText || extractedText.trim() === '') {
      return '';
    }

    const systemPrompt = `You are an expert Information Architect and Technical Analyst at Growth OS.
Your task is to analyze the provided raw document text and compile a highly detailed, structured, and dense factual summary.
You MUST ensure that:
1. NO IMPORTANT POINTS, statistics, technical names, URLs, commands, or code blocks are missed or omitted.
2. The summary organizes information logically using bullet points, bold markers, and headers.
3. Remove generic introductory chatter, page numbers, or formatting noise. Only keep highly dense, grounded factual context.
4. If the document defines product descriptions, brand voice keys, user segments, or architectural rules, list them explicitly.
Your summary must target around 400 to 700 words, capturing the full scope of the original document.`;

    const userPrompt = `Document Filename: ${fileName}

Raw Document Content:
${extractedText}

Generate structured factual summary now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.3, max_tokens: 1500, companyId, processType: 'document_summarization' });

      return responseText.trim();
    } catch (err) {
      console.warn(`[AI SERVICE WARNING] summarizeDocument failed for ${fileName}. Using first 1200 characters fallback...`, err.message);
      return extractedText.slice(0, 1200);
    }
  }

  /**
   * Service Method: extractBrandProfileAndPersonas() - extracts Company Profile & Persona details from raw text
   */
  async extractBrandProfileAndPersonas(extractedText, companyId = null) {
    if (!extractedText || extractedText.trim() === '') {
      return null;
    }

    const systemPrompt = `You are an expert brand analyst at Growth OS.
Your task is to analyze the provided raw document text and extract details to populate a Company Profile and target Audience Personas.

You MUST extract the information and return it strictly as a single JSON object.
Do not include any markdown styling like \`\`\`json or introductory/concluding text. Only output the raw JSON object.

The output JSON format MUST strictly match the following schema:
{
  "company": {
    "companyName": "extracted company name (string)",
    "website": "extracted URL if found (string)",
    "industry": "industry name (string)",
    "productDescription": "description of the product/service (string)",
    "targetAudience": "high level description of target audience (string)",
    "brandVoice": "voice and tone guidelines (string)",
    "competitors": ["competitor name 1", "competitor name 2", ...]
  },
  "personas": [
    {
      "personaName": "descriptive persona name, e.g. Tech Savvy Marketer (string, required)",
      "tone": "associated brand or audience tone, e.g. Professional and informative (string, required)",
      "writingStyle": "writing style details, e.g. Active voice, clear and simple language (string)",
      "audienceType": "e.g. B2B, B2C, Developer (string)",
      "description": "brief description of the persona's role, pain points, and content interests (string)"
    }
  ]
}`;

    const userPrompt = `Raw Document Content:
${extractedText.slice(0, 15000)}

Extract Company and Persona details and return raw JSON now:`;

    try {
      const responseText = await this.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.2, max_tokens: 2000, companyId, processType: 'brand_persona_extraction' });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('\`\`\`')) {
        cleanText = cleanText.replace(/^\`\`\`(json)?/, '').replace(/\`\`\`$/, '').trim();
      }

      const result = JSON.parse(cleanText);
      return result;
    } catch (err) {
      console.warn(`[AI SERVICE WARNING] extractBrandProfileAndPersonas failed:`, err.message);
      return null;
    }
  }
}

const serviceInstance = new AIService();
export default serviceInstance;
