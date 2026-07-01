import Blog from '../models/Blog.js';
import Topic from '../models/Topic.js';
import Company from '../models/Company.js';
import Research from '../models/Research.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import aiService from '../services/aiService.js';
import creditService from '../services/creditService.js';
import seoAnalyzer from '../services/seo-engine/seoAnalyzer.js';
import briefGenerator from '../services/seo-engine/briefGenerator.js';
import seoOptimizer from '../services/seo-engine/seoOptimizer.js';
import contentValidator from '../services/content-engine/contentValidator.js';
import mongoose from 'mongoose';
import ImageMetadata from '../models/ImageMetadata.js';

const exports = {};

// @desc    Generate a Canonical Blog from Campaign, Persona, and Research details
// @route   POST /api/blogs/generate
// @access  Private
exports.generateBlog = async (req, res, next) => {
  let chargeResult = null;
  let textCost = 1;
  try {
    const { topicId, blogId, customAngle } = req.body;

    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    // Check if we are overwriting/regenerating an existing blog
    let blog = null;
    if (blogId) {
      blog = await Blog.findById(blogId);
    } else if (topicId) {
      blog = await Blog.findOne({ topicId });
    }

    // Check if we have neither topicId nor blog
    const resolvedTopicId = topicId || (blog ? blog.topicId : null);
    if (!resolvedTopicId && !blog) {
      return res.status(400).json({ 
        success: false, 
        error: 'Topic ID or Blog ID is required.' 
      });
    }

    // Fetch credit settings and charge
    const creditSettings = await creditService.getCreditSettings();
    textCost = creditSettings.textGenerationCost || 1;

    try {
      chargeResult = await creditService.chargeCreditsForGeneration({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: textCost,
        type: 'generation_text',
        note: `Canonical blog generation charge (${textCost} credits)`,
      });
    } catch (creditErr) {
      return res.status(402).json({
        success: false,
        error: `Insufficient credits to generate blog. Cost: ${textCost} credits.`,
      });
    }

    // Resolve grounding knowledge context
    const company = await Company.findById(req.user.companyId);
    const companyWebsite = company?.website || '';

    const knowledgeDocs = await KnowledgeBase.find({ companyId: req.user.companyId });
    let knowledgeContext = '';
    if (knowledgeDocs && knowledgeDocs.length > 0) {
      knowledgeContext = knowledgeDocs
        .slice(0, 3)
        .map((doc) => {
          const content = doc.summaryText || (doc.extractedText ? `${doc.extractedText.slice(0, 1000)}...` : '');
          return `[Grounding Material: ${doc.fileName}]\n${content}`;
        })
        .join('\n\n');
    }

    let blogPayload;
    let resolvedKeyword = '';
    let resolvedAudience = '';
    let resolvedTone = '';
    let topic = null;
    let seoBrief = null;
    let persona = {
      personaName: 'General Professionals',
      tone: 'Informative',
      writingStyle: 'Direct',
      audienceType: 'Content Strategists',
    };

    // 1. Verify Topic and populate Persona if Topic exists
    if (resolvedTopicId) {
      topic = await Topic.findById(resolvedTopicId).populate('personaId');
    }

    if (topic) {
      if (topic.companyId.toString() !== req.user.companyId.toString()) {
        return res.status(403).json({ success: false, error: 'Not authorized to build content for this topic' });
      }
      persona = topic.personaId || persona;
      resolvedKeyword = topic.keywords && topic.keywords.length > 0 ? topic.keywords[0] : topic.topic;
      resolvedAudience = persona.audienceType || '';
      resolvedTone = persona.tone || '';
    } else if (blog) {
      // Fallback: build mock topic and persona from existing blog details
      if (blog.companyId.toString() !== req.user.companyId.toString()) {
        return res.status(403).json({ success: false, error: 'Not authorized to build content for this blog' });
      }

      console.log('[BLOG CONTROLLER] Topic not found in database. Building dynamic fallback topic & persona from existing blog details...');
      topic = {
        _id: resolvedTopicId || new mongoose.Types.ObjectId(),
        companyId: req.user.companyId,
        topicName: blog.keyword || blog.title,
        topic: blog.keyword || blog.title,
        keywords: [blog.keyword].filter(Boolean),
        platforms: ['html'],
        goal: 'Generate search traffic and build authority',
        status: 'completed'
      };

      persona = {
        personaName: blog.targetAudience || 'General Professionals',
        tone: blog.tone || 'Informative',
        writingStyle: 'Direct',
        audienceType: blog.targetAudience || 'Content Strategists'
      };

      resolvedKeyword = blog.keyword || blog.title;
      resolvedAudience = blog.targetAudience || '';
      resolvedTone = blog.tone || '';
    } else {
      // No topic and no blog found
      return res.status(404).json({ success: false, error: 'Topic not found and no existing blog available to reconstruct details.' });
    }

    // Query Research Data (If missing, build dynamic contextual fallback)
    let research = null;
    if (resolvedTopicId) {
      research = await Research.findOne({ topicId: resolvedTopicId });
    }

    if (!research) {
      console.log('[BLOG CONTROLLER] No active research report found in database. Building dynamic fallback context...');
      research = {
        news: `Recent announcements indicate significant transitions in automated ${resolvedKeyword} services.`,
        keywords: [
          { keyword: `best ${resolvedKeyword} systems`, volume: 'High', difficulty: 'Hard', intent: 'Commercial' },
          { keyword: `how to implement ${resolvedKeyword}`, volume: 'Medium', difficulty: 'Easy', intent: 'Informational' }
        ],
        competitorAnalysis: `Legacy players have a massive content void on advanced integration templates.`,
        suggestedAngles: [
          `Title: The Scaling Guide to ${resolvedKeyword}`
        ]
      };
    }

    // Generate/Fetch SEO Brief
    console.log(`[BLOG SERVICE] Triggering SEO Brief generation for campaign keyword: "${resolvedKeyword}"...`);
    try {
      seoBrief = await briefGenerator.generateBrief(resolvedKeyword);
    } catch (briefErr) {
      console.warn('[BLOG SERVICE WARNING] SEO Brief generation failed:', briefErr.message);
      if (blog && blog.seoBrief) {
        console.log('[BLOG SERVICE] Using stored SEO brief from existing blog.');
        seoBrief = blog.seoBrief;
      } else {
        seoBrief = {
          primaryKeyword: resolvedKeyword,
          secondaryKeywords: [`${resolvedKeyword} tips`, `${resolvedKeyword} guide`],
          searchIntent: 'Informational',
          h1Suggestion: `The Definitive Guide to ${resolvedKeyword}`,
          h2Suggestions: [
            `Why ${resolvedKeyword} Matters`,
            `Key Strategies for ${resolvedKeyword}`,
            `Implementing ${resolvedKeyword} Successfully`,
            `Future Trends in ${resolvedKeyword}`
          ],
          semanticKeywords: [`${resolvedKeyword} best practices`, `${resolvedKeyword} tools`],
          recommendedWordCount: 1000
        };
      }
    }

    console.log(`[BLOG SERVICE] Triggering AI Canonical Blog generation for topic: "${topic.topicName}" guided by SEO Brief...`);
    blogPayload = await aiService.generateCanonicalBlog(
      topic,
      persona,
      research,
      knowledgeContext,
      seoBrief,
      customAngle,
      req.user.companyId
    );

    // Auto-generate slug
    let finalTitle = blogPayload.title;
    let finalMeta = blogPayload.metaDescription;
    let finalContent = blogPayload.content;
    let finalSlug = blogPayload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Calculate SEO Analysis & Score
    let finalSeoAnalysis = seoAnalyzer.analyze(
      finalTitle,
      finalContent,
      finalMeta,
      resolvedKeyword,
      finalSlug,
      companyWebsite
    );
    let finalSeoScore = finalSeoAnalysis.seoScore;
    let initialVersion = null;
    let optResult = null;

    // Auto-optimize if SEO score < 80
    if (finalSeoScore < 80) {
      console.log(`[BLOG SERVICE] SEO Score is ${finalSeoScore} (< 80). Triggering automatic optimization pipeline...`);
      const tempBlog = {
        title: finalTitle,
        content: finalContent,
        metaDescription: finalMeta,
        keyword: resolvedKeyword,
        slug: finalSlug
      };
      
      optResult = await seoOptimizer.optimize(tempBlog, finalSeoAnalysis);
      if (optResult.optimized) {
        // Capture initial state as Version 1
        initialVersion = {
          version: 1,
          title: finalTitle,
          metaDescription: finalMeta,
          content: finalContent,
          seoScore: finalSeoScore,
          createdAt: new Date(),
        };

        // Apply optimized parameters
        finalTitle = optResult.title;
        finalMeta = optResult.metaDescription;
        finalContent = optResult.content;
        finalSlug = finalTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');

        // Recalculate SEO Score
        finalSeoAnalysis = optResult.seoAnalysis;
        finalSeoScore = optResult.newScore;
        console.log(`[BLOG SERVICE] Auto-optimization completed. New SEO Score: ${finalSeoScore}`);
      }
    }

    if (blog) {
      // Delete any previous cover images generated for this blog so that the regenerated blog starts with a fresh image slate
      await ImageMetadata.deleteMany({ blogId: blog._id });

      // Increment and append version history
      const nextVersion = (blog.versions && blog.versions.length > 0)
        ? Math.max(...blog.versions.map(v => v.version)) + 1
        : 1;

      blog.title = finalTitle;
      blog.metaDescription = finalMeta;
      blog.outline = blogPayload.outline;
      blog.content = finalContent;
      blog.keyword = resolvedKeyword;
      blog.targetAudience = resolvedAudience;
      blog.tone = resolvedTone;
      blog.slug = finalSlug;
      blog.seoScore = finalSeoScore;
      blog.seoAnalysis = finalSeoAnalysis;
      blog.wordCount = contentValidator.countWords(finalContent);
      if (blogPayload.category) {
        blog.keywordCategory = blogPayload.category;
      }
      if (optResult && optResult.history && optResult.history.length > 0) {
        blog.optimizationHistory = (blog.optimizationHistory || []).concat(optResult.history);
      }
      if (seoBrief) {
        blog.seoBrief = seoBrief;
      }

      blog.versions.push({
        version: nextVersion,
        title: finalTitle,
        metaDescription: finalMeta,
        content: finalContent,
        seoScore: finalSeoScore,
        createdAt: new Date(),
      });

      await blog.save();
    } else {
      // Create new blog and seed version history
      const versions = [];
      if (initialVersion) {
        versions.push(initialVersion);
        versions.push({
          version: 2,
          title: finalTitle,
          metaDescription: finalMeta,
          content: finalContent,
          seoScore: finalSeoScore,
          createdAt: new Date(),
        });
      } else {
        versions.push({
          version: 1,
          title: finalTitle,
          metaDescription: finalMeta,
          content: finalContent,
          seoScore: finalSeoScore,
          createdAt: new Date(),
        });
      }

      blog = await Blog.create({
        companyId: req.user.companyId,
        topicId: resolvedTopicId || undefined,
        title: finalTitle,
        metaDescription: finalMeta,
        outline: blogPayload.outline,
        content: finalContent,
        status: 'draft',
        keyword: resolvedKeyword,
        targetAudience: resolvedAudience,
        tone: resolvedTone,
        slug: finalSlug,
        seoScore: finalSeoScore,
        seoAnalysis: finalSeoAnalysis,
        seoBrief: seoBrief || undefined,
        wordCount: contentValidator.countWords(finalContent),
        optimizationHistory: (optResult && optResult.history) ? optResult.history : [],
        versions: versions,
        keywordCategory: blogPayload.category || 'General'
      });
    }

    res.status(201).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    if (chargeResult) {
      await creditService.refundGenerationCredits({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: textCost,
        type: 'generation_text',
        note: 'Refund for failed blog generation',
      });
    }
    next(error);
  }
};

// @desc    Get all canonical blog posts for the logged-in user's company context
// @route   GET /api/blogs
// @access  Private
exports.getBlogs = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const filter = { companyId: req.user.companyId };
    
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const blogs = await Blog.find(filter)
      .sort({ publishDate: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get canonical blog details by unique ID
// @route   GET /api/blogs/:id
// @access  Private
exports.getBlogById = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id).populate('topicId');

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this blog' });
    }

    // Auto-heal empty versions
    if (!blog.versions || blog.versions.length === 0) {
      blog.versions = [{
        version: 1,
        title: blog.title,
        metaDescription: blog.metaDescription || '',
        content: blog.content || '',
        seoScore: blog.seoScore || 0,
        createdAt: blog.createdAt || new Date(),
      }];
      await blog.save();
      console.log(`[AUTO-HEAL] Seeded version 1 for blog: ${blog._id}`);
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update canonical blog details (manual editor edits)
// @route   PUT /api/blogs/:id
// @access  Private
exports.updateBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this blog' });
    }

    // Perform updates
    const { title, metaDescription, outline, content, status, keyword, targetAudience, tone, publishDate, author, keywordCategory, publishPlatform } = req.body;
    
    // Check if title or content changed to push to version history
    const hasChanged = (title && title !== blog.title) || (content && content !== blog.content);
    
    const oldStatus = blog.status;
    

    if (title) blog.title = title;
    if (metaDescription !== undefined) blog.metaDescription = metaDescription;
    if (outline) blog.outline = outline;
    if (content) blog.content = content;
    if (status) blog.status = status;
    if (keyword !== undefined) blog.keyword = keyword;
    if (targetAudience !== undefined) blog.targetAudience = targetAudience;
    if (tone !== undefined) blog.tone = tone;
    if (publishDate !== undefined) {
      blog.publishDate = publishDate ? new Date(publishDate) : null;
    }
    if (blog.status === 'published' && !blog.publishDate) {
      blog.publishDate = new Date();
    }
    if (author !== undefined) blog.author = author;
    if (keywordCategory !== undefined) blog.keywordCategory = keywordCategory;
    if (publishPlatform !== undefined) {
      if (!blog.publishInfo) {
        blog.publishInfo = {};
      }
      blog.publishInfo.platform = publishPlatform;
    }

    
    // Schedule sync removed (Planner Hub calendar excluded)
    // Recalculate slug if title changed
    if (title) {
      blog.slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }

    // Recalculate SEO Analysis & Score
    const targetKeyword = blog.keyword || '';
    const company = await Company.findById(blog.companyId);
    const companyWebsite = company?.website || '';
    const seoAnalysis = seoAnalyzer.analyze(
      blog.title,
      blog.content,
      blog.metaDescription,
      targetKeyword,
      blog.slug,
      companyWebsite
    );
    blog.seoScore = seoAnalysis.seoScore;
    blog.seoAnalysis = seoAnalysis;
    blog.wordCount = contentValidator.countWords(blog.content);

    // Push new version if title or content changed
    if (hasChanged) {
      const nextVersion = (blog.versions && blog.versions.length > 0)
        ? Math.max(...blog.versions.map(v => v.version)) + 1
        : 1;

      blog.versions.push({
        version: nextVersion,
        title: blog.title,
        metaDescription: blog.metaDescription,
        content: blog.content,
        seoScore: blog.seoScore,
        createdAt: new Date(),
      });
    }

    await blog.save();

    // Populate campaignId for compatibility
    const updatedBlog = await Blog.findById(blog._id).populate('topicId');

    res.status(200).json({
      success: true,
      data: updatedBlog,
      message: 'Blog post updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get blog details by Topic ID
// @route   GET /api/blogs/topic/:topicId
// @access  Private
exports.getBlogByTopic = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    // Verify topic belongs to company
    const topic = await Topic.findById(req.params.topicId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    if (topic.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access content for this topic' });
    }

    const blog = await Blog.findOne({
      companyId: req.user.companyId,
      topicId: req.params.topicId,
    }).populate('topicId');

    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'No canonical blog has been generated for this topic yet.',
      });
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Optimize canonical blog post SEO automatically if score < 80
// @route   POST /api/blogs/:id/optimize
// @access  Private
exports.optimizeBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to optimize this blog' });
    }

    const oldScore = blog.seoScore;

    // Call optimizer service
    const optimizationResult = await seoOptimizer.optimize(blog, blog.seoAnalysis);

    if (optimizationResult.optimized) {
      // Update content attributes
      blog.title = optimizationResult.title;
      blog.metaDescription = optimizationResult.metaDescription;
      blog.content = optimizationResult.content;
      
      // Re-generate slug
      blog.slug = optimizationResult.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      // Recalculate SEO analysis
      blog.seoScore = optimizationResult.newScore;
      blog.seoAnalysis = optimizationResult.seoAnalysis;
      blog.wordCount = contentValidator.countWords(blog.content);

      // Store optimization history
      if (optimizationResult.history && optimizationResult.history.length > 0) {
        blog.optimizationHistory = (blog.optimizationHistory || []).concat(optimizationResult.history);
      }

      // Seed/push next version history entry
      const nextVersion = (blog.versions && blog.versions.length > 0)
        ? Math.max(...blog.versions.map(v => v.version)) + 1
        : 1;

      blog.versions.push({
        version: nextVersion,
        title: blog.title,
        metaDescription: blog.metaDescription,
        content: blog.content,
        seoScore: blog.seoScore,
        createdAt: new Date(),
      });

      await blog.save();

      res.status(200).json({
        success: true,
        oldScore,
        newScore: blog.seoScore,
        improvements: optimizationResult.improvements,
        message: 'Blog post optimized successfully'
      });
    } else {
      // Return early if not optimized
      res.status(200).json({
        success: true,
        oldScore,
        newScore: oldScore,
        improvements: [],
        message: optimizationResult.message || 'Blog SEO score is already 80 or higher.'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get all versions of a canonical blog
// @route   GET /api/blogs/:id/versions
// @access  Private
exports.getBlogVersions = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this blog\'s versions' });
    }

    res.status(200).json({
      success: true,
      data: blog.versions || [],
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore a canonical blog to a specific historical version
// @route   POST /api/blogs/:id/restore/:version
// @access  Private
exports.restoreBlogVersion = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this blog' });
    }

    const targetVersionNumber = parseInt(req.params.version, 10);
    const targetVersion = blog.versions.find(v => v.version === targetVersionNumber);

    if (!targetVersion) {
      return res.status(404).json({ success: false, error: `Version ${req.params.version} not found for this blog` });
    }

    // Restore content properties
    blog.title = targetVersion.title;
    blog.metaDescription = targetVersion.metaDescription || '';
    blog.content = targetVersion.content;

    // Recalculate slug
    blog.slug = blog.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // Recalculate SEO analysis
    const targetKeyword = blog.keyword || '';
    const company = await Company.findById(blog.companyId);
    const companyWebsite = company?.website || '';
    const seoAnalysis = seoAnalyzer.analyze(
      blog.title,
      blog.content,
      blog.metaDescription,
      targetKeyword,
      blog.slug,
      companyWebsite
    );
    blog.seoScore = seoAnalysis.seoScore;
    blog.seoAnalysis = seoAnalysis;
    blog.wordCount = contentValidator.countWords(blog.content);

    // Add restoration as a new version entry
    const nextVersion = (blog.versions && blog.versions.length > 0)
      ? Math.max(...blog.versions.map(v => v.version)) + 1
      : 1;

    blog.versions.push({
      version: nextVersion,
      title: blog.title,
      metaDescription: blog.metaDescription,
      content: blog.content,
      seoScore: blog.seoScore,
      createdAt: new Date(),
    });

    await blog.save();

    const updatedBlog = await Blog.findById(blog._id).populate('topicId');

    res.status(200).json({
      success: true,
      data: updatedBlog,
      message: `Blog restored to version ${targetVersionNumber} successfully`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve a canonical blog post
// @route   POST /api/blogs/:id/approve
// @access  Private
exports.approveBlog = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to approve this blog' });
    }

    if (blog.status !== 'draft') {
      return res.status(400).json({ success: false, error: `Cannot approve blog post from status: ${blog.status}` });
    }

    blog.status = 'approved';
    await blog.save();

    res.status(200).json({
      success: true,
      data: blog,
      message: 'Blog post successfully approved.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Publish a canonical blog post immediately
// @route   POST /api/blogs/:id/publish
// @access  Private
exports.publishBlog = async (req, res, next) => {
  try {
    const { platform, options = {} } = req.body;

    if (!platform) {
      return res.status(400).json({ success: false, error: 'Publishing platform is required' });
    }

    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog post not found' });
    }

    // Verify company ownership context
    if (blog.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to publish this blog' });
    }

    // A blog can be published from approved state (or draft state if they bypass approval)
    if (blog.status !== 'approved' && blog.status !== 'draft') {
      return res.status(400).json({ success: false, error: `Cannot publish blog post from status: ${blog.status}` });
    }

    
    const result = await publishers.publish(blog, platform, options);

    if (result.success) {
      blog.status = 'published';
      blog.publishDate = new Date();
      blog.publishInfo = {
        platform: platform.toLowerCase(),
        publishedAt: new Date(),
        externalId: result.externalId,
        url: result.url || '',
        exportData: result.exportData || '',
      };

      // Add a version entry reflecting publication state
      const nextVersion = (blog.versions && blog.versions.length > 0)
        ? Math.max(...blog.versions.map(v => v.version)) + 1
        : 1;

      blog.versions.push({
        version: nextVersion,
        title: blog.title,
        metaDescription: blog.metaDescription,
        content: blog.content,
        seoScore: blog.seoScore,
        createdAt: new Date(),
      });

      await blog.save();
    }

    res.status(200).json({
      success: true,
      data: blog,
      message: result.message || 'Blog post successfully published.',
    });
  } catch (error) {
    next(error);
  }
};


export default exports;