import KnowledgeBase from '../models/KnowledgeBase.js';
import Company from '../models/Company.js';
import Persona from '../models/Persona.js';
import User from '../models/User.js';
import storageService from '../services/storageService.js';
import textExtractor from '../services/textExtractor.js';
import aiService from '../services/aiService.js';
import creditService from '../services/creditService.js';
import logger from '../utils/logger.js';
import axios from 'axios';

const exports = {};

// @desc    Get all company knowledge documents
// @route   GET /api/knowledge
// @access  Private
exports.getDocuments = async (req, res, next) => {
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ success: false, error: 'No company profile associated with this user context' });
    }

    const documents = await KnowledgeBase.find({ companyId: req.user.companyId });
    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload new document and extract text
// @route   POST /api/knowledge/upload
// @access  Private
exports.uploadDocument = async (req, res, next) => {
  try {
    let shellCompany = null;
    if (req.user.companyId) {
      shellCompany = await Company.findById(req.user.companyId);
    }
    if (!shellCompany) {
      shellCompany = await Company.create({
        companyName: 'Pending Setup',
        createdBy: req.user.id
      });
      await User.findByIdAndUpdate(req.user.id, { companyId: shellCompany._id });
      req.user.companyId = shellCompany._id;
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please provide a file to upload' });
    }

    const { originalname, buffer, mimetype } = req.file;

    logger.info(`Starting upload process for file: ${originalname} (${mimetype})`);

    // 1. Upload file buffer to Cloudinary (or local filesystem fallback)
    const uploadResult = await storageService.uploadBuffer(buffer, originalname);
    logger.info(`Upload completed. Sourced URL: ${uploadResult.url}`);

    // 2. Extract raw text from buffer based on file type
    logger.info(`Starting text extraction for file: ${originalname}`);
    const extractedText = await textExtractor.extractText(buffer, mimetype, originalname);
    logger.info(`Text extraction completed. Extracted length: ${extractedText.length} characters.`);

    // 3. Summarize raw text using AI service to create grounding context
    logger.info(`Starting text summarization for file: ${originalname}`);
    const summaryText = await aiService.summarizeDocument(originalname, extractedText, req.user.companyId);
    logger.info(`Text summarization completed. Summary length: ${summaryText.length} characters.`);

    // 4. Register KnowledgeBase record in MongoDB
    const document = await KnowledgeBase.create({
      companyId: req.user.companyId,
      fileName: originalname,
      fileType: originalname.split('.').pop().toLowerCase(),
      fileUrl: uploadResult.url,
      publicId: uploadResult.public_id,
      extractedText,
      summaryText,
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a knowledge document
// @route   DELETE /api/knowledge/:id
// @access  Private
exports.deleteDocument = async (req, res, next) => {
  try {
    const document = await KnowledgeBase.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Verify company ownership context
    if (document.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this document' });
    }

    // 1. Delete asset from Cloudinary or local uploads folder
    await storageService.deleteAsset(document.publicId);

    // 2. Delete database model record
    await KnowledgeBase.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
      message: 'Knowledge document removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Extract brand details & personas from a knowledge document
// @route   POST /api/knowledge/:id/extract
// @access  Private
exports.extractBrandContext = async (req, res, next) => {
  try {
    const document = await KnowledgeBase.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    if (document.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this document' });
    }

    if (!document.extractedText || document.extractedText.trim() === '') {
      return res.status(400).json({ success: false, error: 'Document does not contain any extracted text to analyze.' });
    }

    logger.info(`Starting AI brand context and persona extraction for doc: ${document.fileName}`);
    const brandData = await aiService.extractBrandProfileAndPersonas(document.extractedText, req.user.companyId);

    if (!brandData) {
      return res.status(550).json({ success: false, error: 'Failed to extract brand context using AI' });
    }

    // 1. Update or create Company details
    let company = await Company.findById(req.user.companyId);
    if (!company) {
      company = await Company.create({
        companyName: brandData.company?.companyName || 'Extracted Brand',
        website: brandData.company?.website || '',
        industry: brandData.company?.industry || '',
        productDescription: brandData.company?.productDescription || '',
        targetAudience: brandData.company?.targetAudience || '',
        brandVoice: brandData.company?.brandVoice || '',
        competitors: brandData.company?.competitors || [],
        createdBy: req.user.id
      });
      await User.findByIdAndUpdate(req.user.id, { companyId: company._id });
      req.user.companyId = company._id;
    } else {
      company.companyName = brandData.company?.companyName || company.companyName;
      company.website = brandData.company?.website || company.website;
      company.industry = brandData.company?.industry || company.industry;
      company.productDescription = brandData.company?.productDescription || company.productDescription;
      company.targetAudience = brandData.company?.targetAudience || company.targetAudience;
      company.brandVoice = brandData.company?.brandVoice || company.brandVoice;
      company.competitors = brandData.company?.competitors || company.competitors;
      await company.save();
    }

    // 2. Create target personas from extracted list
    const createdPersonas = [];
    if (Array.isArray(brandData.personas)) {
      // Clear old personas if they exist (to overwrite with fresh ones)
      await Persona.deleteMany({ companyId: company._id });
      
      for (const p of brandData.personas) {
        if (p.personaName && p.tone) {
          const newPersona = await Persona.create({
            companyId: company._id,
            personaName: p.personaName,
            tone: p.tone,
            writingStyle: p.writingStyle || '',
            audienceType: p.audienceType || '',
            description: p.description || ''
          });
          createdPersonas.push(newPersona);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Successfully extracted and updated brand context and audience personas.',
      data: {
        company,
        personas: createdPersonas
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update knowledge document summary
// @route   PUT /api/knowledge/:id/summary
// @access  Private
exports.updateDocumentSummary = async (req, res, next) => {
  try {
    const document = await KnowledgeBase.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    if (document.companyId.toString() !== req.user.companyId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this document' });
    }

    const { summaryText } = req.body;
    if (summaryText === undefined) {
      return res.status(400).json({ success: false, error: 'Please provide summaryText value' });
    }

    document.summaryText = summaryText;
    await document.save();

    res.status(200).json({
      success: true,
      data: document,
      message: 'Document summary updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Helper to extract logo/icon URL from website HTML
const extractLogoUrlFromHtml = (html, baseUrl) => {
  try {
    const iconRegexes = [
      // 1. Prioritize modern raster formats (png, jpg, jpeg, webp) in link rel icon
      /<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+\.(?:png|jpg|jpeg|webp)(?:\?[^"']*)?)["']/i,
      /<link[^>]*href=["']([^"']+\.(?:png|jpg|jpeg|webp)(?:\?[^"']*)?)["'][^>]*rel=["'](?:shortcut\s+)?icon["']/i,
      // 2. Apple touch icons (usually high-res PNGs)
      /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
      // 3. OpenGraph images (usually large PNG/JPG screenshots or logos)
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      // 4. Img tags with logo ID or class
      /<img[^>]*id=["']logo["'][^>]*src=["']([^"']+)["']/i,
      /<img[^>]*class=["'](?:[^"']*logo[^"']*)["'][^>]*src=["']([^"']+)["']/i,
      // 5. Img tags matching logo/icon keywords in src (excluding .ico)
      /<img[^>]*src=["']([^"']*(?:logo|icon)[^"']+\.(?:png|jpg|jpeg|webp))["']/i,
      // 6. Generic link rel icon fallback (which matches .ico or other extensions)
      /<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i,
      /<link[^>]*href=["']([^"']+)["']/i
    ];

    for (const regex of iconRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        let logoPath = match[1].trim();
        // Decode HTML entities
        logoPath = logoPath.replace(/&amp;/g, '&')
                           .replace(/&lt;/g, '<')
                           .replace(/&gt;/g, '>')
                           .replace(/&quot;/g, '"')
                           .replace(/&apos;/g, "'");

        if (logoPath.startsWith('//')) {
          return `https:${logoPath}`;
        } else if (logoPath.startsWith('/')) {
          const origin = new URL(baseUrl).origin;
          return `${origin}${logoPath}`;
        } else if (!/^https?:\/\//i.test(logoPath)) {
          const urlObj = new URL(baseUrl);
          const pathParts = urlObj.pathname.split('/');
          pathParts.pop();
          const baseDir = pathParts.join('/');
          return `${urlObj.origin}${baseDir}/${logoPath}`;
        }
        return logoPath;
      }
    }
    const origin = new URL(baseUrl).origin;
    return `${origin}/favicon.ico`;
  } catch (err) {
    logger.warn(`[CRAWLER] Failed to parse logo URL from HTML: ${err.message}`);
    return null;
  }
};

// Helper to strip HTML tags and extract clean readable text
const cleanHtmlToText = (html) => {
  if (!html) return '';

  let metaText = '';
  try {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      metaText += `Page Title: ${titleMatch[1].trim()}\n`;
    }

    // Extract meta description
    const descRegexes = [
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i
    ];
    for (const regex of descRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        metaText += `Description: ${match[1].trim()}\n`;
        break;
      }
    }

    // Extract meta keywords
    const keywordsRegexes = [
      /<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']keywords["']/i
    ];
    for (const regex of keywordsRegexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        metaText += `Keywords: ${match[1].trim()}\n`;
        break;
      }
    }
  } catch (err) {
    // Ignore meta extraction errors
  }

  // Strip head, style, script tag contents
  let text = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  text = text.replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, '');
  // Replace standard block elements with newlines to preserve separation
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<li>/gi, '\n* ');
  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities (basic ones)
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n+/g, '\n\n');
  
  let result = text.trim();
  if (metaText) {
    result = `${metaText}\n${result}`;
  }
  return result.trim();
};

// @desc    Crawl website URL, create KnowledgeBase entry, and extract brand profile + personas
// @route   POST /api/knowledge/crawl
// @access  Private
exports.crawlWebsiteAndExtractBrand = async (req, res, next) => {
  let chargeResult = null;
  let crawlCost = 5;
  try {
    let shellCompany = null;
    if (req.user.companyId) {
      shellCompany = await Company.findById(req.user.companyId);
    }
    if (!shellCompany) {
      shellCompany = await Company.create({
        companyName: 'Pending Setup',
        createdBy: req.user.id
      });
      await User.findByIdAndUpdate(req.user.id, { companyId: shellCompany._id });
      req.user.companyId = shellCompany._id;
    }

    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'Please provide a website URL to crawl.' });
    }

    // Format URL if protocol is missing
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    // Fetch credit settings
    const creditSettings = await creditService.getCreditSettings();
    crawlCost = creditSettings.websiteAnalysisCost || 5;

    // Charge credits
    try {
      chargeResult = await creditService.chargeCreditsForGeneration({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: crawlCost,
        type: 'crawling_analysis',
        note: `Website crawl & analysis charge (${crawlCost} credits)`,
      });
    } catch (creditErr) {
      return res.status(402).json({
        success: false,
        error: `Insufficient credits to analyze website. Cost: ${crawlCost} credits.`,
      });
    }

    logger.info(`Starting website crawling for URL: ${targetUrl}`);

    // 1. Crawl URL contents
    let htmlContent = '';
    try {
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 10000 // 10s timeout
      });
      htmlContent = response.data;
    } catch (crawlErr) {
      logger.error(`Website crawl failed for URL ${targetUrl}: ${crawlErr.message}`);
      if (chargeResult) {
        await creditService.refundGenerationCredits({
          companyId: req.user.companyId,
          userId: req.user._id,
          amount: crawlCost,
          type: 'crawling_analysis',
          note: 'Refund for failed website analysis (network error)',
        });
      }
      return res.status(400).json({
        success: false,
        error: `Failed to crawl website URL. Details: ${crawlErr.message}`
      });
    }

    // 2. Extract clean text
    const extractedText = cleanHtmlToText(htmlContent);
    if (!extractedText || extractedText.length < 100) {
      if (chargeResult) {
        await creditService.refundGenerationCredits({
          companyId: req.user.companyId,
          userId: req.user._id,
          amount: crawlCost,
          type: 'crawling_analysis',
          note: 'Refund for failed website analysis (insufficient text content)',
        });
      }
      return res.status(400).json({
        success: false,
        error: 'The crawled website did not return sufficient readable text content to analyze.'
      });
    }

    logger.info(`Text successfully extracted from URL: ${targetUrl}. Cleaned length: ${extractedText.length} chars.`);

    // 3. Summarize extracted content to create AI summary
    const cleanDomain = targetUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    const documentName = `${cleanDomain} Website Context`;

    logger.info(`Summarizing website content for ${documentName}`);
    const summaryText = await aiService.summarizeDocument(documentName, extractedText, req.user.companyId);

    // 4. Create KnowledgeBase document entry
    const document = await KnowledgeBase.create({
      companyId: req.user.companyId,
      fileName: documentName,
      fileType: 'url',
      fileUrl: targetUrl,
      publicId: `url_${Date.now()}`,
      extractedText,
      summaryText
    });

    // 5. Extract Logo URL and analyze brand colors from HTML
    let logoUrl = null;
    let brandColors = [];
    let brandColorsDescription = '';
    
    try {
      logoUrl = extractLogoUrlFromHtml(htmlContent, targetUrl);
      if (logoUrl) {
        logger.info(`Found logo URL from HTML: ${logoUrl}. Downloading image bytes...`);
        try {
          const logoResponse = await axios.get(logoUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
          });
          
          if (logoResponse.status === 200) {
            // Extract filename or default to logo.png
            let filename = 'logo.png';
            try {
              const urlPath = new URL(logoUrl).pathname;
              filename = urlPath.split('/').pop() || 'logo.png';
            } catch (pErr) {
              // Ignore parsing error
            }
            
            logger.info(`Uploading crawled logo to S3/Storage...`);
            const uploadResult = await storageService.uploadBuffer(logoResponse.data, filename);
            logoUrl = uploadResult.url;
            if (logoUrl && logoUrl.includes('res.cloudinary.com') && logoUrl.toLowerCase().endsWith('.ico')) {
              logoUrl = logoUrl.replace(/\.ico$/i, '.png');
            }
            logger.info(`Logo uploaded successfully to S3/Storage: ${logoUrl}`);
            
            // Vision analysis on the uploaded Cloudinary logo
            logger.info(`Extracting brand colors from Cloudinary logo URL...`);
            const colorAnalysis = await aiService.analyzeLogoColors(logoUrl, req.user.companyId);
            if (colorAnalysis && colorAnalysis.colors && colorAnalysis.colors.length > 0) {
              brandColors = colorAnalysis.colors;
              brandColorsDescription = colorAnalysis.description || '';
              logger.info(`Vision identified brand colors: ${JSON.stringify(brandColors)}`);
            }
          }
        } catch (downloadErr) {
          logger.warn(`Failed to download or upload crawled logo: ${downloadErr.message}`);
        }
      }
    } catch (logoErr) {
      logger.warn(`Failed to resolve logo or brand colors from crawled HTML: ${logoErr.message}`);
    }

    // 6. Extract Brand details & Personas from website text
    logger.info(`Extracting Brand details & Personas from website text...`);
    const brandData = await aiService.extractBrandProfileAndPersonas(extractedText, req.user.companyId);

    let company = null;
    const createdPersonas = [];

    if (brandData) {
      // Create or update Company profile
      company = await Company.findById(req.user.companyId);
      if (!company) {
        company = await Company.create({
          companyName: brandData.company?.companyName || cleanDomain,
          website: targetUrl,
          industry: brandData.company?.industry || '',
          productDescription: brandData.company?.productDescription || '',
          targetAudience: brandData.company?.targetAudience || '',
          brandVoice: brandData.company?.brandVoice || '',
          competitors: brandData.company?.competitors || [],
          logo: logoUrl || '',
          brandColors: brandColors || [],
          brandColorsDescription: brandColorsDescription || '',
          createdBy: req.user.id
        });
        await User.findByIdAndUpdate(req.user.id, { companyId: company._id });
        req.user.companyId = company._id;
      } else {
        company.companyName = brandData.company?.companyName || company.companyName;
        company.website = targetUrl || company.website;
        company.industry = brandData.company?.industry || company.industry;
        company.productDescription = brandData.company?.productDescription || company.productDescription;
        company.targetAudience = brandData.company?.targetAudience || company.targetAudience;
        company.brandVoice = brandData.company?.brandVoice || company.brandVoice;
        company.competitors = brandData.company?.competitors || company.competitors;
        if (logoUrl) company.logo = logoUrl;
        if (brandColors && brandColors.length > 0) {
          company.brandColors = brandColors;
          company.brandColorsDescription = brandColorsDescription;
        }
        await company.save();
      }

      // Create target audience personas
      if (Array.isArray(brandData.personas)) {
        // Clear old personas if they exist (to prevent crossovers and keep fresh data)
        await Persona.deleteMany({ companyId: company._id });

        for (const p of brandData.personas) {
          if (p.personaName && p.tone) {
            const newPersona = await Persona.create({
              companyId: company._id,
              personaName: p.personaName,
              tone: p.tone,
              writingStyle: p.writingStyle || '',
              audienceType: p.audienceType || '',
              description: p.description || ''
            });
            createdPersonas.push(newPersona);
          }
        }
      }
    } else {
      logger.warn(`AI brand extraction did not return valid context for URL: ${targetUrl}`);
    }

    res.status(200).json({
      success: true,
      message: 'Successfully crawled website, created Knowledge Base entry, and updated brand details & personas.',
      data: {
        document,
        company,
        personas: createdPersonas
      }
    });
  } catch (error) {
    if (chargeResult) {
      await creditService.refundGenerationCredits({
        companyId: req.user.companyId,
        userId: req.user._id,
        amount: crawlCost,
        type: 'crawling_analysis',
        note: 'Refund for failed website analysis (general failure)',
      });
    }
    next(error);
  }
};



export default exports;