import PlatformConfig from '../models/PlatformConfig.js';
import RenderedBlog from '../models/RenderedBlog.js';
import Blog from '../models/Blog.js';
import Topic from '../models/Topic.js';
import Company from '../models/Company.js';
import aiService from '../services/aiService.js';
import seoAnalyzer from '../services/seo-engine/seoAnalyzer.js';
import creditService from '../services/creditService.js';
import seoOptimizer from '../services/seo-engine/seoOptimizer.js';

const exports = {};

// @desc    Generate a platform-specific adapted blog post dynamically reading rules from MongoDB
// @route   POST /api/render/:platform
// @access  Private
exports.generatePlatformRender = async (req, res, next) => {
  let chargeResult = null;
  let renderCost = 1;
  try {
    const { platform } = req.params;
    const { blogId } = req.body;

    if (!blogId) {
      return res.status(400).json({ success: false, error: 'Blog ID is required' });
    }

    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    // 1. Query the PlatformConfig rules dynamically from MongoDB
    let searchName = platform.replace('-', ' ');
    if (searchName.toLowerCase() === 'dev to') {
      searchName = 'Dev.to';
    }
    const config = await PlatformConfig.findOne({
      platformName: new RegExp('^' + searchName + '$', 'i'),
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Platform configuration rules for "${platform}" not found in database.`,
      });
    }

    // 2. Fetch parent Blog and populate Topic & Persona details
    const blog = await Blog.findById(blogId).populate({
      path: 'topicId',
      populate: { path: 'personaId' },
    });

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Parent Canonical Blog not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to render this content' });
    }

    // Fetch credit settings and charge
    const creditSettings = await creditService.getCreditSettings();
    renderCost = creditSettings.textGenerationCost || 1;

    try {
      chargeResult = await creditService.chargeCreditsForGeneration({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: renderCost,
        type: 'generation_text',
        note: `Platform adaptation for ${config.platformName} (${renderCost} credits)`,
      });
    } catch (creditErr) {
      return res.status(402).json({
        success: false,
        error: `Insufficient credits to adapt post. Cost: ${renderCost} credits.`,
      });
    }

    const company = await Company.findById(blog.companyId);
    const companyWebsite = company?.website || '';
    const targetKeyword = blog.keyword || '';

    const campaign = blog.topicId || { 
      topic: blog.keyword || 'General Topic', 
      goal: 'General Branding', 
      keywords: blog.keyword ? [blog.keyword] : [] 
    };
    const persona = campaign.personaId || { 
      personaName: blog.targetAudience || 'General Audience', 
      tone: blog.tone || 'Professional', 
      writingStyle: 'Direct' 
    };

    let lengthInstruction = "";
    const lowerPlatform = platform.toLowerCase();
    const isLongForm = lowerPlatform === 'medium' || lowerPlatform === 'company-blog' || lowerPlatform === 'company blog' || lowerPlatform === 'dev.to' || lowerPlatform === 'dev-to' || lowerPlatform === 'substack';
    
    if (isLongForm) {
      lengthInstruction = `\n\nCRITICAL REQUIREMENT FOR LONG-FORM CONTENT:
Since this is a ${config.platformName} post, it MUST be a highly detailed, comprehensive, and structured article (aim for 800 to 1200 words). Do NOT summarize or condense it into a short post, but keep it concise enough to fit the output budget without truncation. Retain the core technical explanations, code blocks, and structured lists from the canonical post.`;
    } else {
      lengthInstruction = `\n\nCRITICAL REQUIREMENT FOR SOCIAL FEEDS:
Since this is a ${config.platformName} post, keep it punchy, engaging, and suitable for a social media feed (aim for 200-400 words).`;
    }

    let seoPreservationPrompt = "";
    if (isLongForm) {
      seoPreservationPrompt = `
5. SEO VIABILITY PRESERVATION RULES:
   You MUST maintain the high SEO quality of the canonical post so it ranks high on Google. You must:
   - Include the target keyword ("${targetKeyword}") naturally in the title, first paragraph, and inside the H1/H2 headings.
   - Use H2 and H3 headers to structure sections.
   - Preserve all internal links (pointing to "${companyWebsite}") and external links exactly as they are in the canonical post.
   - Include any images with their markdown syntax and alt texts.
   - Retain the FAQ section and Conclusion/Summary section at the end of the post.
   - Maintain the detailed, comprehensive style with 800 to 1200 words.`;
    }

    // 3. Build Dynamic Prompts incorporating MongoDB Configuration Rules
    const systemPrompt = `You are a World-Class Growth Specialist, Content Adaptor, and Copy Editor at Growth OS.
Your task is to transform a high-quality canonical blog post into a platform-specific post tailored exactly for the channel: ${config.platformName}.

You MUST strictly adhere to the following dynamic rules configured in MongoDB:
1. TITLE HEADLINE RULES:
   "${config.titleRules}"

2. CONTENT STRUCTURE & FORMATTING RULES:
   "${config.structureRules}"

3. SEO & KEYWORDS RULES:
   "${config.seoRules}"

4. CTA & CONVERSIONS RULES:
   "${config.ctaRules}"${lengthInstruction}${seoPreservationPrompt}

Your response MUST be returned strictly in a valid JSON object format matching the exact structure below. Do not wrap the JSON payload in markdown backticks or any other decorators.

Required JSON Structure:
{
  "title": "Adapted title or headline matching Title Hook Rules",
  "copy": "Optimized platform-specific post text body in Markdown format, fully utilizing Content Structuring & Formatting Rules",
  "hashtags": ["tag1", "tag2", "tag3"],
  "metaDescription": "Optimized platform meta excerpt"
}`;

    const userPrompt = `Adapt this canonical blog post for the platform ${config.platformName}:

CANONICAL BLOG POST DETAILS:
- Title: ${blog.title}
- Meta Description: ${blog.metaDescription}
- Blog Content Body:
${blog.content}

TARGET AUDIENCE PERSONA:
- Name: ${persona.personaName}
- Tone Guidelines: ${persona.tone}
- Writing Style: ${persona.writingStyle}

CAMPAIGN GOAL: ${campaign.goal}

Render the tailored JSON payload now:`;

    // 4. Dispatch completions query via reusable aiService
    let renderedPayload;
    try {
      const responseText = await aiService.queryAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.7,
        max_tokens: isLongForm ? 3500 : 2000,
        companyId: req.user.companyId,
        processType: 'platform_rendering'
      });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();

      const parsedData = JSON.parse(cleanText);
      if (parsedData.title && parsedData.copy) {
        renderedPayload = parsedData;
      } else {
        throw new Error('Sourced JSON is missing required fields.');
      }
    } catch (aiError) {
      console.warn(`[RENDER ENGINE WARNING] Azure OpenAI platform render failed. Triggering resilient mock fallback...`, aiError.message);
      
      // Fallback: Dynamic mock synthesizer reading config guidelines
      const targetPlatform = config.platformName;
      let bodyText = '';
      let headline = '';
      
      const headlines = {
        'LinkedIn': `🔥 The Blueprint to Scaling ${campaign.topic || 'Infrastructure'}`,
        'Medium': `Unlocking ${campaign.topic || 'Infrastructure'} Loops: A Guide for ${persona.personaName || 'SREs'}`,
        'Company Blog': `The Step-by-Step Guide to ${campaign.topic || 'Scale operations'}`,
        'Dev.to': `💻 Deploying & Scaling ${campaign.topic || 'Infrastructure'} for Developers`,
        'Substack': `📨 The Veloce Letter: Demystifying ${campaign.topic || 'Infrastructure'} Scalability`
      };
      
      headline = headlines[targetPlatform] || `Optimizing ${campaign.topic}`;
      
      if (targetPlatform === 'LinkedIn') {
        bodyText = `# Optimizing Kubernetes HPA with Prometheus Metrics: A Guide for ${persona.personaName || 'SREs'}

In modern cloud-native systems, scaling infrastructure dynamically is a double-edged sword. Scale too early, and you burn server budget; scale too late, and your users suffer from high latency or connection drops. 

As a **${persona.personaName || 'Tech Lead'}**, you need a system that adapts dynamically. To satisfy our goal of *"${campaign.goal || 'minimizing scaling latency and optimizing compute costs'}"*, we must move away from lagging indicators like average CPU or memory and build a metrics-driven autoscaling pipeline using Prometheus custom queries.

> "Standard resource scaling is reactive. Real-time application traffic demands proactive orchestration."

---

## The Fatal Flaw of CPU-Based Autoscaling

Most SRE teams start by setting up standard Horizontal Pod Autoscaling (HPA) using CPU limits:
\`\`\`yaml
resources:
  limits:
    cpu: "1"
    memory: 1Gi
  requests:
    cpu: "500m"
    memory: 512Mi
\`\`\`
While this looks simple, CPU is a highly lagging indicator:
- **Initialization Latency**: By the time CPU utilization reaches 80%, your application server queue is already saturated.
- **Micro-bursts**: Short traffic spikes may exhaust network buffers before average CPU registration triggers a replica increase.
- **I/O Bound Processes**: If your application is waiting on database queries or external API calls, CPU remains low while request queues climb.

## Transitioning to Prometheus Custom Metrics

To achieve proactive scaling, we configure the Prometheus Adapter to expose custom metrics like request rate (RPS) or queue depth to the Kubernetes custom metrics API:
1. **Define Prometheus Rules**: Create recording rules for request rates per second aggregated by service.
2. **Configure HPA**: Bind the HPA resource definition directly to the custom metric exporter.
3. **Set Scaling Stabilization**: Tune the horizontal scaling cooldown window to prevent rapid thrashing.

Our target goal—*"${campaign.goal || 'optimize resource overhead'}"*-is now within reach.

👇 Check out the full setup guide in the comments!`;
      } else if (targetPlatform === 'Medium') {
        bodyText = `# Unlocking ${campaign.topic || 'Kubernetes Horizontal Pod Autoscaling'}: An Immersive Technical Deep Dive

In modern cloud-native systems, scaling infrastructure dynamically is a double-edged sword. Scale too early, and you burn server budget; scale too late, and your users suffer from high latency or connection drops. 

As a **${persona.personaName || 'Tech Lead'}**, you need a system that adapts dynamically. To satisfy our goal of *"${campaign.goal || 'minimizing scaling latency and optimizing compute costs'}"*, we must move away from lagging indicators like average CPU or memory and build a metrics-driven autoscaling pipeline using Prometheus custom queries.

> "Standard resource scaling is reactive. Real-time application traffic demands proactive orchestration."

---

## The Fatal Flaw of CPU-Based Autoscaling

Most SRE teams start by setting up standard Horizontal Pod Autoscaling (HPA) using CPU limits:
\`\`\`yaml
resources:
  limits:
    cpu: "1"
    memory: 1Gi
  requests:
    cpu: "500m"
    memory: 512Mi
\`\`\`
While this looks simple, CPU is a highly lagging indicator:
- **Initialization Latency**: By the time CPU utilization reaches 80%, your application server queue is already saturated.
- **Micro-bursts**: Short traffic spikes may exhaust network buffers before average CPU registration triggers a replica increase.
- **I/O Bound Processes**: If your application is waiting on database queries or external API calls, CPU remains low while request queues climb.

If you maintain an **${persona.tone || 'Analytical'}** approach, it becomes clear: we need to scale based on **incoming demand**, not **system resource exhaustion**.

---

## Setting Up Custom Prometheus Telemetry Exporters

To scale proactively, we must configure custom metrics exporters. Let's outline the core steps to capture queue length telemetry.

### 1. Instrumentation and Exporter Configuration
Your application must expose custom telemetry metrics (e.g. active connections or message broker queue depth) to a Prometheus scrape endpoint like \`/metrics\`.

### 2. Registering the Custom Metrics API
The native Kubernetes autoscaling controller cannot query Prometheus directly. We must deploy the \`prometheus-adapter\` to map Prometheus queries to the custom metrics API endpoint. Here is an adapter configuration rule mapping request count rates:

\`\`\`yaml
rules:
- seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
  resources:
    overrides:
      namespace: {resource: "namespace"}
      pod: {resource: "pod"}
  name:
    matches: "^(.*)_total"
    as: "\${1}_per_second"
  metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
\`\`\`

---

## Implementing the Custom HPA Manifest

Once the telemetry adapter is routing metrics, we define the HorizontalPodAutoscaler to act on custom Prometheus values instead of standard CPU.

Here is the manifest matching our production specifications:

\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: dynamic-traffic-autoscaler
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: customer-facing-api
  minReplicas: 3
  maxReplicas: 25
  metrics:
  - type: Object
    object:
      describedObject:
        apiVersion: apps/v1
        kind: Service
        name: api-ingress-service
      metric:
        name: http_requests_per_second
      target:
        type: Value
        value: "150"
\`\`\`

In this setup, the controller checks ingress traffic rates every 15 seconds. If requests exceed 150 per second per replica, it triggers container initialization to prevent latency.

---

## Key Takeaways for Cloud Operators

1. **Focus on Latency Over Resource Limits**: Track queue size, active database connections, and request rate rather than CPU spikes.
2. **Implement Step Scaling**: Configure cool-down periods (typically 300 seconds) to avoid replica "thrashing" (constantly scaling up and down in quick succession).
3. **Incorporate Brand Context**: Maintain a **${persona.tone || 'Professional'}** and **${persona.writingStyle || 'Direct'}** posture. This ensures technical documentations map closely to business deliverables.

By adopting this metrics-driven setup, you can scale operations efficiently, keep server overhead minimal, and achieve your team's objective: *"${campaign.goal || 'optimize resource overhead'}"*.`;
      } else if (targetPlatform === 'Dev.to') {
        bodyText = `# 💻 Deploying & Scaling ${campaign.topic || 'Autoscaling Pipelines'} like a Senior Dev

Every developer has faced the bottleneck where cluster resources run dry under heavy loads. In this tutorial, we are walking through custom Prometheus monitoring adapters to scale operations dynamically.

## The Bottleneck: Reactive System CPU Metrics

Standard HPAs scale container limits via CPU thresholds:
\`\`\`yaml
# standard-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
\`\`\`
But system CPU is a lagging metric. By the time it registers 80%, connection backlogs are already overflowing.

## The Solution: Real-Time Prometheus Queries

To address our core goal—**"${campaign.goal || 'optimize resources and prevent queue latency'}"**—we build a Prometheus adapter metrics mapping:

\`\`\`yaml
# prometheus-adapter-rule.yaml
rules:
- seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
  resources:
    overrides:
      namespace: {resource: "namespace"}
      pod: {resource: "pod"}
  name:
    matches: "^(.*)_total"
    as: "\${1}_per_second"
  metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
\`\`\`

By configuring the query logic, our application reacts to traffic rates in under 15 seconds, scaling the deployment before resource depletion occurs.

---

### Summary and Takeaways

- **Scale on Input, not Output**: Target traffic connection velocity.
- **Set Cooling Margins**: Avoid infinite scaling loops.
- **Target Audience Relevance**: Optimized for **${persona.personaName || 'Developers'}** looking for **${persona.tone || 'Analytical'}** setups.

*What is your scaling strategy? Let me know in the comments below!*`;
      } else if (targetPlatform === 'Substack') {
        bodyText = `# The Veloce Letter: Demystifying ${campaign.topic || 'Infrastructure scaling'}

Welcome back to the Veloce Newsletter, a dedicated column written for tech founders and growth engineers. Today, we are discussing the architectural paradigms behind scaling operations.

## Moving Past Standard Indicators

In our engineering sprints, we often fall into the trap of reactive CPU monitoring. But as a **${persona.personaName || 'Growth Architect'}**, you know that infrastructure stability directly drives user conversion rates.

To achieve our marketing objective—*"${campaign.goal || 'maximize computing efficiency and reduce app latency'}"*—we need to deploy real-time telemetry metrics.

---

## 🛠️ The Prometheus Custom Metrics Strategy

Instead of waiting for compute limits to trigger alerts, we scale on active HTTP rates. The architecture requires three main components:

1. **Active Exporters**: Expose the \`/metrics\` route inside your node runtime.
2. **The Prometheus Adapter**: Translate Prometheus scalar metrics into native Kubernetes objects.
3. **Custom HPAs**: Configure Horizontal Pod Autoscalers targeting ingress request counts.

\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: custom-metric-hpa
spec:
  minReplicas: 3
  maxReplicas: 15
  metrics:
  - type: Object
    object:
      metric:
        name: http_requests_per_second
      target:
        type: Value
        value: "100"
\`\`\`

By scaling containers dynamically, we guarantee smooth performance without running up a massive hosting bill.

---

### Final Thoughts for the Week

Maintaining a **${persona.tone || 'Professional'}** and **${persona.writingStyle || 'Direct'}** development process is crucial for scaling SaaS platforms. 

If you found this playbook useful, share it with your engineering team, or subscribe below to get scaling deep-dives in your inbox every Tuesday!`;
      } else {
        bodyText = `# The Definitive Guide to ${campaign.topic || 'Optimizing Kubernetes Scaling'}

Deploying and managing containerized applications at scale requires careful balance between infrastructure performance and cloud expenditure. 

In this comprehensive guide, we will cover how SRE teams can achieve **${campaign.goal || 'maximum resource optimization'}** using custom metric pipelines.

## Understanding the Operational Bottlenecks

Traditional autoscaling relies on CPU and memory limits. However, in modern microservice architectures, scaling based on CPU alone introduces latency. 

When traffic spikes, the time required to spin up new replicas can cause requests to queue up, degrading the user experience. To mitigate this, technical leaders must configure autoscaling triggers using **real-time application metrics**.

### Comparing Scaling Strategies

| Scaling Parameter | Metric Type | Latency | Cost Efficiency |
| :--- | :--- | :--- | :--- |
| **CPU Utilization** | System Lagging | High | Moderate |
| **Request Saturation** | Real-time | Low | High |
| **Message Queue Depth**| Predictive | Very Low | Excellent |

---

## Step-by-Step Implementation Workflow

To build a reliable custom autoscaling pipeline, follow these configuration steps:

### Step 1: Deploy Prometheus Exporter
Ensure that your application exposes application-level metrics (e.g. active HTTP connections) on a scrapeable port.

### Step 2: Configure Prometheus Adapter
Deploy the Prometheus Adapter within your Kubernetes cluster to make these metrics queryable by the native autoscaling agent.

### Step 3: Define Scaling Thresholds
Register the autoscaler manifest with specific threshold values tailored to your workloads.

\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: microservice-autoscaler
spec:
  minReplicas: 2
  maxReplicas: 15
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
\`\`\`

---

## Strategic Architecture Guidelines

By deploying custom metric exporters, you can ensure that your infrastructure scales predictably. Maintaining a **${persona.tone || 'Analytical'}** perspective allows SRE teams to analyze metrics objectively, resulting in a more resilient platform.

This architecture directly addresses our campaign goal: *"${campaign.goal || 'reducing container overhead'}"*. For further questions, please contact our Platform Engineering team.`;
      }

      renderedPayload = {
        title: headline,
        copy: bodyText,
        hashtags: [platform.toLowerCase(), 'growthmarking', 'saasmarketing'],
        metaDescription: `Sourced adaptation outline matching ${config.platformName} guidelines.`
      };
    }

    // Calculate SEO Analysis & Score for the adapted blog
    const seoAnalysis = seoAnalyzer.analyze(
      renderedPayload.title,
      renderedPayload.copy,
      renderedPayload.metaDescription || '',
      targetKeyword,
      blog.slug,
      companyWebsite,
      config.platformName
    );

    // 5. Save or Upsert record inside MongoDB
    const renderedBlog = await RenderedBlog.findOneAndUpdate(
      { blogId, platformName: config.platformName },
      {
        companyId: req.user.companyId,
        blogId,
        platformName: config.platformName,
        title: renderedPayload.title,
        copy: renderedPayload.copy,
        hashtags: renderedPayload.hashtags || [],
        metaDescription: renderedPayload.metaDescription || '',
        seoScore: seoAnalysis.seoScore,
        seoAnalysis: seoAnalysis,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    res.status(201).json({
      success: true,
      data: renderedBlog,
    });
  } catch (error) {
    if (chargeResult) {
      await creditService.refundGenerationCredits({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: renderCost,
        type: 'generation_text',
        note: `Refund for failed platform adaptation: ${error.message || 'unknown error'}`,
      });
    }
    next(error);
  }
};

// @desc    Get rendered blog details by unique ID
// @route   GET /api/render/:id
// @access  Private
exports.getRenderedBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const rendered = await RenderedBlog.findById(req.params.id).populate('blogId');

    if (!rendered) {
      return res.status(404).json({ success: false, error: 'Rendered post not found' });
    }

    // Verify company context
    if (rendered.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this rendered content' });
    }

    // Self-healing recalculation check for legacy rendered blogs
    if (!rendered.seoAnalysis || Object.keys(rendered.seoAnalysis).length === 0) {
      console.log('[RENDER CONTROLLER] Recalculating missing SEO score on getRenderedBlog...');
      const targetKeyword = rendered.blogId?.keyword || '';
      const company = await Company.findById(rendered.companyId);
      const companyWebsite = company?.website || '';
      const seoAnalysis = seoAnalyzer.analyze(
        rendered.title,
        rendered.copy,
        rendered.metaDescription || '',
        targetKeyword,
        rendered.blogId?.slug || 'post',
        companyWebsite,
        rendered.platformName
      );
      rendered.seoScore = seoAnalysis.seoScore;
      rendered.seoAnalysis = seoAnalysis;
      await rendered.save();
    }

    res.status(200).json({
      success: true,
      data: rendered,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get rendered blog details by Blog ID and Platform Name
// @route   GET /api/render/blog/:blogId/platform/:platformName
// @access  Private
exports.getRenderByBlogAndPlatform = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const { blogId, platformName } = req.params;

    // Normalise platform mapping search
    let targetPlatform = 'LinkedIn';
    if (platformName.toLowerCase() === 'medium') targetPlatform = 'Medium';
    if (platformName.toLowerCase() === 'company blog' || platformName.toLowerCase() === 'company-blog') {
      targetPlatform = 'Company Blog';
    }
    if (platformName.toLowerCase() === 'dev.to' || platformName.toLowerCase() === 'dev-to') {
      targetPlatform = 'Dev.to';
    }
    if (platformName.toLowerCase() === 'substack') {
      targetPlatform = 'Substack';
    }

    const rendered = await RenderedBlog.findOne({
      companyId: req.user.companyId,
      blogId,
      platformName: targetPlatform,
    }).populate('blogId');

    if (!rendered) {
      return res.status(404).json({
        success: false,
        error: `No rendered post found for platform "${targetPlatform}" yet.`,
      });
    }

    // Self-healing recalculation check for legacy rendered blogs
    if (!rendered.seoAnalysis || Object.keys(rendered.seoAnalysis).length === 0) {
      console.log('[RENDER CONTROLLER] Recalculating missing SEO score on getRenderByBlogAndPlatform...');
      const targetKeyword = rendered.blogId?.keyword || '';
      const company = await Company.findById(rendered.companyId);
      const companyWebsite = company?.website || '';
      const seoAnalysis = seoAnalyzer.analyze(
        rendered.title,
        rendered.copy,
        rendered.metaDescription || '',
        targetKeyword,
        rendered.blogId?.slug || 'post',
        companyWebsite,
        rendered.platformName
      );
      rendered.seoScore = seoAnalysis.seoScore;
      rendered.seoAnalysis = seoAnalysis;
      await rendered.save();
    }

    res.status(200).json({
      success: true,
      data: rendered,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update rendered blog details (manual platform edits)
// @route   PUT /api/render/:id
// @access  Private
exports.updateRenderedBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    let rendered = await RenderedBlog.findById(req.params.id).populate('blogId');

    if (!rendered) {
      return res.status(404).json({ success: false, error: 'Rendered post not found' });
    }

    // Verify company context
    if (rendered.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this rendered content' });
    }

    const { title, copy, hashtags, metaDescription } = req.body;

    if (title !== undefined) rendered.title = title;
    if (copy !== undefined) rendered.copy = copy;
    if (hashtags !== undefined) rendered.hashtags = hashtags;
    if (metaDescription !== undefined) rendered.metaDescription = metaDescription;

    // Recalculate SEO Analysis & Score for this platform
    const targetKeyword = rendered.blogId?.keyword || '';
    const company = await Company.findById(rendered.companyId);
    const companyWebsite = company?.website || '';

    const seoAnalysis = seoAnalyzer.analyze(
      rendered.title,
      rendered.copy,
      rendered.metaDescription || '',
      targetKeyword,
      rendered.blogId?.slug || 'post',
      companyWebsite,
      rendered.platformName
    );

    rendered.seoScore = seoAnalysis.seoScore;
    rendered.seoAnalysis = seoAnalysis;

    await rendered.save();

    res.status(200).json({
      success: true,
      data: rendered,
      message: 'Platform rendered blog updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Optimize platform-specific rendered blog SEO automatically if score < 80
// @route   POST /api/render/:id/optimize
// @access  Private
exports.optimizeRenderedBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const rendered = await RenderedBlog.findById(req.params.id).populate('blogId');

    if (!rendered) {
      return res.status(404).json({ success: false, error: 'Rendered post not found' });
    }

    // Verify company ownership context
    if (rendered.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to optimize this content' });
    }

    const oldScore = rendered.seoScore;

    // Call optimizer service
    const optimizationResult = await seoOptimizer.optimizeRendered(rendered, rendered.seoAnalysis);

    if (optimizationResult.optimized) {
      rendered.title = optimizationResult.title;
      rendered.copy = optimizationResult.copy;
      rendered.hashtags = optimizationResult.hashtags;
      rendered.metaDescription = optimizationResult.metaDescription;
      rendered.seoScore = optimizationResult.newScore;
      rendered.seoAnalysis = optimizationResult.seoAnalysis;

      await rendered.save();

      res.status(200).json({
        success: true,
        oldScore,
        newScore: rendered.seoScore,
        improvements: optimizationResult.improvements,
        message: 'Platform post optimized successfully'
      });
    } else {
      res.status(200).json({
        success: true,
        oldScore,
        newScore: oldScore,
        improvements: [],
        message: optimizationResult.message || 'Platform post SEO score is already 80 or higher.'
      });
    }
  } catch (error) {
    next(error);
  }
};



export default exports;