import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useTasks } from '../../context/TaskContext';
import {
  Sparkles,
  Zap,
  Loader2,
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Share2,
  Download,
  Image as ImageIcon,
  ArrowLeft,
  Repeat2,
  Save,
  X
} from 'lucide-react';
import { LinkedInPreview } from '../previews/LinkedInPreview';
import { MediumPreview } from '../previews/MediumPreview';
import { CompanyBlogPreview } from '../previews/CompanyBlogPreview';
import { DevToPreview } from '../previews/DevToPreview';
import { SubstackPreview } from '../previews/SubstackPreview';
import { renderMarkdownToHTML } from '../../utils/markdown';

const resolvedPlatformNames = {
  linkedin: 'LinkedIn',
  medium: 'Medium',
  blog: 'Company Blog',
  devto: 'Dev.to',
  substack: 'Substack',
};

const cleanCopyWithoutTrailingHashtags = (text) => {
  if (!text) return '';
  let lines = text.split(/\r?\n/);
  
  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine === '') {
      lines.pop();
      continue;
    }
    
    const cleanLine = lastLine.replace(/[*_]/g, '').trim();
    const tokens = cleanLine.split(/\s+/);
    const isAllHashtags = tokens.every(token => {
      const cleanToken = token.replace(/[,;]/g, '').trim();
      return cleanToken === '' || cleanToken.startsWith('#');
    });
    const hasAnyHashtag = tokens.some(token => token.replace(/[,;]/g, '').trim().startsWith('#'));
    
    if (isAllHashtags && hasAnyHashtag) {
      lines.pop();
      continue;
    }
    
    const isTagLabelPattern = /^(?:[\-\d\.\s\*\+]+)?(?:tags|hashtags|hash\s*tags|hash\-tags)\b/i.test(cleanLine);
    if (isTagLabelPattern) {
      lines.pop();
      continue;
    }
    
    break;
  }
  
  return lines.join('\n').trim();
};

const stripLeadingTitle = (markdown, title) => {
  if (!markdown) return '';
  let cleaned = markdown.trim();
  
  if (title) {
    const escapedTitle = title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const titleRegex = new RegExp(`^#+\\s+${escapedTitle}\\s*(\\r?\\n)+`, 'i');
    if (titleRegex.test(cleaned)) {
      return cleaned.replace(titleRegex, '').trim();
    }
    
    const genericLeadingTitleRegex = new RegExp(`^#+\\s+${escapedTitle}\\s*$`, 'i');
    const lines = cleaned.split(/\r?\n/);
    if (lines.length > 0 && genericLeadingTitleRegex.test(lines[0])) {
      return lines.slice(1).join('\n').trim();
    }
  }
  
  const genericH1Regex = /^#\s+(.*?)(?:\r?\n|$)/i;
  const match = cleaned.match(genericH1Regex);
  if (match) {
    const headingText = match[1].trim();
    if (headingText === title || (title && title.toLowerCase().includes(headingText.toLowerCase())) || (title && headingText.toLowerCase().includes(title.toLowerCase()))) {
      return cleaned.replace(genericH1Regex, '').trim();
    }
  }
  
  return cleaned;
};

const cleanPlatformCopy = (copy, title) => {
  if (!copy) return '';
  let cleaned = copy.trim();
  
  // 1. Strip leading H1 title
  cleaned = stripLeadingTitle(cleaned, title);
  
  // 2. Strip leading subtitle and meta description lines
  let lines = cleaned.split(/\r?\n/);
  let changed = false;
  
  for (let i = 0; i < 6; i++) {
    if (lines.length === 0) break;
    const firstLine = lines[0].trim();
    
    // Check if empty line
    if (firstLine === '') {
      lines.shift();
      changed = true;
      i--; // don't count empty line toward the limit
      continue;
    }
    
    // Check if line is a H1/H2 header of the title (which can be repeated title)
    const titleCleaned = title ? title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : '';
    const isRepeatedTitle = titleCleaned ? new RegExp(`^#+\\s+${titleCleaned}\\s*$`, 'i').test(firstLine) : false;
    const isGenericH1 = /^#\s+/i.test(firstLine);
    
    // Check if line is a subtitle line
    const isSubtitleHeader = /^##\s*Subtitle\s*$/i.test(firstLine);
    const isSubtitleInline = /^(?:##\s*Subtitle:?|\*\*Subtitle:?|\*Subtitle:?|Subtitle:)\s+/i.test(firstLine);
    
    // Check if line is a meta description/excerpt/expert line
    const isMetaDesc = /^(?:\*\*|\*|)?meta\s*(?:description|excerpt|expert)(?:\*\*|\*|)?:\s*/i.test(firstLine);
    
    if (isRepeatedTitle || isGenericH1 || isSubtitleInline || isMetaDesc) {
      lines.shift();
      changed = true;
      continue;
    }
    
    if (isSubtitleHeader) {
      lines.shift(); // shift "## Subtitle"
      if (lines.length > 0) {
        lines.shift(); // shift the actual subtitle content line
      }
      changed = true;
      continue;
    }
    
    break;
  }
  
  if (changed) {
    return lines.join('\n').trim();
  }
  
  return cleaned;
};

const extractSubtitle = (copy) => {
  if (!copy) return { subtitle: '', cleanCopy: '' };
  let cleaned = copy.trim();
  let lines = cleaned.split(/\r?\n/);
  let subtitle = '';
  let found = false;
  
  for (let i = 0; i < 6; i++) {
    if (lines.length <= i) break;
    const currentLine = lines[i].trim();
    if (currentLine === '') continue;
    
    const isSubtitleHeader = /^##\s*Subtitle\s*$/i.test(currentLine);
    const isSubtitleInline = /^(?:##\s*Subtitle:?|\*\*Subtitle:?|\*Subtitle:?|Subtitle:)\s+(.*)/i.test(currentLine);
    
    if (isSubtitleInline) {
      const match = currentLine.match(/^(?:##\s*Subtitle:?|\*\*Subtitle:?|\*Subtitle:?|Subtitle:)\s+(.*)/i);
      subtitle = match[1].trim();
      lines.splice(i, 1);
      found = true;
      break;
    }
    
    if (isSubtitleHeader) {
      let nextIdx = i + 1;
      while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
        nextIdx++;
      }
      if (nextIdx < lines.length) {
        subtitle = lines[nextIdx].trim();
        lines.splice(nextIdx, 1);
      }
      lines.splice(i, 1);
      found = true;
      break;
    }
  }
  
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  
  return {
    subtitle,
    cleanCopy: lines.join('\n').trim()
  };
};

const convertTablesToCodeBlocks = (markdown) => {
  if (!markdown) return '';
  const lines = markdown.split(/\r?\n/);
  const result = [];
  let inTable = false;
  let tableRows = [];
  
  const isRow = (line) => line.trim().startsWith('|') && line.trim().endsWith('|');
  const isSeparator = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
    const test = trimmed.slice(1, -1).replace(/[\s-:|]/g, '');
    return test === '' && trimmed.includes('-');
  };

  const generateCodeBlockTable = (rows) => {
    const cleanRows = rows.filter(row => !isSeparator(row.raw));
    const parsedRows = cleanRows.map(row => {
      return row.raw.trim().slice(1, -1).split('|').map(c => c.trim());
    });
    
    if (parsedRows.length === 0) return '';
    const colCount = Math.max(...parsedRows.map(r => r.length));
    const colWidths = Array(colCount).fill(0);
    parsedRows.forEach(row => {
      for (let i = 0; i < colCount; i++) {
        const cellVal = row[i] || '';
        if (cellVal.length > colWidths[i]) {
          colWidths[i] = cellVal.length;
        }
      }
    });
    
    const formattedLines = [];
    parsedRows.forEach((row, rowIdx) => {
      let formattedRow = '|';
      for (let i = 0; i < colCount; i++) {
        const cellVal = row[i] || '';
        const padding = ' '.repeat(colWidths[i] - cellVal.length);
        formattedRow += ` ${cellVal}${padding} |`;
      }
      formattedLines.push(formattedRow);
      
      if (rowIdx === 0) {
        let separatorRow = '|';
        for (let i = 0; i < colCount; i++) {
          separatorRow += ` ${'-'.repeat(colWidths[i])} |`;
        }
        formattedLines.push(separatorRow);
      }
    });
    
    return '\n```\n' + formattedLines.join('\n') + '\n```\n';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRow(line)) {
      inTable = true;
      tableRows.push({ raw: line, index: i });
    } else {
      if (inTable) {
        result.push(generateCodeBlockTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(line);
    }
  }
  
  if (inTable) {
    result.push(generateCodeBlockTable(tableRows));
  }
  
  return result.join('\n');
};

export const BlogPreview = ({ blogId, onBack }) => {
  const queryClient = useQueryClient();
  const { tasks, startTask, clearTask } = useTasks();
  
  const [activeTab, setActiveTab] = useState('canonical');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const [progressTimer, setProgressTimer] = useState(null);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // 1. Fetch active blog record
  const { data: blogRecord, isLoading: blogLoading, isError, error } = useQuery({
    queryKey: ['blog-preview-data', blogId],
    queryFn: async () => {
      const response = await api.get(`/blogs/${blogId}`);
      return response.data.data;
    },
    enabled: !!blogId,
    retry: false
  });

  // 2. Fetch rendered platform adaptation
  const resolvedPlatformName = resolvedPlatformNames[activeTab] || null;

  const {
    data: renderedRecord,
    isLoading: renderedLoading,
  } = useQuery({
    queryKey: ['rendered', blogId, resolvedPlatformName],
    queryFn: async () => {
      if (!blogId || !resolvedPlatformName) return null;
      try {
        const response = await api.get(`/render/blog/${blogId}/platform/${resolvedPlatformName}`);
        return response.data.data;
      } catch (err) {
        const is404 =
          (err && err.response && err.response.status === 404) ||
          (typeof err === 'string' && (
            err.toLowerCase().includes('no rendered') ||
            err.toLowerCase().includes('not found') ||
            err.toLowerCase().includes('404')
          ));
        if (is404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!blogId && !!resolvedPlatformName,
    retry: false
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCopy, setEditCopy] = useState('');
  const [editHashtags, setEditHashtags] = useState([]);
  const [editMetaDescription, setEditMetaDescription] = useState('');

  // Sync edit states when renderedRecord changes
  useEffect(() => {
    if (renderedRecord) {
      setEditTitle(renderedRecord.title || '');
      setEditCopy(renderedRecord.copy || '');
      setEditHashtags(renderedRecord.hashtags || []);
      setEditMetaDescription(renderedRecord.metaDescription || '');
    } else {
      setEditTitle('');
      setEditCopy('');
      setEditHashtags([]);
      setEditMetaDescription('');
    }
  }, [renderedRecord]);

  // Sync mutation to save platform rendered post
  const updateRenderMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await api.put(`/render/${renderedRecord._id}`, payload);
      return response.data.data;
    },
    onSuccess: (updatedRender) => {
      queryClient.setQueryData(['rendered', blogId, resolvedPlatformName], updatedRender);
      queryClient.invalidateQueries({ queryKey: ['rendered', blogId, resolvedPlatformName] });
      setIsEditing(false);
      triggerToast(`${resolvedPlatformName} copy updated & SEO score recalculated!`);
    }
  });

  // 3. Fetch images for cover art
  const { data: blogImages = [] } = useQuery({
    queryKey: ['images', blogId],
    queryFn: async () => {
      if (!blogId) return [];
      const response = await api.get(`/images/${blogId}`);
      return response.data.data || [];
    },
    enabled: !!blogId
  });

  const coverImageTaskId = blogId && activeTab ? `preview_image_generate_${blogId}_${activeTab}` : null;
  const adaptTaskId = blogId && activeTab ? `preview_adapt_${blogId}_${activeTab}` : null;
  const optimizeRenderTaskId = blogId && activeTab ? `preview_optimize_${blogId}_${activeTab}` : null;

  // Sync background cover image generation task
  useEffect(() => {
    if (!coverImageTaskId) return;
    const task = tasks[coverImageTaskId];
    if (task) {
      if (task.status === 'success') {
        queryClient.invalidateQueries({ queryKey: ['images', blogId] });
        triggerToast('Cover image generated successfully!');
        clearTask(coverImageTaskId);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        triggerToast(err.response?.data?.error || 'Cover image generation failed.', 'error');
        clearTask(coverImageTaskId);
      }
    }
  }, [tasks, coverImageTaskId, blogId, queryClient, clearTask]);

  const isAdapting = adaptTaskId && tasks[adaptTaskId]?.status === 'running';

  // Simulate active progress step for platform adaptation checklist loader
  useEffect(() => {
    if (isAdapting) {
      setActiveProgressStep(0);
      const timer = setInterval(() => {
        setActiveProgressStep((prev) => {
          if (prev < 4) return prev + 1;
          return prev;
        });
      }, 2500);
      setProgressTimer(timer);
      return () => {
        clearInterval(timer);
        setProgressTimer(null);
      };
    } else {
      if (progressTimer) {
        clearInterval(progressTimer);
        setProgressTimer(null);
      }
    }
  }, [isAdapting]);

  // Sync background platform adaptation task
  useEffect(() => {
    if (!adaptTaskId) return;
    const task = tasks[adaptTaskId];
    if (task) {
      if (task.status === 'success') {
        const newRendered = task.data;
        queryClient.setQueryData(['rendered', blogId, resolvedPlatformName], newRendered);
        triggerToast(`Content adapted for ${resolvedPlatformName} successfully!`);
        
        // Show 100% complete briefly
        setActiveProgressStep(5);
        
        const delayTimer = setTimeout(() => {
          clearTask(adaptTaskId);
        }, 1000);
        return () => clearTimeout(delayTimer);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        triggerToast(err.response?.data?.error || 'Content adaptation failed.', 'error');
        clearTask(adaptTaskId);
      }
    }
  }, [tasks, adaptTaskId, blogId, resolvedPlatformName, queryClient, clearTask]);

  // Sync background platform optimization task
  useEffect(() => {
    if (!optimizeRenderTaskId) return;
    const task = tasks[optimizeRenderTaskId];
    if (task) {
      if (task.status === 'success') {
        const optimizedRender = task.data;
        queryClient.setQueryData(['rendered', blogId, resolvedPlatformName], optimizedRender);
        triggerToast(`${resolvedPlatformName} copy auto-optimized successfully!`);
        clearTask(optimizeRenderTaskId);
      } else if (task.status === 'error') {
        const err = task.error;
        console.error(err);
        triggerToast(err.response?.data?.error || 'Optimization failed.', 'error');
        clearTask(optimizeRenderTaskId);
      }
    }
  }, [tasks, optimizeRenderTaskId, blogId, resolvedPlatformName, queryClient, clearTask]);

  const getPlatformDisplaySize = () => {
    if (activeTab === 'linkedin') return '1200x644';
    if (activeTab === 'medium') return '1400x788';
    if (activeTab === 'devto') return '1000x420';
    if (activeTab === 'substack') return '1456x1048';
    return '1792x1024';
  };

  const getPlatformDimensions = () => {
    if (activeTab === 'linkedin') return '1200x644';
    if (activeTab === 'medium') return '1400x788';
    if (activeTab === 'devto') return '1000x420';
    if (activeTab === 'substack') return '1456x1048';
    return '1792x1024';
  };

  const handleGenerateCoverImage = () => {
    if (!blogId || !coverImageTaskId) return;
    const dimensions = getPlatformDimensions();
    startTask(coverImageTaskId, async () => {
      const response = await api.post('/images/generate', {
        blogId,
        dimensions,
        platform: resolvedPlatformName || 'Canonical'
      });
      
      const imgData = response.data.data;

      // If the image is currently generating in the background, poll until it is ready
      if (imgData && imgData.imageUrl === 'generating') {
        const targetDim = getPlatformDimensions();
        let attempts = 0;
        const maxAttempts = 30; // 90 seconds max (3s * 30)

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const listResponse = await api.get(`/images/${blogId}`);
          const list = listResponse.data.data || [];

          // Find the image for the target platform that is fully generated
          const readyImg = list.find(img => img.dimensions === targetDim && img.imageUrl !== 'generating');
          if (readyImg) {
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
            return readyImg;
          }
          attempts++;
        }
        throw new Error('Image generation timed out.');
      }
      
      queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
      return imgData;
    });
  };

  const getCoverImageForPlatform = () => {
    if (!blogImages || blogImages.length === 0) return null;
    const sortedImages = [...blogImages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const targetDim = getPlatformDimensions();
    const matchingImg = sortedImages.find(img => img.dimensions === targetDim);
    if (matchingImg) return matchingImg.imageUrl;
    const anyLandscape = sortedImages.find(img => img.dimensions === '1792x1024' || img.dimensions === 'custom');
    if (anyLandscape) return anyLandscape.imageUrl;
    return sortedImages[0].imageUrl;
  };

  const coverImage = getCoverImageForPlatform();
  const resolvedCoverImageUrl = coverImage
    ? (coverImage.startsWith('/uploads') ? `http://localhost:4000${coverImage}` : coverImage)
    : null;

  const getMaskedImageUrl = (url) => {
    if (!url) return "";
    if (url.includes('amazonaws.com') || url.includes('/images/')) {
      const filename = url.split('/').pop();
      const baseUrl = window.location.origin;
      return `${baseUrl}/api/images/view/${filename}`;
    }
    return url;
  };

  const handleDownloadCoverImage = () => {
    if (!resolvedCoverImageUrl) return;
    try {
      const token = localStorage.getItem('creative_studio_token') || localStorage.getItem('token');
      const downloadUrl = `/api/images/download?url=${encodeURIComponent(resolvedCoverImageUrl)}&token=${encodeURIComponent(token)}`;
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      const extension = resolvedCoverImageUrl.split('.').pop().split('?')[0] || 'png';
      link.setAttribute("download", `cover_image_${activeTab}_${blogRecord?.slug || 'post'}.${extension}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast('Cover image download started!');
    } catch (err) {
      console.error('Failed to download cover image: ', err);
      window.open(resolvedCoverImageUrl, '_blank');
      triggerToast('Opened image in new tab.');
    }
  };

  const handleAdapt = () => {
    if (!blogId || !resolvedPlatformName || !adaptTaskId) return;
    startTask(adaptTaskId, async () => {
      try {
        const response = await api.post(`/render/${resolvedPlatformName.replace(' ', '-')}`, { blogId });
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        return response.data.data;
      } catch (err) {
        console.warn('Adaptation request timed out or failed, starting polling...', err);
        
        let attempts = 0;
        const maxAttempts = 20; // 60 seconds max
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const getRes = await api.get(`/render/blog/${blogId}/platform/${resolvedPlatformName}`);
            if (getRes.data && getRes.data.data) {
              queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
              return getRes.data.data;
            }
          } catch (getErr) {
            // Keep polling on 404
          }
          attempts++;
        }
        throw new Error('Content adaptation timed out. Please try again.');
      }
    });
  };

  const handleOptimizeRender = () => {
    if (!renderedRecord || !optimizeRenderTaskId) return;
    startTask(optimizeRenderTaskId, async () => {
      try {
        const response = await api.post(`/render/${renderedRecord._id}/optimize`);
        queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        return response.data.data;
      } catch (err) {
        console.warn('Optimize request timed out or failed, starting polling...', err);
        
        let attempts = 0;
        const maxAttempts = 20; // 60 seconds max
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const getRes = await api.get(`/render/blog/${blogId}/platform/${resolvedPlatformName}`);
            if (getRes.data && getRes.data.data) {
              queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
              return getRes.data.data;
            }
          } catch (getErr) {
            // Keep polling on 404
          }
          attempts++;
        }
        throw new Error('Optimize adaptation timed out. Please try again.');
      }
    });
  };

  const copyTextFallback = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to top or making it completely hidden/non-focusable
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    
    // Select text
    textArea.select();
    textArea.setSelectionRange(0, 99999); // Mobile
    
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {
      console.error('Fallback execCommand failed:', err);
    }
    
    document.body.removeChild(textArea);
    
    if (success) {
      triggerToast('Copied content to clipboard successfully!');
    } else {
      // Direct writeText fallback if available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            triggerToast('Copied content to clipboard successfully!');
          })
          .catch((err) => {
            console.error('Fallback writeText failed:', err);
            triggerToast('Failed to copy to clipboard.');
          });
      } else {
        triggerToast('Failed to copy to clipboard.');
      }
    }
  };


  const copyToClipboard = async (plainText, htmlText) => {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const clipboardData = {
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        };
        if (htmlText) {
          clipboardData['text/html'] = new Blob([htmlText], { type: 'text/html' });
        }
        const item = new ClipboardItem(clipboardData);
        await navigator.clipboard.write([item]);
        triggerToast('Copied content to clipboard successfully!');
      } else {
        copyTextFallback(plainText);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      copyTextFallback(plainText);
    }
  };

  const handleCopy = async () => {
    const imageLink = getMaskedImageUrl(resolvedCoverImageUrl);
    if (activeTab === 'canonical') {
      if (!blogRecord) return;
      const strippedContent = stripLeadingTitle(blogRecord.content, blogRecord.title);
      let plainText = `# ${blogRecord.title}\n\n`;
      let htmlText = `<h1>${blogRecord.title}</h1>\n`;
      if (resolvedCoverImageUrl) {
        plainText += `![Cover Image](${imageLink})\n\n`;
        htmlText += `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-bottom:24px; display:block;" />\n`;
      }
      plainText += strippedContent;
      htmlText += renderMarkdownToHTML(strippedContent);
      await copyToClipboard(plainText, htmlText);
    } else {
      if (!renderedRecord) return;
      let plainText = "";
      let htmlText = "";

      if (activeTab === 'linkedin') {
        const titleText = renderedRecord.title || blogRecord.title;
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        
        let plainPart = "";
        let htmlPart = "";

        if (renderedRecord.title) {
          plainPart += `${renderedRecord.title}\n\n`;
          htmlPart += `<h1>${renderedRecord.title}</h1>\n`;
        }
        if (resolvedCoverImageUrl) {
          plainPart += `[Image Attachment: ${imageLink}]\n\n`;
          htmlPart += `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-bottom:24px; display:block;" />\n`;
        }

        const cleanCopy = cleanCopyWithoutTrailingHashtags(strippedCopy);
        plainPart += cleanCopy;
        htmlPart += renderMarkdownToHTML(cleanCopy);

        if (renderedRecord.hashtags && renderedRecord.hashtags.length > 0) {
          const hashtagsStr = renderedRecord.hashtags.map(t => `#${t}`).join(' ');
          plainPart += `\n\n${hashtagsStr}`;
          htmlPart += `<p>${hashtagsStr}</p>`;
        }

        plainText = plainPart;
        htmlText = htmlPart;
      } else if (activeTab === 'medium') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        const copyWithCodeBlockTables = convertTablesToCodeBlocks(strippedCopy);
        plainText = `# ${titleText}\n\n`;
        htmlText = `<h1>${titleText}</h1>\n`;
        if (subtitle) {
          plainText += `${subtitle}\n\n`;
          htmlText += `<h2>${subtitle}</h2>\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
          htmlText += `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-bottom:24px; display:block;" />\n`;
        }
        plainText += copyWithCodeBlockTables;
        htmlText += renderMarkdownToHTML(copyWithCodeBlockTables);
      } else if (activeTab === 'substack') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle: extractedSub, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const displaySubtitle = renderedRecord.metaDescription || extractedSub;
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        plainText = `# ${titleText}\n\n`;
        htmlText = `<h1>${titleText}</h1>\n`;
        if (displaySubtitle) {
          plainText += `${displaySubtitle}\n\n`;
          htmlText += `<h2>${displaySubtitle}</h2>\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
          htmlText += `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-bottom:24px; display:block;" />\n`;
        }
        plainText += strippedCopy;
        htmlText += renderMarkdownToHTML(strippedCopy);
      } else if (activeTab === 'blog') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        plainText = `# ${titleText}\n\n`;
        htmlText = `<h1>${titleText}</h1>\n`;
        if (subtitle) {
          plainText += `${subtitle}\n\n`;
          htmlText += `<h2>${subtitle}</h2>\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
          htmlText += `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-bottom:24px; display:block;" />\n`;
        }
        plainText += strippedCopy;
        htmlText += renderMarkdownToHTML(strippedCopy);
      } else if (activeTab === 'devto') {
        const titleText = renderedRecord.title || blogRecord.title;
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        const cleanCopy = cleanCopyWithoutTrailingHashtags(strippedCopy);
        plainText = cleanCopy;
        htmlText = renderMarkdownToHTML(cleanCopy);
      }
      await copyToClipboard(plainText, htmlText);
    }
  };

  const handleDownloadMD = () => {
    let plainText = "";
    let filename = "";
    const imageLink = getMaskedImageUrl(resolvedCoverImageUrl);

    if (!blogRecord) return;
    const author = blogRecord.author || 'Unassigned';
    const category = blogRecord.keywordCategory || 'General';
    const date = blogRecord.publishDate ? new Date(blogRecord.publishDate).toLocaleDateString() : new Date().toLocaleDateString();

    const yamlFrontMatter = `---\ntitle: "${blogRecord.title}"\nauthor: "${author}"\ncategory: "${category}"\ndate: "${date}"\n---\n\n`;

    if (activeTab === 'canonical') {
      const strippedContent = stripLeadingTitle(blogRecord.content, blogRecord.title);
      plainText = yamlFrontMatter + `# ${blogRecord.title}\n\n`;
      if (resolvedCoverImageUrl) {
        plainText += `![Cover Image](${imageLink})\n\n`;
      }
      plainText += strippedContent;
      filename = `${blogRecord.slug || 'canonical'}.md`;
    } else {
      if (!renderedRecord) return;
      const slugName = blogRecord?.slug || 'post';

      if (activeTab === 'linkedin') {
        const titleText = renderedRecord.title || blogRecord.title;
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        plainText = `Author: ${author}\nCategory: ${category}\nDate: ${date}\n\n`;
        if (renderedRecord.title) plainText += `${renderedRecord.title}\n\n`;
        if (resolvedCoverImageUrl) plainText += `[Image Attachment: ${imageLink}]\n\n`;
        plainText += cleanCopyWithoutTrailingHashtags(strippedCopy);
        if (renderedRecord.hashtags && renderedRecord.hashtags.length > 0) {
          plainText += `\n\n${renderedRecord.hashtags.map(t => `#${t}`).join(' ')}`;
        }
        filename = `linkedin_${slugName}.md`;
      } else if (activeTab === 'medium') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        const copyWithCodeBlockTables = convertTablesToCodeBlocks(strippedCopy);
        plainText = yamlFrontMatter + `# ${titleText}\n\n`;
        if (subtitle) {
          plainText += `${subtitle}\n\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
        }
        plainText += copyWithCodeBlockTables;
        filename = `medium_${slugName}.md`;
      } else if (activeTab === 'substack') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle: extractedSub, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const displaySubtitle = renderedRecord.metaDescription || extractedSub;
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        plainText = yamlFrontMatter + `# ${titleText}\n\n`;
        if (displaySubtitle) {
          plainText += `${displaySubtitle}\n\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
        }
        plainText += strippedCopy;
        filename = `substack_${slugName}.md`;
      } else if (activeTab === 'blog') {
        const titleText = renderedRecord.title || blogRecord.title;
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        plainText = yamlFrontMatter + `# ${titleText}\n\n`;
        if (subtitle) {
          plainText += `${subtitle}\n\n`;
        }
        if (resolvedCoverImageUrl) {
          plainText += `![Cover Image](${imageLink})\n\n`;
        }
        plainText += strippedCopy;
        filename = `blog_${slugName}.md`;
      } else if (activeTab === 'devto') {
        const titleText = renderedRecord.title || blogRecord.title;
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        plainText = cleanCopyWithoutTrailingHashtags(strippedCopy);
        filename = `devto_${slugName}.md`;
      }
    }

    if (!plainText) return;

    try {
      const blob = new Blob([plainText], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerToast(`Downloaded ${filename} successfully!`);
    } catch (err) {
      console.error('Failed to download MD: ', err);
      triggerToast('Failed to download Markdown file.');
    }
  };

  const handleDownloadHTML = () => {
    let titleText = "";
    let subtitleText = "";
    let bodyHtml = "";
    let filename = "";
    const imageLink = getMaskedImageUrl(resolvedCoverImageUrl);

    if (!blogRecord) return;
    const author = blogRecord.author || 'Unassigned';
    const category = blogRecord.keywordCategory || 'General';
    const date = blogRecord.publishDate ? new Date(blogRecord.publishDate).toLocaleDateString() : new Date().toLocaleDateString();

    if (activeTab === 'canonical') {
      const strippedContent = stripLeadingTitle(blogRecord.content, blogRecord.title);
      titleText = blogRecord.title;
      bodyHtml = renderMarkdownToHTML(strippedContent);
      filename = `${blogRecord.slug || 'canonical'}.html`;
    } else {
      if (!renderedRecord) return;
      const slugName = blogRecord?.slug || 'post';
      titleText = renderedRecord.title || blogRecord.title;

      if (activeTab === 'linkedin') {
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        const cleanCopy = cleanCopyWithoutTrailingHashtags(strippedCopy);
        let htmlPart = renderMarkdownToHTML(cleanCopy);
        if (renderedRecord.hashtags && renderedRecord.hashtags.length > 0) {
          htmlPart += `<p>${renderedRecord.hashtags.map(t => `#${t}`).join(' ')}</p>`;
        }
        bodyHtml = htmlPart;
        filename = `linkedin_${slugName}.html`;
      } else if (activeTab === 'medium') {
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        const copyWithCodeBlockTables = convertTablesToCodeBlocks(strippedCopy);
        subtitleText = subtitle;
        bodyHtml = renderMarkdownToHTML(copyWithCodeBlockTables);
        filename = `medium_${slugName}.html`;
      } else if (activeTab === 'substack') {
        const { subtitle: extractedSub, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const displaySubtitle = renderedRecord.metaDescription || extractedSub;
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        subtitleText = displaySubtitle;
        bodyHtml = renderMarkdownToHTML(strippedCopy);
        filename = `substack_${slugName}.html`;
      } else if (activeTab === 'blog') {
        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
        const strippedCopy = cleanPlatformCopy(cleanCopy, titleText);
        subtitleText = subtitle;
        bodyHtml = renderMarkdownToHTML(strippedCopy);
        filename = `blog_${slugName}.html`;
      } else if (activeTab === 'devto') {
        const strippedCopy = cleanPlatformCopy(renderedRecord.copy, titleText);
        bodyHtml = renderMarkdownToHTML(cleanCopyWithoutTrailingHashtags(strippedCopy));
        filename = `devto_${slugName}.html`;
      }
    }

    if (!bodyHtml) return;

    let htmlContent = "";

    if (activeTab === 'devto') {
      const hashtagsList = renderedRecord?.hashtags && renderedRecord.hashtags.length > 0
        ? renderedRecord.hashtags
        : ['devops', 'kubernetes', 'tutorial'];

      htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${titleText}</title>
  <style>
    body {
      background-color: #0F141C;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.62;
      color: #d1d5db;
      max-width: 680px;
      margin: 40px auto;
      padding: 32px;
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      margin-top: 10px;
      margin-bottom: 0.5rem;
      line-height: 1.25;
      color: #ffffff;
    }
    h2, h3, h4, h5, h6 {
      font-weight: 700;
      color: #ffffff;
      margin-top: 2rem;
      margin-bottom: 0.5rem;
    }
    h2 { font-size: 1.6rem; }
    h3 { font-size: 1.3rem; }
    p {
      margin-top: 0;
      margin-bottom: 1.5rem;
      font-size: 1.05rem;
      color: #d1d5db;
    }
    ul, ol {
      margin-top: 0;
      margin-bottom: 1.5rem;
      padding-left: 2rem;
      font-size: 1.05rem;
    }
    pre {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.25rem;
      overflow-x: auto;
    }
    code {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
      color: #f25b18;
    }
    a {
      color: #f25b18;
      text-decoration: underline;
    }
    a:hover {
      color: #d1460f;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.95rem;
    }
    th, td {
      border: 1px solid #334155;
      padding: 0.75rem;
      text-align: left;
    }
    th {
      background: #1e293b;
      font-weight: 600;
      color: #ffffff;
    }
    tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.02);
    }
  </style>
</head>
<body>
  ${resolvedCoverImageUrl ? `<div style="width: 100%; background-color: #0B0F17; border-bottom: 1px solid rgba(255, 255, 255, 0.05); text-align: center; margin-bottom: 24px; border-radius: 12px; overflow: hidden;"><img src="${imageLink}" alt="Cover Image" style="width: 100%; height: auto; display: block;" /></div>` : ''}
  
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
    <div style="width: 36px; height: 36px; border-radius: 50%; background-color: #1e293b; border: 1px solid #334155; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #ffffff; font-size: 0.75rem; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">VO</div>
    <div style="font-size: 0.75rem; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
      <div><span style="font-weight: bold; color: #e2e8f0;">Veloce Operations</span> <span style="color: #64748b; margin: 0 4px;">•</span> <span style="color: #64748b;">June 11 (2026)</span></div>
      <div style="color: #64748b; margin-top: 2px;">Sourced via Growth OS Content Pipeline</div>
    </div>
  </div>
  
  <h1>${titleText}</h1>
  
  <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; margin-bottom: 24px;">
    ${hashtagsList.map(tag => `<span style="font-size: 0.7rem; color: #94a3b8; padding: 2px 8px; background-color: rgba(255, 255, 255, 0.05); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); font-family: monospace;">#${tag}</span>`).join('')}
  </div>
  
  ${bodyHtml}
</body>
</html>`;
    } else {
      htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${titleText}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.62;
      color: #292929;
      max-width: 680px;
      margin: 40px auto;
      padding: 0 20px;
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      line-height: 1.25;
      color: #1a1a1a;
    }
    h2 {
      font-size: 1.6rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 0.5rem;
      color: #1a1a1a;
    }
    p {
      margin-top: 0;
      margin-bottom: 1.5rem;
      font-size: 1.1rem;
      color: #292929;
    }
    ul, ol {
      margin-top: 0;
      margin-bottom: 1.5rem;
      padding-left: 2rem;
      font-size: 1.1rem;
    }
    pre {
      background: #f9f9f9;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1.25rem;
      overflow-x: auto;
    }
    code {
      background: #f1f5f9;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
    }
    a {
      color: #f25b18;
      text-decoration: underline;
    }
    a:hover {
      color: #d1460f;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.95rem;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 0.75rem;
      text-align: left;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <h1>${titleText}</h1>
  ${subtitleText ? `<h2 style="font-size: 1.4rem; font-weight: 400; color: #6b7280; margin-top: 4px; margin-bottom: 20px; font-family: Georgia, Cambria, 'Times New Roman', Times, serif; line-height: 1.4;">${subtitleText}</h2>` : ''}
  ${resolvedCoverImageUrl ? `<img src="${imageLink}" alt="Cover Image" style="width:100%; max-width:680px; height:auto; border-radius:12px; margin-top:16px; margin-bottom:24px; display:block;" />` : ''}
  ${bodyHtml}
</body>
</html>`;
    }

    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerToast(`Downloaded ${filename} successfully!`);
    } catch (err) {
      console.error('Failed to download HTML: ', err);
      triggerToast('Failed to download HTML file.');
    }
  };

  if (blogLoading) {
    return (
      <div className="glass-card rounded-3xl p-12 border border-white/5 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm font-semibold tracking-wider text-slate-400">Loading preview center...</p>
      </div>
    );
  }

  if (isError || !blogRecord) {
    return (
      <div className="glass-card rounded-3xl p-12 border border-red-500/20 text-center space-y-4 max-w-lg mx-auto">
        <AlertCircle size={40} className="text-red-400 mx-auto" />
        <h3 className="text-xl font-bold text-red-200">Failed to Load Blog</h3>
        <p className="text-xs text-slate-400">{error?.message || 'Blog not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Floating Success Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 glass-card bg-white/95 border border-primary/20 text-foreground text-sm px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap animate-slide-down-center">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Check size={14} />
          </div>
          <span className="font-semibold text-slate-800">{toastMessage}</span>
        </div>
      )}

      {/* Preview Header & Back Button */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <button
          onClick={onBack}
          className="px-3 py-2 border border-border hover:border-border/80 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft size={13} />
          <span>Back to directory</span>
        </button>
        <span className="text-xs text-muted-foreground font-mono">Platform Simulator Previews</span>
      </div>

      <div className="space-y-6">
        {/* Platform Tab Selector */}
        <div className="flex overflow-x-auto scrollbar-none border border-border/80 rounded-2xl bg-secondary/30 p-1.5 shrink-0 w-full max-w-4xl gap-1 mx-auto whitespace-nowrap">
          {['canonical', 'linkedin', 'medium', 'blog', 'devto', 'substack'].map((tab) => {
            const label =
              tab === 'canonical'
                ? 'Canonical'
                : tab === 'linkedin'
                ? 'LinkedIn Article'
                : tab === 'medium'
                ? 'Medium Story'
                : tab === 'blog'
                ? 'Company Blog'
                : tab === 'devto'
                ? 'Dev.to Post'
                : 'Substack';

            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setIsEditing(false);
                }}
                className={`flex-1 py-3 text-center text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-primary/10 to-primary/20 text-primary border border-primary/20 shadow-glow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Cover Image Assistant Panel */}
        <div className="bg-card text-card-foreground border border-border/60 rounded-2xl p-4 w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-4 select-none mx-auto shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary relative overflow-hidden shrink-0 select-none">
              {resolvedCoverImageUrl ? (
                <img src={resolvedCoverImageUrl} alt="Cover preview" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={20} className="text-muted-foreground/80" />
              )}
            </div>
            <div className="text-left">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                <span>Cover Image Assistant</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono font-medium lowercase">
                  {getPlatformDisplaySize()}
                </span>
              </h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {resolvedCoverImageUrl
                  ? `Loaded cover visual for this topic/platform. Will embed in downloaded files.`
                  : `No tailored cover image found. Generate one matching active platform rules.`}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {resolvedCoverImageUrl && (
              <button
                onClick={handleDownloadCoverImage}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download size={13} />
                <span>Download Image</span>
              </button>
            )}
            <button
              onClick={handleGenerateCoverImage}
              disabled={coverImageTaskId && tasks[coverImageTaskId]?.status === 'running'}
              className="px-4 py-2 bg-gradient-to-r from-primary/10 to-primary/20 hover:from-primary/20 hover:to-primary/30 text-primary border border-primary/20 hover:border-primary/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-glow-sm cursor-pointer disabled:opacity-50"
            >
              {coverImageTaskId && tasks[coverImageTaskId]?.status === 'running' ? (
                <>
                  <Loader2 className="animate-spin" size={13} />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>{resolvedCoverImageUrl ? 'Regenerate Cover (3 Credits)' : 'Generate Cover (3 Credits)'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tab Display Area */}
        <div className="min-h-[480px]">
          {/* A. CANONICAL PREVIEW TAB */}
          {activeTab === 'canonical' && (
            <div className="bg-card text-card-foreground border border-border/60 rounded-3xl p-8 w-full max-w-4xl space-y-6 mx-auto shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border/50 pb-4 gap-4">
                <div>
                  <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border uppercase tracking-widest font-mono mb-2">
                    Canonical Article Draft
                  </span>
                  <h3 className="text-2xl font-bold text-foreground tracking-tight">{blogRecord.title}</h3>
                  <p className="text-xs text-muted-foreground mt-2 font-mono leading-relaxed">Meta Description: {blogRecord.metaDescription}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Share2 size={13} />
                    <span>Copy</span>
                  </button>
                  <button
                    onClick={handleDownloadMD}
                    className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={13} />
                    <span>MD</span>
                  </button>
                  <button
                    onClick={handleDownloadHTML}
                    className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={13} />
                    <span>HTML</span>
                  </button>
                </div>
              </div>

              {/* Canonical SEO scorecard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/40 border border-border/60 rounded-2xl text-center text-xs">
                <div>
                  <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">SEO Score</span>
                  <span className={`text-base font-extrabold font-mono ${
                    blogRecord.seoScore >= 80 ? 'text-emerald-500' : blogRecord.seoScore >= 50 ? 'text-amber-500' : 'text-rose-500'
                  }`}>
                    {blogRecord.seoScore || 0}/100
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Words</span>
                  <span className="text-base font-extrabold font-mono text-foreground">
                    {blogRecord.content ? blogRecord.content.trim().split(/\s+/).filter(Boolean).length : 0}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Readability</span>
                  <span className="text-base font-extrabold font-mono text-foreground">
                    {blogRecord.seoAnalysis?.readabilityScore || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Density</span>
                  <span className="text-base font-extrabold font-mono text-foreground">
                    {blogRecord.seoAnalysis?.keywordDensity !== undefined ? `${blogRecord.seoAnalysis.keywordDensity}%` : '0%'}
                  </span>
                </div>
              </div>
              
              {resolvedCoverImageUrl && (
                <div className="w-full rounded-2xl overflow-hidden border border-border/60 max-h-[300px] bg-secondary select-none mb-6">
                  <img src={resolvedCoverImageUrl} alt="Canonical Cover" className="w-full h-full object-cover" />
                </div>
              )}
              
              <div 
                className="prose dark:prose-invert max-w-none text-foreground/85 text-sm leading-relaxed max-h-[420px] overflow-y-auto pr-2 scrollbar-glass"
                dangerouslySetInnerHTML={{ __html: renderMarkdownToHTML(stripLeadingTitle(blogRecord.content, blogRecord.title)) }}
              />
            </div>
          )}

          {/* B. ADAPTED VIEWS */}
          {activeTab !== 'canonical' && (
            <div className="w-full">
              {(adaptTaskId && tasks[adaptTaskId]?.status === 'running') ? (
                <div className="bg-card text-card-foreground border border-border/60 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-8 min-h-[460px] relative overflow-hidden w-full max-w-3xl mx-auto shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-accent/5 pointer-events-none" />
                  
                  {/* Progress Circular Loader */}
                  <div className="relative w-20 h-20 mx-auto">
                    {activeProgressStep < 5 ? (
                      <>
                        <div className="absolute inset-0 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                        <div className="absolute inset-2 bg-card rounded-full flex items-center justify-center text-primary font-extrabold text-xs">
                          {activeProgressStep * 20}%
                        </div>
                      </>
                    ) : (
                      <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-bounce">
                        <CheckCircle2 size={36} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-bold tracking-tight text-foreground animate-pulse">Adapting Content for {resolvedPlatformName}</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Restructuring canonical Markdown copy for <strong>{resolvedPlatformName}</strong> specific settings...
                    </p>
                  </div>

                  {/* Progress Steps Checklist */}
                  <div className="bg-secondary/40 border border-border/60 rounded-2xl p-6 text-left space-y-3.5 max-w-sm w-full mx-auto shadow-inner">
                    {[
                      { id: 0, label: 'Reading Canonical Blog Draft' },
                      { id: 1, label: `Aligning Style with ${resolvedPlatformName} Spec` },
                      { id: 2, label: 'Re-writing Hooks & Section Headers' },
                      { id: 3, label: 'Structuring Output & Formatting' },
                      { id: 4, label: 'Optimizing Meta & Platform SEO Tags' },
                      { id: 5, label: 'Complete!' }
                    ].map((step) => {
                      const isCompleted = activeProgressStep > step.id || activeProgressStep === 5;
                      const isActive = activeProgressStep === step.id && activeProgressStep < 5;
                      return (
                        <div key={step.id} className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${
                            isCompleted ? 'text-emerald-600 dark:text-emerald-400' : isActive ? 'text-primary' : 'text-muted-foreground/80'
                          }`}>
                            {step.label}
                          </span>

                          {isCompleted ? (
                            <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0" />
                          ) : isActive ? (
                            <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-secondary border border-border shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : renderedLoading ? (
                <div className="glass-card rounded-3xl p-12 border border-white/5 flex flex-col items-center justify-center min-h-[400px] gap-3">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-sm font-semibold tracking-wider text-slate-400">Loading platform rendering...</p>
                </div>
              ) : !renderedRecord ? (
                <div className="bg-card text-card-foreground border border-border/60 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6 min-h-[400px] w-full max-w-xl mx-auto shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-pulse">
                    <Zap size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground">Adaptation Required</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      No customized post rendered for <strong>{resolvedPlatformName}</strong> yet. Adapt the canonical content dynamically.
                    </p>
                  </div>
                  <button
                    onClick={handleAdapt}
                    className="px-6 py-3 bg-gradient-to-r from-primary to-accent text-background font-bold rounded-xl shadow-glow transition-all hover:opacity-90 flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles size={16} />
                    <span>Render for {resolvedPlatformName} (5 Credits)</span>
                  </button>
                </div>
              ) : (
                /* Visual Simulators */
                <div className="w-full space-y-4 animate-fade-in">
                  <div className={`flex flex-wrap items-center justify-end gap-2 ${
                    activeTab === 'linkedin' || activeTab === 'medium' || activeTab === 'devto' || activeTab === 'substack' ? 'max-w-2xl' : 'max-w-4xl'
                  } mx-auto px-1`}>
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer mr-auto"
                        >
                          <FileText size={13} />
                          <span>Edit Platform Copy</span>
                        </button>
                        <button
                          onClick={handleOptimizeRender}
                          disabled={(optimizeRenderTaskId && tasks[optimizeRenderTaskId]?.status === 'running')}
                          className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-glow-sm cursor-pointer mr-2"
                        >
                          {(optimizeRenderTaskId && tasks[optimizeRenderTaskId]?.status === 'running') ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Sparkles size={13} />
                          )}
                          <span>Auto Optimize SEO (5 Credits)</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleCopy}
                      className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Share2 size={13} />
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={handleDownloadMD}
                      className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download size={13} />
                      <span>MD</span>
                    </button>
                    <button
                      onClick={handleDownloadHTML}
                      className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download size={13} />
                      <span>HTML</span>
                    </button>
                    <button
                      onClick={handleAdapt}
                      disabled={(adaptTaskId && tasks[adaptTaskId]?.status === 'running')}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-glow-sm cursor-pointer"
                    >
                      <Repeat2 size={13} className={(adaptTaskId && tasks[adaptTaskId]?.status === 'running') ? "animate-spin" : ""} />
                      <span>Regenerate (5 Credits)</span>
                    </button>
                  </div>

                  {/* Adapted SEO scorecard */}
                  <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/40 border border-border/60 rounded-2xl text-center text-xs ${
                    activeTab === 'linkedin' || activeTab === 'medium' || activeTab === 'devto' || activeTab === 'substack' ? 'max-w-2xl' : 'max-w-4xl'
                  } mx-auto`}>
                    <div>
                      <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Platform SEO Score</span>
                      <span className={`text-base font-extrabold font-mono ${
                        renderedRecord.seoScore >= 80 ? 'text-emerald-500' : renderedRecord.seoScore >= 50 ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                        {renderedRecord.seoScore || 0}/100
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Words</span>
                      <span className="text-base font-extrabold font-mono text-foreground">
                        {renderedRecord.copy ? renderedRecord.copy.trim().split(/\s+/).filter(Boolean).length : 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Readability</span>
                      <span className="text-base font-extrabold font-mono text-foreground">
                        {renderedRecord.seoAnalysis?.readabilityScore || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground/85 font-bold uppercase block">Density</span>
                      <span className="text-base font-extrabold font-mono text-foreground">
                        {renderedRecord.seoAnalysis?.keywordDensity !== undefined ? `${renderedRecord.seoAnalysis.keywordDensity}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  {!isEditing && (
                    <div className={`p-4 bg-secondary/40 border border-border/60 rounded-2xl text-left text-xs ${
                      activeTab === 'linkedin' || activeTab === 'medium' || activeTab === 'devto' || activeTab === 'substack' ? 'max-w-2xl' : 'max-w-4xl'
                    } mx-auto space-y-2`}>
                      {renderedRecord.metaDescription && activeTab !== 'substack' && (
                        <p className="text-muted-foreground font-mono leading-relaxed">
                          <strong className="text-foreground font-semibold uppercase text-[9px] block mb-0.5">Meta Description:</strong>
                          {renderedRecord.metaDescription}
                        </p>
                      )}
                      {renderedRecord.hashtags && renderedRecord.hashtags.length > 0 && (
                        <p className="text-muted-foreground font-mono leading-relaxed">
                          <strong className="text-foreground font-semibold uppercase text-[9px] block mb-0.5">Hashtags:</strong>
                          <span className="text-primary font-semibold">
                            {renderedRecord.hashtags.map(tag => `#${tag}`).join(' ')}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  
                  {isEditing ? (
                    <div className={`bg-card text-card-foreground border border-border/60 rounded-3xl p-6 md:p-8 w-full ${
                      activeTab === 'linkedin' || activeTab === 'medium' || activeTab === 'devto' || activeTab === 'substack' ? 'max-w-2xl' : 'max-w-4xl'
                    } mx-auto space-y-4 text-left shadow-sm`}>
                      <div className="flex justify-between items-center border-b border-border pb-3">
                        <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Edit {resolvedPlatformName} Post</h4>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="p-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Title / Headline Hook</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Body Copy (Markdown)</label>
                        <textarea
                          rows={12}
                          value={editCopy}
                          onChange={(e) => setEditCopy(e.target.value)}
                          className="w-full p-4 bg-background border border-border rounded-xl text-foreground text-xs font-mono leading-relaxed focus:outline-none focus:border-primary transition-colors resize-none"
                        />
                      </div>

                      {['linkedin', 'devto'].includes(activeTab) && (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Hashtags (Comma Separated)</label>
                          <input
                            type="text"
                            value={editHashtags.join(', ')}
                            onChange={(e) => setEditHashtags(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Meta Description</label>
                        <textarea
                          rows={2}
                          value={editMetaDescription}
                          onChange={(e) => setEditMetaDescription(e.target.value)}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition-colors resize-none"
                        />
                      </div>

                      <div className="pt-4 flex justify-end gap-2 border-t border-border mt-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border font-bold rounded-xl text-xs transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            updateRenderMutation.mutate({
                              title: editTitle,
                              copy: editCopy,
                              hashtags: editHashtags,
                              metaDescription: editMetaDescription,
                            });
                          }}
                          disabled={updateRenderMutation.isPending}
                          className="px-5 py-2 bg-gradient-to-r from-primary to-accent text-background font-extrabold rounded-xl text-xs transition-all shadow-glow flex items-center gap-1.5 cursor-pointer"
                        >
                          {updateRenderMutation.isPending ? (
                            <>
                              <Loader2 className="animate-spin" size={13} />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save size={13} />
                              <span>Save Changes</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeTab === 'linkedin' && (
                        <LinkedInPreview
                          title={renderedRecord.title}
                          copy={cleanCopyWithoutTrailingHashtags(cleanPlatformCopy(renderedRecord.copy, renderedRecord.title || blogRecord.title))}
                          hashtags={renderedRecord.hashtags}
                          imageUrl={resolvedCoverImageUrl}
                        />
                      )}

                      {activeTab === 'medium' && (() => {
                        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
                        const strippedCopy = cleanPlatformCopy(cleanCopy, renderedRecord.title || blogRecord.title);
                        const copyWithCodeBlockTables = convertTablesToCodeBlocks(strippedCopy);
                        return (
                          <MediumPreview
                            title={renderedRecord.title}
                            subtitle={subtitle}
                            copy={copyWithCodeBlockTables}
                            imageUrl={resolvedCoverImageUrl}
                          />
                        );
                      })()}

                      {activeTab === 'blog' && (() => {
                        const { subtitle, cleanCopy } = extractSubtitle(renderedRecord.copy);
                        return (
                          <CompanyBlogPreview
                            title={renderedRecord.title}
                            subtitle={subtitle}
                            copy={cleanPlatformCopy(cleanCopy, renderedRecord.title || blogRecord.title)}
                            imageUrl={resolvedCoverImageUrl}
                          />
                        );
                      })()}

                      {activeTab === 'devto' && (
                        <DevToPreview
                          title={renderedRecord.title}
                          copy={cleanCopyWithoutTrailingHashtags(cleanPlatformCopy(renderedRecord.copy, renderedRecord.title || blogRecord.title))}
                          hashtags={renderedRecord.hashtags}
                          imageUrl={resolvedCoverImageUrl}
                        />
                      )}

                      {activeTab === 'substack' && (() => {
                        const { subtitle: extractedSub, cleanCopy } = extractSubtitle(renderedRecord.copy);
                        const displaySubtitle = renderedRecord.metaDescription || extractedSub;
                        return (
                          <SubstackPreview
                            title={renderedRecord.title}
                            subtitle={displaySubtitle}
                            copy={cleanPlatformCopy(cleanCopy, renderedRecord.title || blogRecord.title)}
                            imageUrl={resolvedCoverImageUrl}
                          />
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlogPreview;
