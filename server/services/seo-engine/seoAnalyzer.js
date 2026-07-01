/**
 * SEO Analyzer Service for Growth OS
 * Evaluates 13 key SEO checks for canonical blog posts, calculates a weighted score out of 100,
 * and maintains backward-compatible scoring metrics.
 */

class SEOAnalyzer {
  /**
   * Analyzes blog content against 13 SEO parameters and legacy metrics
   * @param {String} title - Blog Title
   * @param {String} content - Blog Body Content (Markdown/HTML)
   * @param {String} metaDescription - Meta Description
   * @param {String} keyword - Primary Keyword
   * @param {String} slug - URL Slug
   * @returns {Object} The complete SEO Analysis payload
   */
  analyze(title = '', content = '', metaDescription = '', keyword = '', slug = '', companyWebsite = '', platformName = '') {
    // ----------------------------------------
    // Custom LinkedIn Social SEO Analysis Rules
    // ----------------------------------------
    if (platformName && platformName.toLowerCase() === 'linkedin') {
      const recommendations = [];
      const checks = {
        emojiInTitle: false,
        hashtagCount: 0,
        wordCount: 0,
        ctaEngagement: false,
        readabilityValid: false
      };

      const cleanTitle = (title || '').trim();
      const cleanContent = (content || '').trim();

      // 1. Emoji in Title (20 points)
      let scoreEmoji = 0;
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      if (emojiRegex.test(cleanTitle)) {
        checks.emojiInTitle = true;
        scoreEmoji = 20;
      } else {
        recommendations.push('Start your title hook with an engaging emoji to increase visibility.');
      }

      // 2. Hashtags (20 points)
      let scoreHashtags = 0;
      const hashMatches = cleanContent.match(/#\w+/g);
      const hashCount = hashMatches ? hashMatches.length : 0;
      checks.hashtagCount = hashCount;
      if (hashCount >= 3 && hashCount <= 6) {
        scoreHashtags = 20;
      } else if (hashCount > 0) {
        scoreHashtags = 10;
        recommendations.push('Include between 3 and 5 relevant tactical hashtags at the bottom.');
      } else {
        recommendations.push('Add 3-5 relevant tactical hashtags at the very bottom.');
      }

      // 3. Word Count (20 points)
      let scoreWordCount = 0;
      const words = cleanContent ? cleanContent.split(/\s+/).filter(w => w.length > 0) : [];
      const wordCount = words.length;
      checks.wordCount = wordCount;
      if (wordCount >= 200 && wordCount <= 500) {
        scoreWordCount = 20;
      } else if (wordCount > 0) {
        scoreWordCount = 10;
        recommendations.push(`Aim for a mobile-friendly length of 200-500 words (current: ${wordCount} words).`);
      } else {
        recommendations.push('Add body copy for the post.');
      }

      // 4. CTA Engagement (20 points)
      let scoreCta = 0;
      const ctaRegex = /(?:comment|share|thoughts|experiences|below|what\s+do\s+you|feedback|agree|disagree)/i;
      if (ctaRegex.test(cleanContent)) {
        checks.ctaEngagement = true;
        scoreCta = 20;
      } else {
        recommendations.push('Conclude with an engaging call-to-action asking readers to leave their thoughts in the comments.');
      }

      // 5. Readability (20 points)
      let scoreReadability = 0;
      let readabilityScore = 100;
      if (wordCount > 0) {
        const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const sentenceCount = sentences.length;
        if (sentenceCount > 0) {
          const avgSentenceLength = wordCount / sentenceCount;
          readabilityScore = Math.round(Math.max(20, Math.min(100, 100 - (avgSentenceLength - 12) * 3)));
        }
      }
      if (readabilityScore >= 75) {
        checks.readabilityValid = true;
        scoreReadability = 20;
      } else {
        recommendations.push('Break up long sentences to improve mobile readability.');
      }

      const totalScore = scoreEmoji + scoreHashtags + scoreWordCount + scoreCta + scoreReadability;

      return {
        score: totalScore,
        seoScore: totalScore,
        readabilityScore,
        keywordDensity: 0,
        titleScore: scoreEmoji * 5,
        metaScore: 100,
        headingScore: 100,
        checks,
        recommendations
      };
    }

    // ----------------------------------------
    // Standard Long-Form Blog SEO Analysis Rules
    // ----------------------------------------
    const recommendations = [];
    const checks = {
      keywordInTitle: false,
      keywordInMetaDescription: false,
      keywordInFirstParagraph: false,
      keywordInH1: false,
      keywordInSlug: false,
      wordCount: 0,
      h2Count: 0,
      h3Count: 0,
      faqPresence: false,
      conclusionPresence: false,
      internalLinks: 0,
      externalLinks: 0,
      imageAltText: false
    };

    // Clean inputs
    const cleanTitle = (title || '').trim();
    const cleanContent = (content || '').trim();
    const cleanMeta = (metaDescription || '').trim();
    const cleanKeyword = (keyword || '').trim();
    const cleanSlug = (slug || '').trim();

    const keywordLower = cleanKeyword.toLowerCase();

    // 1. Keyword in Title (10 points)
    let scoreKeywordInTitle = 0;
    if (cleanTitle && keywordLower) {
      if (cleanTitle.toLowerCase().includes(keywordLower)) {
        checks.keywordInTitle = true;
        scoreKeywordInTitle = 10;
      } else {
        recommendations.push('Include the target keyword in the blog title.');
      }
    } else if (!cleanTitle) {
      recommendations.push('Add a blog title.');
    }

    // 2. Keyword in Meta Description (10 points)
    let scoreKeywordInMeta = 0;
    if (cleanMeta && keywordLower) {
      if (cleanMeta.toLowerCase().includes(keywordLower)) {
        checks.keywordInMetaDescription = true;
        scoreKeywordInMeta = 10;
      } else {
        recommendations.push('Include the target keyword in the meta description.');
      }
    } else if (!cleanMeta) {
      recommendations.push('Add an engaging meta description under 160 characters.');
    }

    // 3. Keyword in First Paragraph (10 points)
    let scoreKeywordInFirstPara = 0;
    let firstParagraph = '';
    if (cleanContent) {
      const lines = cleanContent.split('\n');
      let inCodeBlock = false;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          continue;
        }
        if (inCodeBlock) continue;
        
        // Skip headers, blockquotes, lists, images, and HTML/markdown tags
        if (/^(#+|<h[1-6]>)/i.test(line)) continue;
        if (line.startsWith('>')) continue;
        if (/^([*\-+]|\d+\.)\s+/.test(line)) continue;
        if (line.startsWith('![')) continue;
        if (line.startsWith('<img')) continue;
        
        firstParagraph = line;
        break;
      }
    }

    if (firstParagraph && keywordLower) {
      if (firstParagraph.toLowerCase().includes(keywordLower)) {
        checks.keywordInFirstParagraph = true;
        scoreKeywordInFirstPara = 10;
      } else {
        recommendations.push('Include the target keyword in the first paragraph of the content.');
      }
    } else if (cleanContent && keywordLower && !firstParagraph) {
      recommendations.push('Ensure the content contains at least one standard paragraph containing the target keyword.');
    }

    // 4. Keyword in H1 (10 points)
    let scoreKeywordInH1 = 0;
    let hasH1 = false;
    if (cleanContent) {
      // Find H1 headings: # Title or <h1>Title</h1>
      const h1MarkdownRegex = /^#\s+(.+)$/m;
      const h1HtmlRegex = /<h1>(.*?)<\/h1>/i;
      
      const mdMatch = cleanContent.match(h1MarkdownRegex);
      const htmlMatch = cleanContent.match(h1HtmlRegex);
      
      const h1Text = (mdMatch ? mdMatch[1] : (htmlMatch ? htmlMatch[1] : '')).trim();
      
      if (h1Text) {
        hasH1 = true;
        if (keywordLower && h1Text.toLowerCase().includes(keywordLower)) {
          checks.keywordInH1 = true;
          scoreKeywordInH1 = 10;
        } else if (keywordLower) {
          recommendations.push('Include the target keyword in the H1 heading.');
        }
      } else {
        recommendations.push("Add an H1 heading (Markdown '#' format) at the beginning of the content.");
      }
    }

    // 5. Keyword in Slug (10 points)
    let scoreKeywordInSlug = 0;
    if (cleanSlug && keywordLower) {
      const slugifiedKeyword = keywordLower
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
        
      if (cleanSlug.toLowerCase().includes(slugifiedKeyword)) {
        checks.keywordInSlug = true;
        scoreKeywordInSlug = 10;
      } else {
        recommendations.push('Include the target keyword in the URL slug.');
      }
    }

    // 6. Word Count (10 points)
    let scoreWordCount = 0;
    const words = cleanContent ? cleanContent.split(/\s+/).filter(w => w.length > 0) : [];
    const wordCount = words.length;
    checks.wordCount = wordCount;

    if (wordCount >= 800 && wordCount <= 1200) {
      scoreWordCount = 10;
    } else if (wordCount > 0) {
      if (wordCount < 800) {
        recommendations.push(`Extend the article length to meet the target of 800-1200 words (current: ${wordCount} words).`);
        // Partial score for text existence
        scoreWordCount = Math.round((wordCount / 800) * 10);
      } else {
        recommendations.push(`Condense the article length to fit the target of 800-1200 words (current: ${wordCount} words).`);
        scoreWordCount = 5; // Penalty for over-length
      }
    } else {
      recommendations.push('Add body content to the blog post.');
    }

    // 7. H2 Count (10 points)
    let scoreH2Count = 0;
    let h2Count = 0;
    if (cleanContent) {
      const h2MarkdownMatches = cleanContent.match(/^##\s+/mg);
      const h2HtmlMatches = cleanContent.match(/<h2>/mig);
      h2Count = (h2MarkdownMatches ? h2MarkdownMatches.length : 0) + (h2HtmlMatches ? h2HtmlMatches.length : 0);
    }
    checks.h2Count = h2Count;
    if (h2Count >= 2) {
      scoreH2Count = 10;
    } else {
      recommendations.push(`Add at least two H2 headings to structure your content (current: ${h2Count}).`);
      scoreH2Count = h2Count * 5; // 5 points per H2
    }

    // 8. H3 Count (5 points)
    let scoreH3Count = 0;
    let h3Count = 0;
    if (cleanContent) {
      const h3MarkdownMatches = cleanContent.match(/^###\s+/mg);
      const h3HtmlMatches = cleanContent.match(/<h3>/mig);
      h3Count = (h3MarkdownMatches ? h3MarkdownMatches.length : 0) + (h3HtmlMatches ? h3HtmlMatches.length : 0);
    }
    checks.h3Count = h3Count;
    if (h3Count >= 1) {
      scoreH3Count = 5;
    } else {
      recommendations.push(`Add at least one H3 heading to structure sub-sections (current: ${h3Count}).`);
    }

    // 9. FAQ Presence (5 points)
    let scoreFAQ = 0;
    if (cleanContent) {
      const faqRegex = /(?:faq|frequently\s+asked\s+questions|questions\s+&\s+answers|q&a)/i;
      if (faqRegex.test(cleanContent)) {
        checks.faqPresence = true;
        scoreFAQ = 5;
      } else {
        recommendations.push('Add an FAQ section to address common user queries.');
      }
    }

    // 10. Conclusion Presence (5 points)
    let scoreConclusion = 0;
    if (cleanContent) {
      const conclusionRegex = /(?:conclusion|key\s+takeaways|summary|wrapping\s+up|final\s+thoughts)/i;
      if (conclusionRegex.test(cleanContent)) {
        checks.conclusionPresence = true;
        scoreConclusion = 5;
      } else {
        recommendations.push('Add a conclusion section at the end of the content.');
      }
    }

    // Link extractors
    // Markdown: [text](url) -> URL is group 1 (ignoring image tags prefixed with !)
    const mdLinkRegex = /(?<!\!)\[.*?\]\((.*?)\)/g;
    // HTML: <a href="url"> -> URL is group 1
    const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']/gi;
    
    const allLinks = [];
    let match;
    
    if (cleanContent) {
      // Reset regex index
      mdLinkRegex.lastIndex = 0;
      while ((match = mdLinkRegex.exec(cleanContent)) !== null) {
        if (match[1]) allLinks.push(match[1].trim());
      }
      
      htmlLinkRegex.lastIndex = 0;
      while ((match = htmlLinkRegex.exec(cleanContent)) !== null) {
        if (match[1]) allLinks.push(match[1].trim());
      }
    }

    let cleanCompanyDomain = '';
    if (companyWebsite) {
      cleanCompanyDomain = companyWebsite
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .split('/')[0]
        .trim();
    }

    let internalLinksCount = 0;
    let externalLinksCount = 0;

    for (const url of allLinks) {
      if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        continue; // anchor links / email links don't count
      }
      // Check if relative link or points to our site or company website
      const isInternal = url.startsWith('/') && !url.startsWith('//') ||
                         url.toLowerCase().includes('growthos.com') ||
                         url.toLowerCase().includes('growth-os-system') ||
                         url.toLowerCase().includes('localhost') ||
                         (cleanCompanyDomain && url.toLowerCase().includes(cleanCompanyDomain));
                          
      if (isInternal) {
        internalLinksCount++;
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        externalLinksCount++;
      }
    }

    checks.internalLinks = internalLinksCount;
    checks.externalLinks = externalLinksCount;

    // 11. Internal Links (5 points)
    let scoreInternalLinks = 0;
    if (internalLinksCount >= 1) {
      scoreInternalLinks = 5;
    } else {
      recommendations.push('Include at least one internal link to relevant resources on your website.');
    }

    // 12. External Links (5 points)
    let scoreExternalLinks = 0;
    if (externalLinksCount >= 1) {
      scoreExternalLinks = 5;
    } else {
      recommendations.push('Include at least one external link to authoritative sources.');
    }

    // 13. Image Alt Text (5 points)
    let scoreImageAlt = 0;
    let hasImages = false;
    let allImagesHaveAlt = true;

    if (cleanContent) {
      // Find all markdown images: ![alt](url)
      const mdImgRegex = /!\[(.*?)\]\((.*?)\)/g;
      // Find all HTML images: <img src="..." alt="..." /> or without alt
      const htmlImgRegex = /<img\s+([^>]*?)>/gi;

      let mdImgMatch;
      mdImgRegex.lastIndex = 0;
      while ((mdImgMatch = mdImgRegex.exec(cleanContent)) !== null) {
        hasImages = true;
        const altText = (mdImgMatch[1] || '').trim();
        if (!altText) {
          allImagesHaveAlt = false;
        }
      }

      let htmlImgMatch;
      htmlImgRegex.lastIndex = 0;
      while ((htmlImgMatch = htmlImgRegex.exec(cleanContent)) !== null) {
        hasImages = true;
        const imgTagContent = htmlImgMatch[1];
        // Check for alt attribute
        const altMatch = imgTagContent.match(/alt=["'](.*?)["']/i);
        if (!altMatch || !(altMatch[1] || '').trim()) {
          allImagesHaveAlt = false;
        }
      }
    }

    if (hasImages) {
      if (allImagesHaveAlt) {
        checks.imageAltText = true;
        scoreImageAlt = 5;
      } else {
        recommendations.push('Ensure all images in the content have descriptive alt text.');
      }
    } else {
      recommendations.push('Add at least one image with descriptive alt text to enhance visual SEO.');
    }

    // Calculate final weighted score out of 100
    const seoScore = 
      scoreKeywordInTitle +
      scoreKeywordInMeta +
      scoreKeywordInFirstPara +
      scoreKeywordInH1 +
      scoreKeywordInSlug +
      scoreWordCount +
      scoreH2Count +
      scoreH3Count +
      scoreFAQ +
      scoreConclusion +
      scoreInternalLinks +
      scoreExternalLinks +
      scoreImageAlt;

    // ==========================================
    // BACKWARD COMPATIBLE METRICS GENERATION
    // ==========================================
    
    // Readability Check
    let readabilityScore = 100;
    if (wordCount > 0) {
      const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const sentenceCount = sentences.length;
      if (sentenceCount > 0) {
        const avgSentenceLength = wordCount / sentenceCount;
        readabilityScore = Math.round(Math.max(20, Math.min(100, 100 - (avgSentenceLength - 15) * 2)));
      }
    }

    // Keyword Density
    let keywordDensity = 0;
    if (wordCount > 0 && keywordLower) {
      const escapedKeyword = keywordLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const keywordRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
      const matches = cleanContent.match(keywordRegex);
      const occurrences = matches ? matches.length : 0;
      keywordDensity = parseFloat(((occurrences / wordCount) * 100).toFixed(2));
    }

    // Legacy Title Score
    let titleScore = 0;
    if (cleanTitle) {
      titleScore += 40;
      if (keywordLower && cleanTitle.toLowerCase().includes(keywordLower)) {
        titleScore += 40;
      }
      const titleLen = cleanTitle.length;
      if (titleLen >= 40 && titleLen <= 70) {
        titleScore += 20;
      }
    }

    // Legacy Meta Score
    let metaScore = 0;
    if (cleanMeta) {
      metaScore += 40;
      if (keywordLower && cleanMeta.toLowerCase().includes(keywordLower)) {
        metaScore += 40;
      }
      const metaLen = cleanMeta.length;
      if (metaLen >= 120 && metaLen <= 160) {
        metaScore += 20;
      }
    }

    // Legacy Heading Score
    let headingScore = 0;
    if (cleanContent) {
      if (hasH1) headingScore += 40;
      if (h2Count >= 2) headingScore += 40;
      
      let keywordInHeadings = false;
      const lines = cleanContent.split('\n');
      for (const line of lines) {
        if (/^(#+|<h1>|<h2>|<h3>)/i.test(line) && keywordLower && line.toLowerCase().includes(keywordLower)) {
          keywordInHeadings = true;
          break;
        }
      }
      if (keywordInHeadings) headingScore += 20;
    }

    return {
      score: seoScore, // Store legacy field
      seoScore,       // Store explicit field requested
      readabilityScore,
      keywordDensity,
      titleScore,
      metaScore,
      headingScore,
      checks,
      recommendations
    };
  }
}

const serviceInstance = new SEOAnalyzer();
export default serviceInstance;
