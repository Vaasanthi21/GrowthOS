import dotenv from 'dotenv';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { v2 as cloudinary } from 'cloudinary';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Worker } from 'bullmq';
import jobRoutes from './routes/jobRoutes.js';
import { sendPasswordResetOtpEmail } from './services/emailService.js';
import './queues/mockWorker.js';
import { imageQueue } from './queues/imageQueue.js';
import { connection } from './queues/redisConnection.js';
import {
  buildImagePrompt,
  buildVideoPrompt,
  extractVisualOverrideDirectives,
} from './prompt-builders-optimized.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB_NAME || 'creative_studio_os';
const jwtSecret = process.env.JWT_SECRET || 'creative-studio-dev-secret';

const linkedinClientId = process.env.LINKEDIN_CLIENT_ID || '';
const linkedinClientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
const linkedinRedirectUri = process.env.LINKEDIN_REDIRECT_URI || '';
const azureImageApiKey = process.env.AZURE_OPENAI_IMAGE_API_KEY || '';
const azureImageEndpoint = process.env.AZURE_OPENAI_IMAGE_ENDPOINT || '';
const azureImageDeployment = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-2';
const azureImageApiVersion = process.env.AZURE_OPENAI_IMAGE_API_VERSION || '2024-02-01';
const azureVideoApiKey = process.env.AZURE_OPENAI_VIDEO_API_KEY || '';
const azureVideoEndpoint = process.env.AZURE_OPENAI_VIDEO_ENDPOINT || '';
const azureVideoModel = process.env.AZURE_OPENAI_VIDEO_MODEL || 'sora-2';
const azureVideoPollIntervalMs = Number(process.env.AZURE_OPENAI_VIDEO_POLL_INTERVAL_MS || 5000);
const azureVideoPollTimeoutMs = Number(process.env.AZURE_OPENAI_VIDEO_POLL_TIMEOUT_MS || 600000);
const azureVideoDownloadVariant = process.env.AZURE_OPENAI_VIDEO_DOWNLOAD_VARIANT || 'video';
const azureVideoDurationSeconds = String(process.env.AZURE_OPENAI_VIDEO_DURATION_SECONDS || '12').trim() || '12';
const textAiApiKey = process.env.AI_API_KEY || process.env.VITE_AI_API_KEY || '';
const textAiModel = process.env.AI_MODEL || process.env.VITE_AI_MODEL || 'gpt-4o-mini';
const textAiApiUrl = process.env.AI_API_URL || process.env.VITE_AI_API_URL || 'https://api.openai.com/v1/chat/completions';
const textAiProvider = process.env.AI_PROVIDER || process.env.VITE_AI_PROVIDER || '';
const textAiApiVersion = process.env.AI_API_VERSION || process.env.VITE_AI_API_VERSION || '2024-02-15-preview';

let arthGangaLogoUrl = '';

const uploadArthGangaLogo = async () => {
  try {
    const logoPath = '/home/ec2-user/Arth Ganga eng logo.png';
    const stats = await fs.stat(logoPath);
    if (stats.isFile()) {
      const result = await cloudinary.uploader.upload(logoPath, {
        folder: `${process.env.CLOUDINARY_FOLDER || 'creative-studio-os'}/logos`,
        public_id: 'arth-ganga-eng-logo',
        overwrite: true,
      });
      arthGangaLogoUrl = result.secure_url;
      console.log(`\n✓ Arth Ganga logo uploaded to Cloudinary: ${arthGangaLogoUrl}`);
    }
  } catch (error) {
    console.warn('Startup: Arth Ganga logo not found or upload failed, using provided URLs only.', error.message);
  }
};

const uploadsDir = path.join(__dirname, 'uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/api/jobs', jobRoutes);
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use('/uploads', express.static(uploadsDir));
// Mount sequences API
// app.use('/api/sequences', sequencesRouter);

const frontendDistDir = path.resolve(__dirname, '../dist');
app.use(express.static(frontendDistDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get(/^(?!\/api(?:\/|$)).*/, async (_req, res, next) => {
  try {
    const indexPath = path.join(frontendDistDir, 'index.html');
    await fs.access(indexPath);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(indexPath);
  } catch (error) {
    next();
  }
});

const createToken = (payload) => jwt.sign(payload, jwtSecret, { expiresIn: '7d' });
const nowIso = () => new Date().toISOString();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').trim();

const passwordResetOtpExpiryMinutes = Number(process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES || 10);

const createPasswordResetOtp = () => {
  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + passwordResetOtpExpiryMinutes * 60 * 1000).toISOString();

  return { otp, otpHash, expiresAt };
};

const hashPasswordResetOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp || '').trim()).digest('hex');

const isValidPhoneNumber = (value) => {
  const digitsOnly = String(value || '').replace(/\D/g, '');
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
};
const superAdminEmail = normalizeEmail(process.env.SUPERADMIN_EMAIL);
const defaultSignupCreditsEnv = Number(process.env.DEFAULT_SIGNUP_CREDITS || 25);
const defaultTextGenerationCostEnv = Number(process.env.DEFAULT_TEXT_GENERATION_COST || 1);
const defaultImageGenerationCostEnv = Number(process.env.DEFAULT_IMAGE_GENERATION_COST || 3);
const defaultVideoGenerationCostEnv = Number(process.env.DEFAULT_VIDEO_GENERATION_COST || 10);

const normalizeCreditValue = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed));
};

const normalizeGenerationCost = (value, fallback = 0) => normalizeCreditValue(value, normalizeCreditValue(fallback, 0));

const sanitizeCreditTransaction = (entry) => ({
  id: entry.id || entry._id?.toString?.() || entry._id,
  user_id: entry.user_id,
  amount: Number(entry.amount || 0),
  balance_after: Number(entry.balance_after || 0),
  type: entry.type || 'manual_adjustment',
  note: entry.note || '',
  created_at: entry.created_at,
  created_by: entry.created_by || null,
});

const sanitizeUser = (user) => ({
  id: user.id || user._id?.toString?.() || user._id,
  email: user.email,
  full_name: user.full_name || '',
  phone: user.phone || '',
  company: user.company || '',
  role: user.role || 'user',
  status: user.status || 'active',
  plan_id: user.plan_id || null,
  plan_name: user.plan_name || null,
  created_at: user.created_at,
  credits_balance: normalizeCreditValue(user.credits_balance),
  credits_total_allocated: normalizeCreditValue(user.credits_total_allocated),
  credits_total_purchased: normalizeCreditValue(user.credits_total_purchased),
  credits_total_used: normalizeCreditValue(user.credits_total_used),
  persona_limit: normalizeCreditValue(user.persona_limit, getPersonaLimitForPlan(user.plan_name || 'Free')),
});

const sanitizeCompanyPersona = (persona) => ({
  id: persona.id || persona._id?.toString?.() || persona._id,
  user_id: persona.user_id,
  company: persona.company || '',
  name: persona.name || '',
  tagline: persona.tagline || '',
  logo_url: persona.logo_url || '',
  logo_placement: persona.logo_placement || 'none',
  preserve_original_logo: persona.preserve_original_logo !== false,
  audience: persona.audience || '',
  voice: persona.voice || '',
  goals: persona.goals || '',
  notes: persona.notes || '',
  visual_style_instructions: persona.visual_style_instructions || '',
  brand_primary_color: persona.brand_primary_color || '',
  brand_secondary_color: persona.brand_secondary_color || '',
  brand_accent_color: persona.brand_accent_color || '',
  tuning_prompt: persona.tuning_prompt || '',
  learning_summary: persona.learning_summary || '',
  learning_count: Number(persona.learning_count || 0),
  analysis: persona.analysis || '',
  created_at: persona.created_at,
  updated_at: persona.updated_at,
});

const getPersonaLimitForPlan = (planName) => {
  switch (String(planName || 'free').trim().toLowerCase()) {
    case 'enterprise':
      return 20;
    case 'pro':
      return 5;
    default:
      return 1;
  }
};

const buildPersonaAnalysis = ({ company, tagline, audience, voice, goals, notes, visual_style_instructions, tuning_prompt, learning_summary }) => {
  return [
    `Brand identity: ${company || 'the company'}.`,
    tagline ? `Brand tagline: ${tagline}.` : null,
    audience ? `Primary audience: ${audience}.` : null,
    voice ? `Voice and tone: ${voice}.` : null,
    goals ? `Content goals: ${goals}.` : null,
    notes ? `Additional guidance: ${notes}.` : null,
    visual_style_instructions ? `Visual style instructions: ${visual_style_instructions}.` : null,
    tuning_prompt ? `Cross-platform brand style instructions: ${tuning_prompt}.` : null,
    learning_summary ? `Cross-platform learned writing preferences from prior generations: ${learning_summary}.` : null,
  ].filter(Boolean).join(' ');
};

const average = (values) => {
  const items = Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];
  if (items.length === 0) {
    return 0;
  }

  return items.reduce((total, value) => total + value, 0) / items.length;
};

const countMatches = (value, pattern) => {
  const matches = String(value || '').match(pattern);
  return matches ? matches.length : 0;
};

const summarizeGeneratedVariants = (variants) => {
  const items = Array.isArray(variants) ? variants : [];
  if (items.length === 0) {
    return '';
  }

  const contents = items
    .map((variant) => String(variant?.content || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (contents.length === 0) {
    return '';
  }

  const sentenceGroups = contents.map((content) => content.split(/(?<=[.!?])\s+/).filter(Boolean));
  const sentenceLengths = sentenceGroups.flat().map((sentence) => sentence.trim().split(/\s+/).filter(Boolean).length);
  const firstSentences = sentenceGroups.map((sentences) => sentences[0] || '');
  const paragraphCounts = contents.map((content) => content.split(/\n\s*\n/).filter(Boolean).length || 1);
  const lineCounts = contents.map((content) => content.split(/\n/).filter(Boolean).length || 1);
  const emojiTotal = contents.reduce((count, content) => count + countMatches(content, /[\u{1F300}-\u{1FAFF}]/gu), 0);
  const hashtagTotal = contents.reduce((count, content) => count + countMatches(content, /(^|\s)#[\p{L}\p{N}_]+/gu), 0);
  const exclamationTotal = contents.reduce((count, content) => count + countMatches(content, /!/g), 0);
  const questionHookCount = firstSentences.filter((sentence) => sentence.includes('?')).length;
  const ctaCount = contents.filter((content) => /\b(apply|join|learn more|discover|explore|contact|dm|message us|get started|sign up|book a demo|try it|read more|follow)\b/i.test(content)).length;
  const listStyleCount = contents.filter((content) => /[:\-]\s+[A-Z0-9]/.test(content) || /\n\s*[-*•]/.test(content)).length;
  const shortSentenceRatio = sentenceLengths.length ? sentenceLengths.filter((length) => length <= 10).length / sentenceLengths.length : 0;
  const longSentenceRatio = sentenceLengths.length ? sentenceLengths.filter((length) => length >= 20).length / sentenceLengths.length : 0;
  const averageWordCount = Math.round(items.reduce((total, variant) => total + Number(variant?.word_count || 0), 0) / items.length);
  const averageSentenceLength = Math.round(average(sentenceLengths));
  const averageParagraphCount = average(paragraphCounts);
  const averageLineCount = average(lineCounts);

  const styleSignals = [
    averageWordCount ? `Cross-platform preferred length: about ${averageWordCount} words before platform-specific adaptation.` : null,
    averageSentenceLength && averageSentenceLength <= 11 ? 'Sentence rhythm: prefers crisp, compact sentences.' : null,
    averageSentenceLength >= 18 ? 'Sentence rhythm: allows longer, more developed sentences when needed.' : null,
    shortSentenceRatio >= 0.6 ? 'Readability preference: keeps copy punchy and easy to scan.' : null,
    longSentenceRatio >= 0.35 ? 'Readability preference: mixes in fuller explanatory sentences for depth.' : null,
    questionHookCount >= Math.ceil(items.length / 2) ? 'Opening preference: often starts with a curiosity-driven or question-based hook.' : null,
    ctaCount >= Math.ceil(items.length / 2) ? 'Closing preference: usually ends with a direct call to action.' : null,
    listStyleCount >= Math.ceil(items.length / 2) ? 'Structure preference: often breaks ideas into list-like or segmented sections.' : null,
    averageParagraphCount >= 2 ? 'Layout preference: favors multi-paragraph flow over one dense block.' : null,
    averageLineCount >= 4 ? 'Formatting preference: uses visible line breaks to improve readability.' : null,
    emojiTotal > 0 ? 'Tone marker: may use light emoji emphasis when it suits the platform and audience.' : null,
    hashtagTotal >= items.length ? 'Packaging preference: often leaves room for hashtags when the platform supports them.' : null,
    exclamationTotal >= items.length ? 'Punctuation style: uses energetic emphasis sparingly through exclamation marks.' : null,
    'Memory rule: preserve reusable brand voice and writing behavior, but avoid storing temporary campaign facts, names, offers, locations, or topic-specific details.',
  ].filter(Boolean);

  return styleSignals.join(' ');
};

const mergeLearningSummary = (existingSummary, nextSummary) => {
  const current = String(existingSummary || '').trim();
  const incoming = String(nextSummary || '').trim();

  if (!incoming) {
    return current;
  }

  if (!current) {
    return incoming;
  }

  return `${incoming} ${current}`.slice(0, 1600).trim();
};

const trimHistoryVariantForList = (variant) => {
  if (!variant || typeof variant !== 'object') {
    return variant;
  }

  return {
    ...variant,
    content: typeof variant.content === 'string' ? variant.content.slice(0, 1200) : variant.content,
    image_base64: null,
  };
};

const trimHistoryMessageForList = (message) => {
  if (!message || typeof message !== 'object') {
    return message;
  }

  return {
    ...message,
    content: typeof message.content === 'string' ? message.content.slice(0, 600) : message.content,
    image_base64: null,
  };
};

const serializeHistoryListRow = (row) => ({
  ...row,
  id: row.id || row._id?.toString?.(),
  rag_context: typeof row.rag_context === 'string' ? row.rag_context.slice(0, 4000) : '',
  original_prompt: typeof row.original_prompt === 'string' ? row.original_prompt.slice(0, 2000) : '',
  variants: Array.isArray(row.variants) ? row.variants.map(trimHistoryVariantForList) : [],
  refinement_messages: Array.isArray(row.refinement_messages)
    ? row.refinement_messages.slice(-8).map(trimHistoryMessageForList)
    : [],
});

const buildHistoryConversationKey = (entry = {}) => {
  const explicitKey = String(entry.conversation_key || '').trim();
  if (explicitKey) {
    return explicitKey;
  }

  const rootId = String(entry.session_root_history_id || '').trim();
  if (rootId) {
    return rootId;
  }

  const topic = String(entry.topic || '').trim().toLowerCase();
  const persona = String(entry.persona || entry.persona_label || '').trim().toLowerCase();
  const contentType = String(entry.content_type || '').trim().toLowerCase();

  if (!topic && !persona && !contentType) {
    return '';
  }

  return [topic, persona, contentType].filter(Boolean).join('::');
};

const normalizeHistoryEntry = (entry = {}, userId) => {
  const createdDate = entry.created_date || nowIso();
  const updatedDate = nowIso();
  const conversationKey = buildHistoryConversationKey(entry);
  const sessionRootHistoryId = String(entry.session_root_history_id || '').trim();
  const refinementMessages = Array.isArray(entry.refinement_messages) ? entry.refinement_messages : [];
  const variants = Array.isArray(entry.variants) ? entry.variants : [];

  return {
    ...entry,
    user_id: userId,
    created_date: createdDate,
    updated_date: updatedDate,
    conversation_key: conversationKey || null,
    session_root_history_id: sessionRootHistoryId || null,
    refinement_messages: refinementMessages,
    refinement_message_count: refinementMessages.length,
    variants,
    variant_count: variants.length,
    latest_variant: variants[0] || null,
  };
};

const stripPersonaPaletteDirectives = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return text
    .replace(/\b(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)(?:\s*[-/]?\s*(?:led|based|dominant|primary|accent))?\s+palette\b/gi, '')
    .replace(/\b(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)(?:\s+theme(?:d)?)\b/gi, '')
    .replace(/\bpalette\s*:\s*[^.;]+/gi, '')
    .replace(/\bcolors?\s*:\s*[^.;]+/gi, '')
    .replace(/\b(?:use|prefer|keep|maintain|follow)\s+(?:a\s+)?(?:red|orange|blue|green|yellow|purple|pink|teal|cyan|magenta|gold|black|white|gray|grey|brown|beige)[^.;]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
};

const normalizeAzureVideoEndpoint = (value) => String(value || '').replace(/\/+$/, '');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const extractAzureVideoUrl = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.video_url
    || payload.url
    || payload.output?.video_url
    || payload.output?.url
    || payload.output?.download_url
    || payload.output?.downloadUrl
    || payload.result?.video_url
    || payload.result?.url
    || payload.result?.download_url
    || payload.result?.downloadUrl
    || payload.data?.video_url
    || payload.data?.url
    || payload.data?.download_url
    || payload.data?.downloadUrl
    || payload.response?.video_url
    || payload.response?.url
    || payload.artifact?.url
    || payload.source?.url
    || payload.file?.url
    || payload.content?.url
    || (Array.isArray(payload.generations) ? payload.generations.find((item) => item?.url || item?.video_url || item?.download_url)?.url : null)
    || (Array.isArray(payload.generations) ? payload.generations.find((item) => item?.url || item?.video_url || item?.download_url)?.video_url : null)
    || (Array.isArray(payload.generations) ? payload.generations.find((item) => item?.url || item?.video_url || item?.download_url)?.download_url : null)
    || (Array.isArray(payload.output) ? payload.output.find((item) => item?.url || item?.video_url || item?.download_url)?.url : null)
    || (Array.isArray(payload.output) ? payload.output.find((item) => item?.url || item?.video_url || item?.download_url)?.video_url : null)
    || (Array.isArray(payload.output) ? payload.output.find((item) => item?.url || item?.video_url || item?.download_url)?.download_url : null)
    || (Array.isArray(payload.data) ? payload.data.find((item) => item?.url || item?.video_url || item?.download_url)?.url : null)
    || (Array.isArray(payload.data) ? payload.data.find((item) => item?.url || item?.video_url || item?.download_url)?.video_url : null)
    || (Array.isArray(payload.data) ? payload.data.find((item) => item?.url || item?.video_url || item?.download_url)?.download_url : null)
    || null;
};

const extractAzureVideoId = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.id || payload.video_id || payload.operation_id || payload.job_id || payload.data?.id || null;
};

const normalizeAzureVideoStatus = (payload) => {
  const rawStatus = String(
    payload?.status
      || payload?.state
      || payload?.job_status
      || payload?.data?.status
      || payload?.data?.state
      || ''
  ).trim().toLowerCase();

  if (!rawStatus) {
    return extractAzureVideoUrl(payload) ? 'completed' : 'submitted';
  }

  if (['succeeded', 'success', 'completed', 'complete', 'done'].includes(rawStatus)) {
    return 'completed';
  }

  if (['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(rawStatus)) {
    return 'failed';
  }

  if (['running', 'processing', 'queued', 'pending', 'submitted', 'in_progress', 'notstarted'].includes(rawStatus)) {
    return 'processing';
  }

  return rawStatus;
};

const buildAzureVideoStatusUrl = (endpoint, payload) => {
  const operationLocation = payload?.operation_location || payload?.operationLocation || payload?.headers?.operation_location || payload?.headers?.operationLocation;
  if (operationLocation) {
    return operationLocation;
  }

  const videoId = extractAzureVideoId(payload);
  if (!videoId) {
    return null;
  }

  return `${normalizeAzureVideoEndpoint(endpoint)}/${encodeURIComponent(videoId)}`;
};

const fetchAzureVideoStatus = async ({ statusUrl }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureVideoApiKey,
      },
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `Azure video status error: ${response.status} ${response.statusText}`);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Azure video status polling timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const downloadAzureVideoContent = async ({ videoId, variant = azureVideoDownloadVariant }) => {
  const downloadUrl = `${normalizeAzureVideoEndpoint(azureVideoEndpoint)}/${encodeURIComponent(videoId)}/content?variant=${encodeURIComponent(variant)}`;
  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      'api-key': azureVideoApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Azure video download error: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const saveAzureVideoAsset = async ({
  videoId,
  variant = azureVideoDownloadVariant,
  logoUrl = '',
  logoPlacement = 'none',
}) => {
  const buffer = await downloadAzureVideoContent({ videoId, variant });

  const uploadResult = {
  secure_url: await uploadVideoBufferToS3({
    buffer,
    mimeType: 'video/mp4',
    folder: 'videos',
    fileName: `${videoId}-${variant}.mp4`,
  }),
};

  if (logoUrl && logoPlacement && logoPlacement !== 'none') {
  const logoPublicId = getCloudinaryPublicIdFromUrl(logoUrl);
  const gravity = cloudinaryGravityMap[logoPlacement] || 'south_east';

  if (logoPublicId) {
  let videoLogoPublicId = logoPublicId;

  if (!logoUrl.includes(`/${process.env.CLOUDINARY_CLOUD_NAME}/`)) {
    try {
      console.log('[VIDEO OVERLAY] Logo is external or from another account, uploading to our account:', logoUrl);

      const logoUpload = await cloudinary.uploader.upload(logoUrl, {
        folder: `${process.env.CLOUDINARY_FOLDER || 'creative-studio-os'}/logos`,
        resource_type: 'image',
      });

      videoLogoPublicId = logoUpload.public_id.replace(/\//g, ':');

      console.log('[VIDEO OVERLAY] Logo re-hosted successfully:', logoUpload.secure_url);
    } catch (err) {
      console.warn('[VIDEO OVERLAY] Failed to re-host external logo:', err.message);
      return uploadResult.secure_url;
    }
  }

  return cloudinary.url(uploadResult.public_id, {
    resource_type: 'video',
    secure: true,
    transformation: [
      {
        overlay: videoLogoPublicId,
        gravity,
        width: 180,
        opacity: 100,
        x: 24,
        y: 24,
      },
    ],
  });
}

  console.warn('[VIDEO OVERLAY] Invalid Cloudinary logo URL, skipping overlay:', logoUrl);
}

return uploadResult.secure_url;
};

const normalizeAzureVideoResult = async ({
  payload,
  statusUrl = null,
  logoUrl = '',
  logoPlacement = 'none',
}) => {
  const videoUrl = extractAzureVideoUrl(payload);
  const normalizedStatus = normalizeAzureVideoStatus(payload);
  const videoId = extractAzureVideoId(payload);
  let resolvedVideoUrl = videoUrl;

  if (normalizedStatus === 'completed' && videoId) {
    // Only upload to Cloudinary if we don't already have a valid Azure URL, 
    // OR if we know Azure URLs need auth. Usually, if videoUrl exists and is public, we can use it.
    // Wait, the Azure output requires auth to view the video, so we must always upload to Cloudinary.
    try {
      console.log(`[VIDEO JOB DEBUG] Attempting Cloudinary upload for ${videoId}, current URL is: ${videoUrl}`);
      resolvedVideoUrl = await saveAzureVideoAsset({
        videoId,
        logoUrl,
        logoPlacement,
      });
      console.log(`[VIDEO JOB DEBUG] Cloudinary upload successful. URL: ${resolvedVideoUrl}`);
    } catch (error) {
      console.error('[VIDEO JOB DEBUG] Azure video Cloudinary upload failed:', error.message || error);
    }
  }

  return {
    video_url: resolvedVideoUrl,
    video_id: videoId,
    status: normalizedStatus === 'completed' && !resolvedVideoUrl ? 'processing' : normalizedStatus,
    status_url: statusUrl,
    provider_response: payload,
  };
};

const generateVideoWithAzure = async ({
  prompt,
  durationSeconds = azureVideoDurationSeconds,
  logoUrl = '',
  logoPlacement = 'none',
  onStatus,
}) => {
  if (!azureVideoApiKey || !azureVideoEndpoint) {
    console.log('[MOCK VIDEO GENERATION] Azure credentials not configured, returning simulated video generation steps.');
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    
    if (typeof onStatus === 'function') {
      await delay(1000);
      onStatus({ status: 'processing', phase: 'Analyzing prompt details', progress: 25 });
      await delay(1500);
      onStatus({ status: 'processing', phase: 'Generating keyframes', progress: 55 });
      await delay(1500);
      onStatus({ status: 'processing', phase: 'Rendering final video frames', progress: 85 });
      await delay(1000);
    }
    
    return {
      status: 'completed',
      video_id: `mock-video-${Date.now()}`,
      video_url: 'https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-31952-large.mp4',
    };
  }

  const normalizedDurationSeconds = ['4', '8', '12'].includes(String(durationSeconds || '').trim())
    ? String(durationSeconds).trim()
    : '12';

  const requestVideo = async (body) => {
    const response = await fetch(normalizeAzureVideoEndpoint(azureVideoEndpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureVideoApiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
  };

  let requestBody = {
    model: azureVideoModel,
    prompt,
    duration: normalizedDurationSeconds,
  };

  let { response, data } = await requestVideo(requestBody);

  if (!response.ok && /duration/i.test(String(data?.error?.message || data?.message || ''))) {
    requestBody = {
      model: azureVideoModel,
      prompt,
      seconds: normalizedDurationSeconds,
    };
    ({ response, data } = await requestVideo(requestBody));
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Azure video API error: ${response.status} ${response.statusText}`);
  }

  const initialStatusUrl = response.headers.get('operation-location') || response.headers.get('Operation-Location') || buildAzureVideoStatusUrl(azureVideoEndpoint, data);
  let normalized = await normalizeAzureVideoResult({
    payload: data,
    statusUrl: initialStatusUrl,
    logoUrl,
    logoPlacement,
  });

  onStatus?.({
    status: normalized.status,
    phase: normalized.video_url
      ? 'Video generated'
      : normalized.status === 'failed'
        ? 'Azure video generation failed'
        : 'Azure accepted the video job',
    progress: normalized.video_url ? 100 : normalized.status === 'failed' ? 95 : 25,
    videoId: normalized.video_id,
  });

  if (normalized.video_url || normalized.status === 'failed' || !normalized.status_url) {
    return normalized;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < azureVideoPollTimeoutMs) {
    await sleep(azureVideoPollIntervalMs);
    const statusPayload = await fetchAzureVideoStatus({ statusUrl: normalized.status_url });
    normalized = await normalizeAzureVideoResult({
      payload: statusPayload,
      statusUrl: normalized.status_url,
      logoUrl,
      logoPlacement,
    });

    onStatus?.({
      status: normalized.video_url ? 'completed' : normalized.status,
      phase: normalized.video_url
        ? 'Video generated'
        : normalized.status === 'failed'
          ? 'Azure video generation failed'
          : 'Azure is rendering the video',
      progress: normalized.video_url ? 100 : normalized.status === 'failed' ? 95 : 60,
      videoId: normalized.video_id,
    });

    if (normalized.video_url || normalized.status === 'completed' || normalized.status === 'failed') {
      return normalized;
    }
  }

  return {
    ...normalized,
    status: normalized.video_url ? 'completed' : 'failed',
    error: normalized.video_url ? null : 'Video generation timed out while waiting for Azure completion',
  };
};

const getAzureVideoStatusById = async ({ videoId }) => {
  if (!azureVideoApiKey || !azureVideoEndpoint) {
    throw new Error('Azure video generation is not configured. Set AZURE_OPENAI_VIDEO_API_KEY and AZURE_OPENAI_VIDEO_ENDPOINT in the server environment.');
  }

  if (!String(videoId || '').trim()) {
    throw new Error('Video id is required');
  }

  const statusUrl = `${normalizeAzureVideoEndpoint(azureVideoEndpoint)}/${encodeURIComponent(String(videoId).trim())}`;
  const payload = await fetchAzureVideoStatus({ statusUrl });
  return await normalizeAzureVideoResult({ payload, statusUrl });
};

const ensureUploadsDir = async () => {
  await fs.mkdir(uploadsDir, { recursive: true });
};

let ocrWorkerPromise = null;
const ocrResultCache = new Map();
const activeOcrJobs = new Map();
const OCR_CACHE_LIMIT = 100;
const OCR_LANGUAGE_ALLOWLIST = new Set(['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'nld']);
const OCR_AUTO_LANGUAGE = 'eng';
const parsePdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy?.();
  return result;
};

const setOcrCache = (key, value) => {
  if (!key) {
    return;
  }

  if (ocrResultCache.has(key)) {
    ocrResultCache.delete(key);
  }

  ocrResultCache.set(key, value);

  if (ocrResultCache.size > OCR_CACHE_LIMIT) {
    const oldestKey = ocrResultCache.keys().next().value;
    if (oldestKey) {
      ocrResultCache.delete(oldestKey);
    }
  }
};

const getOcrCacheKey = ({ buffer, languages }) => `${languages}::${crypto.createHash('sha1').update(buffer).digest('hex')}`;

const normalizeOcrLanguages = (value) => {
  if (!String(value || '').trim()) {
    return OCR_AUTO_LANGUAGE;
  }

  const requested = String(value || 'eng')
    .split(/[+,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => OCR_LANGUAGE_ALLOWLIST.has(item));

  return requested.length > 0 ? Array.from(new Set(requested)).join('+') : OCR_AUTO_LANGUAGE;
};

const getOcrWorker = async () => {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      return new Map();
    })();
  }

  return ocrWorkerPromise;
};

const getOcrWorkerForLanguage = async (languages) => {
  const workers = await getOcrWorker();
  if (!workers.has(languages)) {
    workers.set(languages, (async () => {
      const worker = await createWorker(languages);
      return worker;
    })());
  }

  return workers.get(languages);
};

const parseDataUrlImage = (value) => {
  const match = String(value || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const saveLogoUpload = async (logoFile) => {
  const parsed = parseDataUrlImage(logoFile);

  if (!parsed) {
    throw new Error('Invalid logo file payload');
  }

  // Fallback to local storage if AWS S3 is not configured
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME || !process.env.AWS_REGION) {
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      let ext = '.png';
      if (parsed.mimeType === 'image/jpeg' || parsed.mimeType === 'image/jpg') {
        ext = '.jpg';
      } else if (parsed.mimeType === 'image/gif') {
        ext = '.gif';
      } else if (parsed.mimeType === 'image/svg+xml') {
        ext = '.svg';
      } else if (parsed.mimeType === 'image/webp') {
        ext = '.webp';
      }

      const filename = `logo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, parsed.buffer);
      console.log(`[LOGO UPLOAD] Saved logo locally: /uploads/${filename}`);
      return `/uploads/${filename}`;
    } catch (err) {
      console.error('[LOGO UPLOAD] Local save failed:', err);
      throw new Error(`Failed to save logo locally: ${err.message}`);
    }
  }

  const key = `logos/${Date.now()}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: parsed.buffer,
      ContentType: parsed.mimeType,
    })
  );

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const uploadImageBufferToS3 = async ({ buffer, mimeType = 'image/png', folder = 'images' }) => {
  const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const uploadVideoBufferToS3 = async ({ buffer, mimeType = 'video/mp4', folder = 'videos', fileName = '' }) => {
  const safeName = fileName || `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.mp4`;
  const key = `${folder}/${safeName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const parseDataUrlFile = (value) => {
  const match = String(value || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const extractTextFromBuffer = async ({ buffer, mimeType, fileName, ocrLanguages = OCR_AUTO_LANGUAGE }) => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const normalizedFileName = String(fileName || '').toLowerCase();
  const isTextLike = normalizedMimeType.startsWith('text/')
    || normalizedMimeType.includes('json')
    || normalizedMimeType.includes('xml')
    || normalizedFileName.endsWith('.md')
    || normalizedFileName.endsWith('.txt')
    || normalizedFileName.endsWith('.csv')
    || normalizedFileName.endsWith('.json');

  const isPdf = normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf');
  const isDocx = normalizedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || normalizedFileName.endsWith('.docx');
  const isImage = normalizedMimeType.startsWith('image/')
    || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(normalizedFileName);

  if (isTextLike) {
    return buffer.toString('utf8').replace(/\u0000/g, '').trim();
  }

  if (isPdf) {
    const parsed = await parsePdf(buffer);
    return String(parsed?.text || '').replace(/\u0000/g, '').trim();
  }

  if (isDocx) {
    const parsed = await mammoth.extractRawText({ buffer });
    return String(parsed?.value || '').replace(/\u0000/g, '').trim();
  }

  if (isImage) {
    const cacheKey = getOcrCacheKey({ buffer, languages: ocrLanguages });
    if (ocrResultCache.has(cacheKey)) {
      return ocrResultCache.get(cacheKey);
    }

    const worker = await getOcrWorkerForLanguage(ocrLanguages);
    const result = await worker.recognize(buffer);
    const text = String(result?.data?.text || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
    setOcrCache(cacheKey, text);
    return text;
  }

  throw new Error('Unsupported file type. Upload txt, md, csv, json, pdf, docx, or image files.');
};

const extractTextFromUrl = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CreativeStudioOS/1.0',
      Accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '',
    content: bodyText,
  };
};

const normalizeKnowledgeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const tokenizeKnowledge = (value) => {
  const matches = normalizeKnowledgeText(value).toLowerCase().match(/[a-z0-9]{2,}/g);
  return matches ? Array.from(new Set(matches)) : [];
};

const buildKnowledgeChunks = (content) => {
  const normalized = String(content || '').replace(/\r/g, '').trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const sourceUnits = paragraphs.length > 0 ? paragraphs : [normalized];
  const chunks = [];

  sourceUnits.forEach((unit) => {
    const sentences = unit.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length <= 3) {
      chunks.push(unit);
      return;
    }

    for (let index = 0; index < sentences.length; index += 3) {
      chunks.push(sentences.slice(index, index + 3).join(' ').trim());
    }
  });

  return chunks
    .map((chunk, index) => ({
      id: `${index + 1}`,
      text: chunk,
      tokens: tokenizeKnowledge(chunk),
    }))
    .filter((chunk) => chunk.text.length > 0);
};

const scoreKnowledgeChunk = (chunk, queryTokens) => {
  if (!chunk || !Array.isArray(chunk.tokens) || queryTokens.length === 0) {
    return 0;
  }

  const tokenSet = new Set(chunk.tokens);
  return queryTokens.reduce((score, token) => score + (tokenSet.has(token) ? 1 : 0), 0);
};

const buildRagContext = ({ knowledgeItems, query, limit = 4 }) => {
  const queryTokens = tokenizeKnowledge(query);
  const scored = [];

  (Array.isArray(knowledgeItems) ? knowledgeItems : []).forEach((item) => {
    (item.chunks || []).forEach((chunk) => {
      const score = scoreKnowledgeChunk(chunk, queryTokens);
      if (score > 0) {
        scored.push({
          sourceId: item.id || item._id?.toString?.() || '',
          sourceTitle: item.title || 'Knowledge Source',
          sourceType: item.source_type || 'text',
          text: chunk.text,
          score,
        });
      }
    });
  });

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item, index) => `[Source ${index + 1}: ${item.sourceTitle} | ${item.sourceType}] ${item.text}`)
    .join('\n');
};

const selectAzureImageSize = ({ platform, contentType, aspectRatio, width, height }) => {
  const normalizedAspectRatio = String(aspectRatio || '').trim();

  if (width && height) {
    return `${width}x${height}`;
  }

  const aspectRatioSizeMap = {
    '1:1': '1024x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
  };

  if (aspectRatioSizeMap[normalizedAspectRatio]) {
    return aspectRatioSizeMap[normalizedAspectRatio];
  }

  const normalizedPlatform = String(platform?.label || '').trim().toLowerCase();
  const normalizedContentType = String(contentType || '').trim().toLowerCase();
  const isImageOnly = normalizedContentType === 'image' || normalizedContentType === 'image-only';
  const isTextAndImage = normalizedContentType.includes('text') && normalizedContentType.includes('image');

  const platformSizePresets = {
    linkedin: isImageOnly ? '1024x1792' : '1024x1024',
    instagram: '1024x1792',
    facebook: isImageOnly ? '1792x1024' : '1024x1024',
    youtube: '1792x1024',
    github: isTextAndImage ? '1024x1024' : '1792x1024',
    'x / twitter': isTextAndImage ? '1024x1024' : '1792x1024',
    threads: '1024x1792',
  };

  return platformSizePresets[normalizedPlatform] || '1024x1024';
};

const imageGenerationJobs = new Map();
const imageGenerationDurations = [];
const IMAGE_JOB_HISTORY_LIMIT = 25;
const videoGenerationJobs = new Map();
const videoGenerationDurations = [];

const createImageJobId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getAverageImageGenerationDurationMs = () => {
  if (imageGenerationDurations.length === 0) {
    return 120000;
  }

  return Math.round(imageGenerationDurations.reduce((total, value) => total + value, 0) / imageGenerationDurations.length);
};

const pushImageGenerationDuration = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  imageGenerationDurations.push(durationMs);
  if (imageGenerationDurations.length > IMAGE_JOB_HISTORY_LIMIT) {
    imageGenerationDurations.shift();
  }
};

const getAverageVideoGenerationDurationMs = () => {
  if (videoGenerationDurations.length === 0) {
    return Math.max(azureVideoPollTimeoutMs, 180000);
  }

  return Math.round(videoGenerationDurations.reduce((total, value) => total + value, 0) / videoGenerationDurations.length);
};

const pushVideoGenerationDuration = (durationMs) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  videoGenerationDurations.push(durationMs);
  if (videoGenerationDurations.length > IMAGE_JOB_HISTORY_LIMIT) {
    videoGenerationDurations.shift();
  }
};

const getImageJobStatusPayload = (job) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - job.startedAt);
  const estimatedTotalMs = job.completedAt
    ? Math.max(job.completedAt - job.startedAt, 1000)
    : Math.max(job.estimatedTotalMs || getAverageImageGenerationDurationMs(), 1000);
  const derivedProgress = Math.min(95, Math.max(job.progress || 0, Math.round((elapsedMs / estimatedTotalMs) * 100)));
  const derivedPhase = job.status === 'processing' && elapsedMs >= 4000
    ? 'Waiting for Azure image model response'
    : job.phase;
  const progress = job.status === 'completed'
    ? 100
    : job.status === 'failed'
      ? Math.min(job.progress || 0, 99)
      : derivedProgress;
  const remainingMs = job.status === 'completed'
    ? 0
    : Math.max(0, estimatedTotalMs - elapsedMs);

  return {
    id: job.id,
    status: job.status,
    phase: derivedPhase,
    progress,
    elapsedMs,
    estimatedTotalMs,
    estimatedRemainingMs: remainingMs,
    startedAt: new Date(job.startedAt).toISOString(),
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    error: job.error || null,
    result: job.status === 'completed' ? job.result : null,
  };
};

const updateImageJob = (jobId, updates) => {
  const existing = imageGenerationJobs.get(jobId);
  if (!existing) {
    return null;
  }

  const nextJob = {
    ...existing,
    ...updates,
  };
  imageGenerationJobs.set(jobId, nextJob);
  return nextJob;
};

const getVideoJobStatusPayload = (job) => {
  if (!job) {
    return null;
  }

  const now = Date.now();
  const elapsedMs = Math.max(0, now - job.startedAt);
  const estimatedTotalMs = job.completedAt
    ? Math.max(job.completedAt - job.startedAt, 1000)
    : Math.max(job.estimatedTotalMs || getAverageVideoGenerationDurationMs(), 1000);
  const progress = job.status === 'completed'
    ? 100
    : job.status === 'failed'
      ? Math.min(job.progress || 0, 99)
      : Math.min(95, Math.max(job.progress || 0, Math.round((elapsedMs / estimatedTotalMs) * 100)));
  const remainingMs = job.status === 'completed'
    ? 0
    : Math.max(0, estimatedTotalMs - elapsedMs);

  return {
    video_id: job.id, // Always return the internal tracking job ID
    azure_video_id: job.videoId !== job.id ? job.videoId : null,
    status: job.status,
    prompt: job.prompt,
    phase: job.phase,
    progress,
    elapsedMs,
    estimatedTotalMs,
    estimatedRemainingMs: remainingMs,
    startedAt: new Date(job.startedAt).toISOString(),
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    error: job.error || null,
    video_url: job.result?.video_url || null,
  };
};

const updateVideoJob = (jobId, updates) => {
  const existing = videoGenerationJobs.get(jobId);
  if (!existing) {
    return null;
  }

  const nextJob = {
    ...existing,
    ...updates,
  };
  videoGenerationJobs.set(jobId, nextJob);
  return nextJob;
};

const startVideoGenerationJob = ({ prompt, logoUrl = '', logoPlacement = 'none', onCompleted, onFailed }) => {
  const jobId = createImageJobId();
  const startedAt = Date.now();
  const estimatedTotalMs = getAverageVideoGenerationDurationMs();

  videoGenerationJobs.set(jobId, {
    id: jobId,
    videoId: jobId,
    prompt,
    status: 'queued',
    phase: 'Queued for video generation',
    progress: 5,
    startedAt,
    estimatedTotalMs,
    logoUrl,
    logoPlacement,
    completedAt: null,
    error: null,
    result: null,
  });

  console.log(`[VIDEO JOB] queued ${jobId} prompt=${String(prompt).slice(0,80)}`);

  void (async () => {
    try {
      updateVideoJob(jobId, {
        status: 'processing',
        phase: 'Submitting request to Azure video model',
        progress: 15,
      });

        console.log(`[VIDEO JOB] ${jobId} processing, submitting to Azure`);

      const video = await generateVideoWithAzure({
        prompt,
        logoUrl,
        logoPlacement,
        onStatus: ({ status, phase, progress, videoId }) => {
          updateVideoJob(jobId, {
            status,
            phase,
            progress,
            videoId: videoId || jobId,
          });
          console.log(`[VIDEO JOB] ${jobId} status=${status} phase=${phase} progress=${progress} videoId=${videoId || jobId}`);
        },
      });

      const completedAt = Date.now();
      pushVideoGenerationDuration(completedAt - startedAt);
      const isSuccess = video.status === 'completed' && video.video_url;

      updateVideoJob(jobId, {
        status: isSuccess ? 'completed' : 'failed',
        phase: isSuccess ? 'Video generated' : 'Video generation failed',
        progress: isSuccess ? 100 : 99,
        completedAt,
        videoId: video.video_id || jobId,
        result: video,
        error: isSuccess ? null : (video.error || 'Video generation timed out or failed on Azure'),
      });
      if (isSuccess && store) {
        try {
          await store.saveVideoGeneration({
            job_id: jobId,
            prompt,
            video_url: video?.video_url || null,
            video_id: video?.video_id || jobId,
            status: 'completed',
            created_at: nowIso(),
            completed_at: nowIso(),
          });
        } catch (dbError) {
          console.error('[VIDEO METADATA SAVE FAILED]', dbError);
        }
      }
      console.log(`[VIDEO JOB] ${jobId} ${isSuccess ? 'completed' : 'failed'} videoId=${video.video_id || jobId} url=${String(video.video_url).slice(0,120)}`);
      if (isSuccess && typeof onCompleted === 'function') {
        await onCompleted({ jobId, result: video });
      } else if (!isSuccess && typeof onFailed === 'function') {
        await onFailed({ jobId, error: new Error(video.error || 'Video generation timed out or failed on Azure') });
      }
    } catch (error) {
      updateVideoJob(jobId, {
        status: 'failed',
        phase: 'Video generation failed',
        completedAt: Date.now(),
        error: error.message || 'Video generation failed',
      });
      if (typeof onFailed === 'function') {
        await onFailed({ jobId, error });
      }
    }
  })();

  return jobId;
};

const runImageGenerationJobDirectly = async ({ jobId, prompt, size, logoUrl = '', logoPlacement = 'none', onCompleted, onFailed }) => {
  const startedAt = Date.now();
  updateImageJob(jobId, {
    status: 'processing',
    phase: 'Submitting request to Azure image model',
    progress: 15,
  });

  const phaseTimer = setTimeout(() => {
    updateImageJob(jobId, {
      status: 'processing',
      phase: 'Waiting for Azure image model response',
      progress: 35,
    });
  }, 1500);

  try {
    const image = await generateImageWithAzure({
      prompt,
      size,
      logoUrl,
      logoPlacement,
    });

    clearTimeout(phaseTimer);

    const completedAt = Date.now();
    pushImageGenerationDuration(completedAt - startedAt);

    updateImageJob(jobId, {
      status: 'completed',
      phase: 'Image generated',
      progress: 100,
      completedAt,
      result: image,
    });

    if (store) {
      try {
        await store.saveImageGeneration({
          job_id: jobId,
          prompt,
          image_url: image?.image_url || null,
          revised_prompt: image?.revised_prompt || null,
          status: 'completed',
          created_at: nowIso(),
          completed_at: nowIso(),
        });
      } catch (dbError) {
        console.error('[IMAGE METADATA SAVE FAILED]', dbError);
      }
    }

    if (typeof onCompleted === 'function') {
      void onCompleted({ jobId, result: image });
    }
  } catch (error) {
    clearTimeout(phaseTimer);

    updateImageJob(jobId, {
      status: 'failed',
      phase: 'Image generation failed',
      completedAt: Date.now(),
      error: error.message || 'Image generation failed',
    });

    if (typeof onFailed === 'function') {
      void onFailed({ jobId, error });
    }
  }
};

const startImageGenerationJob = ({ prompt, size, logoUrl = '', logoPlacement = 'none', onCompleted, onFailed }) => {
  const jobId = createImageJobId();
  const startedAt = Date.now();
  const estimatedTotalMs = getAverageImageGenerationDurationMs();

  imageGenerationJobs.set(jobId, {
    id: jobId,
    status: 'queued',
    phase: 'Queued for image generation',
    progress: 5,
    prompt,
    size,
    startedAt,
    estimatedTotalMs,
    logoUrl,
    logoPlacement,
    completedAt: null,
    error: null,
    result: null,
  });

  const isRedisReady = connection && connection.status === 'ready';

  if (!isRedisReady) {
    console.log(`[IMAGE JOB] Redis connection not ready (status: ${connection?.status || 'none'}), running image generation directly in-memory for ${jobId}`);
    void runImageGenerationJobDirectly({
      jobId,
      prompt,
      size,
      logoUrl,
      logoPlacement,
      onCompleted,
      onFailed
    });
  } else {
    console.log(`[IMAGE JOB] Queueing image generation job ${jobId} via BullMQ`);
    void imageQueue.add('generate-image', {
      jobId,
      prompt,
      size,
      logoUrl,
      logoPlacement,
    }).catch((error) => {
      console.warn(`[IMAGE JOB] Failed to add to imageQueue, running directly in-memory:`, error.message);
      void runImageGenerationJobDirectly({
        jobId,
        prompt,
        size,
        logoUrl,
        logoPlacement,
        onCompleted,
        onFailed
      });
    });
  }

  return jobId;
};

const getCloudinaryPublicIdFromUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    const parts = parsedUrl.pathname.split('/upload/');
    if (parts.length < 2) return '';

    let publicPath = parts[1];

    publicPath = publicPath.replace(/^v\d+\//, '');
    publicPath = publicPath.replace(/\.[^/.]+$/, '');

    return publicPath.replace(/\//g, ':');
  } catch {
    return '';
  }
};

const fetchImageBufferFromUrl = async (url) => {
  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
};

const generateImageWithAzure = async ({
  prompt,
  size = '1024x1024',
  logoUrl = '',
  logoPlacement = 'none',
}) => {
  if (!azureImageApiKey || !azureImageEndpoint) {
    console.log('[MOCK IMAGE GENERATION] Azure credentials not configured, returning a beautiful simulated image.');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    const mockUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1024&auto=format&fit=crop&q=80';
    return {
      image_url: mockUrl,
      revised_prompt: prompt,
    };
  }

  const baseEndpoint = azureImageEndpoint.replace(/\/$/, '');
  const requestUrl = `${baseEndpoint}/openai/deployments/${azureImageDeployment}/images/generations?api-version=${azureImageApiVersion}`;
  const requestTimeoutMs = 240000;

  const requestImage = async (body) => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureImageApiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      return { response, data };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Azure image generation timed out after ${requestTimeoutMs / 1000} seconds.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  let requestBody = {
    prompt,
    size,
    quality: 'high',
  };

  let { response, data } = await requestImage(requestBody);

  if (!response.ok && /quality/i.test(String(data?.error?.message || ''))) {
    requestBody = {
      prompt,
      size,
    };
    ({ response, data } = await requestImage(requestBody));
  }

  if (!response.ok && /size|resolution|dimensions/i.test(String(data?.error?.message || '')) && size !== '1024x1024') {
    requestBody = {
      prompt,
      size: '1024x1024',
      quality: 'high',
    };
    ({ response, data } = await requestImage(requestBody));

    if (!response.ok && /quality/i.test(String(data?.error?.message || ''))) {
      requestBody = {
        prompt,
        size: '1024x1024',
      };
      ({ response, data } = await requestImage(requestBody));
    }
  }

  if (!response.ok) {
    throw new Error(data.error?.message || `Azure image API error: ${response.status} ${response.statusText}`);
  }

  const image = Array.isArray(data.data) ? data.data[0] : null;
  const imageUrl = image?.url || null;
  const b64Json = image?.b64_json || null;

  if (!imageUrl && !b64Json) {
    throw new Error('Azure image API returned no image payload.');
  }

  let finalImageUrl = imageUrl;
  let uploadResult = null;


if (!finalImageUrl && b64Json) {
  finalImageUrl = await uploadImageBufferToS3({
    buffer: Buffer.from(b64Json, 'base64'),
    mimeType: 'image/png',
    folder: 'images',
  });
}

const enableAzureImageEditMode = process.env.ENABLE_AZURE_IMAGE_EDIT_MODE === 'true';

  if (
  enableAzureImageEditMode &&  
  finalImageUrl &&
  logoUrl &&
  logoPlacement &&
  logoPlacement !== 'none'
  ) {
  try {
    console.log('[IMAGE EDIT] Starting edit mode...');
    const baseImageBuffer = await fetchImageBufferFromUrl(finalImageUrl);
    const logoBuffer = await fetchImageBufferFromUrl(logoUrl);

    const formData = new FormData();

    formData.append(
      'image[]',
      new Blob([baseImageBuffer], { type: 'image/png' }),
      'base.png'
    );

    formData.append(
      'image[]',
      new Blob([logoBuffer], { type: 'image/jpeg' }),
      'logo.jpg'
    );

    formData.append(
      'prompt',
      `Replace any existing logos or branding in the image with the uploaded logo. Place the uploaded logo in the ${logoPlacement.replace('-', ' ')} area. Preserve the overall poster layout, typography, colors, people, and composition exactly as they are. Do not redesign the logo.`
    );

    formData.append('model', azureImageDeployment);
    console.log('[IMAGE EDIT SIZE]', size);
    formData.append('size', size);
    formData.append('quality', 'medium');
    
    const editResponse = await fetch(
      `${baseEndpoint}/openai/deployments/${azureImageDeployment}/images/edits?api-version=${azureImageApiVersion}`,
      {
        method: 'POST',
        headers: {
          'api-key': azureImageApiKey,
        },
        body: formData,
      }
    );

    const editData = await editResponse.json();
    console.log('[IMAGE EDIT]', {
      ok: editResponse.ok,
      status: editResponse.status,
      error: editData?.error?.message,
      hasOutput: Boolean(editData?.data?.[0]?.b64_json),
    });

    const editedImage = editData?.data?.[0];

    if (editedImage?.b64_json) {
      finalImageUrl = await uploadImageBufferToS3({
        buffer: Buffer.from(editedImage.b64_json, 'base64'),
        mimeType: 'image/png',
        folder: 'images',
      });
    }
    if (editedImage?.b64_json) {
      return {
        image_url: finalImageUrl,
        revised_prompt: data?.data?.[0]?.revised_prompt || prompt,
      };
    }
  } catch (error) {
    console.error('[IMAGE EDIT FAILED]', error);
  }
}

// Ensure the logo URL is a valid Cloudinary URL, otherwise fall back to system logo if it's the Arth Ganga file
let activeLogoUrl = logoUrl;
if (logoUrl && (logoUrl.includes('/home/ec2-user') || logoUrl.includes('Arth Ganga'))) {
  activeLogoUrl = arthGangaLogoUrl;
}

// Ensure activeLogoUrl is from OUR Cloudinary account, otherwise upload it
// This prevents 400 errors when using logos from other Cloudinary accounts or external URLs
if (activeLogoUrl && activeLogoUrl.startsWith('http') && !activeLogoUrl.includes(`/${process.env.CLOUDINARY_CLOUD_NAME}/`)) {
  try {
    console.log('[IMAGE OVERLAY] Logo is external or from another account, uploading to our account:', activeLogoUrl);
    const logoUpload = await cloudinary.uploader.upload(activeLogoUrl, {
      folder: `${process.env.CLOUDINARY_FOLDER || 'creative-studio-os'}/logos`,
      resource_type: 'image'
    });
    activeLogoUrl = logoUpload.secure_url;
    console.log('[IMAGE OVERLAY] Logo re-hosted successfully:', activeLogoUrl);
  } catch (err) {
    console.warn('[IMAGE OVERLAY] Failed to re-host external logo:', err.message);
  }
}

// If we need to overlay but don't have a Cloudinary uploadResult yet (e.g. Azure returned a raw URL)
if (finalImageUrl && activeLogoUrl && logoPlacement && logoPlacement !== 'none' && !uploadResult) {
  try {
    uploadResult = await cloudinary.uploader.upload(finalImageUrl, {
      folder: `${process.env.CLOUDINARY_FOLDER || 'creative-studio-os'}/images`,
      resource_type: 'image',
    });
    finalImageUrl = uploadResult.secure_url;
  } catch (err) {
    console.warn('[IMAGE OVERLAY] Failed to upload Azure URL to Cloudinary', err);
  }
}

if (
  finalImageUrl &&
  activeLogoUrl &&
  logoPlacement &&
  logoPlacement !== 'none' &&
  uploadResult?.public_id
) {
  const gravityMap = {
    'top-left': 'north_west',
    'top-right': 'north_east',
    'bottom-left': 'south_west',
    'bottom-right': 'south_east',
  };
  const gravity = gravityMap[logoPlacement] || 'south_east';
  const logoPublicId = getCloudinaryPublicIdFromUrl(activeLogoUrl);

  if (logoPublicId) {
    finalImageUrl = cloudinary.url(uploadResult.public_id, {
      secure: true,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      transformation: [
        {
          overlay: logoPublicId,
          width: 180,
          opacity: 100,
          gravity,
          x: 24,
          y: 24,
        },
      ],
    });
  } else {
    console.warn('[IMAGE OVERLAY] Invalid Cloudinary logo URL, skipping overlay:', activeLogoUrl);
  }
}

console.log('[IMAGE GENERATION SUCCESS] Final URL:', finalImageUrl);

return {
  image_url: finalImageUrl,
  revised_prompt: data?.data?.[0]?.revised_prompt || prompt,
};
};

const getTextGenerationConfig = () => {
  const isAzure =
    String(textAiProvider || '').trim().toLowerCase() === 'azure'
    || String(textAiApiUrl || '').includes('azure')
    || String(textAiApiUrl || '').includes('openai.azure.com');

  return {
    apiKey: textAiApiKey,
    model: textAiModel,
    apiUrl: textAiApiUrl,
    isAzure,
    apiVersion: textAiApiVersion,
  };
};

const generateTextVariants = async ({ prompt }) => {
  const config = getTextGenerationConfig();
  if (!config.apiKey) {
    throw new Error('Text generation is not configured on the server. Set AI_API_KEY (or VITE_AI_API_KEY).');
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  let requestUrl = String(config.apiUrl || '').trim();
  if (!requestUrl) {
    throw new Error('Text generation API URL is not configured on the server.');
  }

  if (config.isAzure) {
    headers['api-key'] = config.apiKey;
    const normalizedUrl = requestUrl.replace(/\/$/, '');
    if (/chat\/completions/i.test(normalizedUrl)) {
      requestUrl = normalizedUrl.includes('api-version=')
        ? normalizedUrl
        : `${normalizedUrl}${normalizedUrl.includes('?') ? '&' : '?'}api-version=${encodeURIComponent(config.apiVersion)}`;
    } else {
      requestUrl = `${normalizedUrl}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
    }
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
    headers['HTTP-Referer'] = process.env.PUBLIC_BASE_URL || 'http://localhost';
    headers['X-Title'] = 'Creative Studio OS';
  }

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON. Output schema: {"variants":[{"title":"string","content":"string","word_count":number}]}',
        },
        {
          role: 'user',
          content: String(prompt || '').trim(),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_completion_tokens: 2000,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Text generation failed: ${response.status} ${response.statusText}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No text content was generated');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const fallbackContent = String(content || '').trim();
    if (!fallbackContent) {
      throw new Error('Failed to parse generated text payload');
    }

    return [{
      title: 'Generated content',
      content: fallbackContent,
      word_count: fallbackContent.split(/\s+/).filter(Boolean).length,
    }];
  }

  if (Array.isArray(parsed?.variants) && parsed.variants.length > 0) {
    return parsed.variants;
  }

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed;
  }

  if (typeof parsed === 'object' && parsed) {
    const fallbackContent = String(parsed.content || parsed.text || '').trim();
    if (fallbackContent) {
      return [{
        title: String(parsed.title || 'Generated content').trim() || 'Generated content',
        content: fallbackContent,
        word_count: Number(parsed.word_count || fallbackContent.split(/\s+/).filter(Boolean).length || 0),
      }];
    }
  }

  throw new Error('Generated text response did not contain usable content');
};

const createMongoStore = (db) => ({
  type: 'mongo',
  async init() {
    const users = db.collection('users');
    const history = db.collection('content_history');
    const creditTransactions = db.collection('credit_transactions');
    const appSettings = db.collection('app_settings');
    const plansCollection = db.collection('plans');

    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      history.createIndex({ user_id: 1, created_date: -1 }),
      history.createIndex({ created_date: -1 }),
      history.createIndex({ user_id: 1, updated_date: -1, created_date: -1 }),
      history.createIndex({ updated_date: -1, created_date: -1 }),
      history.createIndex({ user_id: 1, conversation_key: 1 }),
      history.createIndex({ user_id: 1, session_root_history_id: 1 }),
      creditTransactions.createIndex({ user_id: 1, created_at: -1 }),
      appSettings.createIndex({ key: 1 }, { unique: true }),
      plansCollection.createIndex({ name: 1 }, { unique: true }),
    ]);

    await users.updateMany(
      { credits_balance: { $exists: false } },
      {
        $set: {
          credits_balance: 0,
          credits_total_allocated: 0,
          credits_total_purchased: 0,
          credits_total_used: 0,
        },
      }
    );

    const existingUsers = await users.find({}, { projection: { _id: 1, plan_name: 1, persona_limit: 1 } }).toArray();
    await Promise.all(existingUsers
      .filter((user) => user.persona_limit == null)
      .map((user) => users.updateOne(
        { _id: user._id },
        {
          $set: {
            persona_limit: getPersonaLimitForPlan(user.plan_name || 'Free'),
          },
        }
      )));

    await appSettings.updateOne(
      { key: 'credits' },
      {
        $setOnInsert: {
          key: 'credits',
          default_signup_credits: normalizeCreditValue(defaultSignupCreditsEnv, 25),
          text_generation_cost: normalizeGenerationCost(defaultTextGenerationCostEnv, 1),
          image_generation_cost: normalizeGenerationCost(defaultImageGenerationCostEnv, 3),
          video_generation_cost: normalizeGenerationCost(defaultVideoGenerationCostEnv, 10),
          created_at: nowIso(),
        },
        $set: {
          updated_at: nowIso(),
        },
      },
      { upsert: true }
    );

    // Seed default plans if not present
    const planCount = await plansCollection.countDocuments();
    if (planCount === 0) {
      await plansCollection.insertMany([
        {
          name: 'Free',
          price: 0,
          credits: 25,
          persona_limit: 1,
          created_at: nowIso(),
        },
        {
          name: 'Pro',
          price: 49,
          credits: 500,
          persona_limit: 5,
          created_at: nowIso(),
        },
        {
          name: 'Enterprise',
          price: 199,
          credits: 2500,
          persona_limit: 20,
          created_at: nowIso(),
        }
      ]);
      console.log('Seeded default plans (Free, Pro, Enterprise) into MongoDB.');
    }

    if (!superAdminEmail) {
      console.warn('SUPERADMIN_EMAIL is not set; superadmin login will remain unavailable until configured.');
      return;
    }

    const existingAdmin = await users.findOne({ email: superAdminEmail, role: 'superadmin' });
    if (!existingAdmin) {
      console.warn(`Super admin user ${superAdminEmail} was not found in MongoDB; superadmin login will remain unavailable until seeded.`);
    }
  },
  async getHealth() {
    return { ok: true, users: await db.collection('users').countDocuments(), mode: 'mongo' };
  },
  async findUserByEmail(email) {
    return await db.collection('users').findOne({ email: normalizeEmail(email) });
  },
  async findUserById(id) {
    return await db.collection('users').findOne({ _id: new ObjectId(id) });
  },
  async insertUser(user) {
    const result = await db.collection('users').insertOne(user);
    return await db.collection('users').findOne({ _id: result.insertedId });
  },
  async updateUserById(id, updates) {
    await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    return await db.collection('users').findOne({ _id: new ObjectId(id) });
  },
  async countUsers() {
    return await db.collection('users').countDocuments();
  },
  async listUsers(filter = {}) {
    const rows = await db.collection('users').find({}).toArray();
    return typeof filter === 'function' ? rows.filter(filter) : rows.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
  },
  async getCreditSettings() {
    const settings = await db.collection('app_settings').findOne({ key: 'credits' });
    return {
      default_signup_credits: normalizeCreditValue(settings?.default_signup_credits, normalizeCreditValue(defaultSignupCreditsEnv, 25)),
      text_generation_cost: normalizeGenerationCost(settings?.text_generation_cost, normalizeGenerationCost(defaultTextGenerationCostEnv, 1)),
      image_generation_cost: normalizeGenerationCost(settings?.image_generation_cost, normalizeGenerationCost(defaultImageGenerationCostEnv, 3)),
      video_generation_cost: normalizeGenerationCost(settings?.video_generation_cost, normalizeGenerationCost(defaultVideoGenerationCostEnv, 10)),
      updated_at: settings?.updated_at || null,
    };
  },
  async updateCreditSettings({ defaultSignupCredits, textGenerationCost, imageGenerationCost, videoGenerationCost }) {
    const current = await this.getCreditSettings();

    await db.collection('app_settings').updateOne(
      { key: 'credits' },
      {
        $set: {
          default_signup_credits: normalizeCreditValue(defaultSignupCredits, normalizeCreditValue(current.default_signup_credits, normalizeCreditValue(defaultSignupCreditsEnv, 25))),
          text_generation_cost: normalizeGenerationCost(textGenerationCost, normalizeGenerationCost(current.text_generation_cost, normalizeGenerationCost(defaultTextGenerationCostEnv, 1))),
          image_generation_cost: normalizeGenerationCost(imageGenerationCost, normalizeGenerationCost(current.image_generation_cost, normalizeGenerationCost(defaultImageGenerationCostEnv, 3))),
          video_generation_cost: normalizeGenerationCost(videoGenerationCost, normalizeGenerationCost(current.video_generation_cost, normalizeGenerationCost(defaultVideoGenerationCostEnv, 10))),
          updated_at: nowIso(),
        },
        $setOnInsert: {
          key: 'credits',
          created_at: nowIso(),
        },
      },
      { upsert: true }
    );

    return await this.getCreditSettings();
  },
  async insertCreditTransaction(entry) {
    const result = await db.collection('credit_transactions').insertOne(entry);
    return await db.collection('credit_transactions').findOne({ _id: result.insertedId });
  },
  async listCreditTransactions({ userId, limit = 50 } = {}) {
    const query = userId ? { user_id: String(userId) } : {};
    return await db.collection('credit_transactions').find(query).sort({ created_at: -1 }).limit(limit).toArray();
  },
    async insertSupportRequest(entry) {
    const result = await db.collection('support_requests').insertOne(entry);
    return await db.collection('support_requests').findOne({ _id: result.insertedId });
  },
  async listSupportRequests({ status = '', limit = 100 } = {}) {
    const query = status ? { status } : {};
    return await db.collection('support_requests')
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  },
  async allocateCredits({ userId, amount, type = 'manual_adjustment', note = '', createdBy = null }) {
    const normalizedAmount = Math.round(Number(amount || 0));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
      throw new Error('Credit amount must be a non-zero number');
    }

    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const currentBalance = normalizeCreditValue(user.credits_balance);
    const nextBalance = currentBalance + normalizedAmount;
    if (nextBalance < 0) {
      throw new Error('Insufficient credits for this adjustment');
    }

    const updates = {
      credits_balance: nextBalance,
    };

    if (normalizedAmount > 0) {
      updates.credits_total_allocated = normalizeCreditValue(user.credits_total_allocated) + normalizedAmount;
      if (type === 'purchase') {
        updates.credits_total_purchased = normalizeCreditValue(user.credits_total_purchased) + normalizedAmount;
      }
    } else {
      updates.credits_total_used = normalizeCreditValue(user.credits_total_used) + Math.abs(normalizedAmount);
    }

    const updatedUser = await this.updateUserById(userId, updates);
    const transaction = await this.insertCreditTransaction({
      user_id: String(userId),
      amount: normalizedAmount,
      balance_after: normalizeCreditValue(updatedUser.credits_balance),
      type,
      note: String(note || '').trim(),
      created_at: nowIso(),
      created_by: createdBy,
    });

    return {
      user: updatedUser,
      transaction,
    };
  },
  async updateUserPersonaLimit(userId, personaLimit) {
    const normalizedLimit = normalizeCreditValue(personaLimit, 1);
    if (normalizedLimit < 1) {
      throw new Error('Persona limit must be at least 1');
    }

    return await this.updateUserById(userId, { persona_limit: normalizedLimit });
  },
  async listPlans() {
    return await db.collection('plans').find({}).sort({ created_at: 1 }).toArray();
  },
  async findPlanByName(name) {
    return await db.collection('plans').findOne({ name });
  },
  async listHistory(filter = {}, sortField = 'created_date', limit, offset = 0) {
    const collection = db.collection('content_history');

    if (typeof filter === 'function') {
      const rows = await collection.find({}, { allowDiskUse: true }).sort({ [sortField]: -1 }).skip(offset).limit(limit || 500).toArray();
      return rows.filter(filter);
    }

    const cursor = collection.find(filter || {}, { allowDiskUse: true }).sort({ [sortField]: -1 });
    if (typeof offset === 'number' && Number.isFinite(offset) && offset > 0) {
      cursor.skip(offset);
    }
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      cursor.limit(limit);
    }

    return await cursor.toArray();
  },
  async listHistoryPage(filter = {}, sortField = 'created_date', limit = 10, beforeValue) {
    const collection = db.collection('content_history');
    const query = typeof filter === 'function' ? {} : { ...(filter || {}) };

    if (beforeValue) {
      query[sortField] = { $lt: beforeValue };
    }

    const rows = await collection
      .find(query, { allowDiskUse: true })
      .sort({ [sortField]: -1 })
      .limit(limit)
      .toArray();

    if (typeof filter === 'function') {
      return rows.filter(filter);
    }

    return rows;
  },
  async upsertHistoryConversation(entry) {
    const collection = db.collection('content_history');
    const conversationKey = String(entry.conversation_key || '').trim();
    const sessionRootHistoryId = String(entry.session_root_history_id || '').trim();

    if (!conversationKey && !sessionRootHistoryId) {
      return await this.insertHistory(entry);
    }

    const query = { user_id: entry.user_id };
    if (sessionRootHistoryId) {
      query.$or = [
        { session_root_history_id: sessionRootHistoryId },
        { conversation_key: conversationKey || sessionRootHistoryId },
      ];
    } else {
      query.conversation_key = conversationKey;
    }

    const existing = await collection.findOne(query, { sort: { updated_date: -1, created_date: -1 } });
    if (!existing) {
      const inserted = await this.insertHistory(entry);
      if (!inserted.session_root_history_id) {
        await collection.updateOne(
          { _id: inserted._id },
          { $set: { session_root_history_id: inserted._id.toString(), conversation_key: conversationKey || inserted._id.toString() } }
        );
        return await collection.findOne({ _id: inserted._id });
      }
      return inserted;
    }

    const nextSessionRootHistoryId = existing.session_root_history_id || existing._id?.toString?.() || sessionRootHistoryId || null;
    const nextConversationKey = conversationKey || existing.conversation_key || nextSessionRootHistoryId;
    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...entry,
          session_root_history_id: nextSessionRootHistoryId,
          conversation_key: nextConversationKey,
          created_date: existing.created_date || entry.created_date,
          updated_date: nowIso(),
        },
      }
    );

    return await collection.findOne({ _id: existing._id });
  },
  async insertHistory(entry) {
    const result = await db.collection('content_history').insertOne(entry);
    return await db.collection('content_history').findOne({ _id: result.insertedId });
  },
  async updateHistoryStatus(id, userId) {
    await db.collection('content_history').updateOne(
      { _id: new ObjectId(id), user_id: userId },
      { $set: { status: 'deleted', deleted_at: nowIso() } }
    );
    return await db.collection('content_history').findOne({ _id: new ObjectId(id) });
  },
  async listCompanyPersonas(userId) {
    return await db.collection('company_personas').find({ user_id: userId }).sort({ created_at: -1 }).toArray();
  },
  async countCompanyPersonas(userId) {
    return await db.collection('company_personas').countDocuments({ user_id: userId });
  },
  async findCompanyPersonaById(id, userId) {
    return await db.collection('company_personas').findOne({ _id: new ObjectId(id), user_id: userId });
  },
  async insertCompanyPersona(persona) {
    const result = await db.collection('company_personas').insertOne(persona);
    return await db.collection('company_personas').findOne({ _id: result.insertedId });
  },
  async updateCompanyPersona(id, userId, updates) {
    await db.collection('company_personas').updateOne(
      { _id: new ObjectId(id), user_id: userId },
      { $set: updates }
    );
    return await db.collection('company_personas').findOne({ _id: new ObjectId(id), user_id: userId });
  },
  async deleteCompanyPersona(id, userId) {
    const result = await db.collection('company_personas').deleteOne({ _id: new ObjectId(id), user_id: userId });
    return result.deletedCount > 0;
  },
  async listKnowledgeSources(userId) {
    return await db.collection('knowledge_sources').find({ user_id: userId }).sort({ updated_at: -1 }).toArray();
  },
  async findKnowledgeSourceById(id, userId) {
    return await db.collection('knowledge_sources').findOne({ _id: new ObjectId(id), user_id: userId });
  },
  async insertKnowledgeSource(source) {
    const result = await db.collection('knowledge_sources').insertOne(source);
    return await db.collection('knowledge_sources').findOne({ _id: result.insertedId });
  },
  async updateKnowledgeSource(id, userId, updates) {
    await db.collection('knowledge_sources').updateOne(
      { _id: new ObjectId(id), user_id: userId },
      { $set: updates }
    );
    return await db.collection('knowledge_sources').findOne({ _id: new ObjectId(id), user_id: userId });
  },
  async deleteKnowledgeSource(id, userId) {
    const result = await db.collection('knowledge_sources').deleteOne({ _id: new ObjectId(id), user_id: userId });
    return result.deletedCount > 0;
  },
  async saveImageGeneration(entry) {
    const result = await db.collection('image_generations').insertOne(entry);

    return await db.collection('image_generations').findOne({
      _id: result.insertedId,
    });
  },
  async saveVideoGeneration(entry) {
    const result = await db.collection('video_generations').insertOne(entry);

    return await db.collection('video_generations').findOne({
      _id: result.insertedId,
    });
  },
});

let store = null;

const chargeCreditsForGeneration = async ({ userId, amount, type, note }) => {
  const normalizedAmount = normalizeGenerationCost(amount, 0);
  if (normalizedAmount <= 0) {
    return null;
  }

  return await store.allocateCredits({
    userId,
    amount: -normalizedAmount,
    type,
    note,
    createdBy: 'system',
  });
};

const refundGenerationCredits = async ({ userId, amount, type, note }) => {
  const normalizedAmount = normalizeGenerationCost(amount, 0);
  if (normalizedAmount <= 0) {
    return null;
  }

  try {
    return await store.allocateCredits({
      userId,
      amount: normalizedAmount,
      type,
      note,
      createdBy: 'system',
    });
  } catch (error) {
    console.error('Credit refund failed:', error?.message || error);
    return null;
  }
};

const authRequired = async (req, res, next) => {
  const header = req.headers.authorization || req.headers['x-auth-token'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (header || null);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await store.findUserById(decoded.sub);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid session' });
  }
};

app.get('/api/download-asset', authRequired, async (req, res) => {
  try {
    const assetUrl = String(req.query.url || '').trim();
    const rawFilename = String(req.query.filename || 'download').trim();
    const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';

    if (!assetUrl) {
      return res.status(400).json({ message: 'Asset URL is required' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(assetUrl);
    } catch {
      return res.status(400).json({ message: 'Invalid asset URL' });
    }

    const allowedHosts = new Set([
      `${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`,
      'res.cloudinary.com',
    ]);

    if (!allowedHosts.has(parsedUrl.hostname)) {
      return res.status(400).json({ message: 'Unsupported asset host' });
    }

    const assetResponse = await fetch(assetUrl);

    if (!assetResponse.ok) {
      return res.status(502).json({ message: 'Unable to fetch asset' });
    }

    const contentType = assetResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = assetResponse.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const buffer = Buffer.from(await assetResponse.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    console.error('[DOWNLOAD ASSET FAILED]', error?.message || error);
    return res.status(500).json({ message: 'Download failed' });
  }
});

const superAdminRequired = async (req, res, next) => {
  const header = req.headers.authorization || req.headers['x-auth-token'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (header || null);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    req.superAdmin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid session' });
  }
};

app.get('/api/health', async (_req, res) => {
  const health = await store.getHealth();
  res.json(health);
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName, phone, company } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedEmail || !password || !fullName || !normalizedPhone || !company) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!isValidPhoneNumber(normalizedPhone)) {
    return res.status(400).json({ message: 'Enter a valid phone number with 10 to 15 digits' });
  }

  const existing = await store.findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({ message: 'User already registered' });
  }

  const freePlan = await store.findPlanByName('Free');
  if (!freePlan) {
    return res.status(500).json({ message: 'Default Free plan is missing in MongoDB' });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const created_at = nowIso();
  const creditSettings = await store.getCreditSettings();
  const defaultSignupCredits = normalizeCreditValue(creditSettings.default_signup_credits, normalizeCreditValue(defaultSignupCreditsEnv, 25));
  const insertedUser = await store.insertUser({
    email: normalizedEmail,
    full_name: fullName,
    phone: normalizedPhone,
    company,
    role: 'user',
    status: 'active',
    password_hash,
    created_at,
    plan_id: freePlan.id || freePlan._id?.toString?.() || null,
    plan_name: freePlan.name,
    credits_balance: defaultSignupCredits,
    credits_total_allocated: defaultSignupCredits,
    credits_total_purchased: 0,
    credits_total_used: 0,
  });

  if (defaultSignupCredits > 0) {
    await store.insertCreditTransaction({
      user_id: insertedUser?._id?.toString?.() || insertedUser?.id,
      amount: defaultSignupCredits,
      balance_after: defaultSignupCredits,
      type: 'signup_bonus',
      note: 'Default free credits on signup',
      created_at,
      created_by: 'system',
    });
  }

  const user = insertedUser?._id ? insertedUser : (await store.findUserByEmail(normalizedEmail));
  const token = createToken({ sub: user.id || user._id.toString(), role: user.role, email: user.email });
  res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const user = await store.findUserByEmail(normalizedEmail);

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const isValid = await bcrypt.compare(password || '', user.password_hash || '');
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = createToken({ sub: user.id || user._id.toString(), role: user.role, email: user.email });
  res.json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const user = await store.findUserByEmail(normalizedEmail);

  if (!user) {
    return res.json({
      message: 'If an account exists for this email, an OTP has been generated.',
    });
  }

  const { otp, otpHash, expiresAt } = createPasswordResetOtp();

  await sendPasswordResetOtpEmail({
    to: user.email,
    otp,
    expiresInMinutes: passwordResetOtpExpiryMinutes,
  });

  await store.updateUserById(user.id || user._id.toString(), {
    password_reset_otp_hash: otpHash,
    password_reset_otp_expires_at: expiresAt,
    password_reset_requested_at: nowIso(),
  });

  res.json({
    message: 'If an account exists for this email, an OTP has been sent.',
    expiresAt,
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, OTP, and new password are required' });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  const user = await store.findUserByEmail(normalizedEmail);

  if (!user || !user.password_reset_otp_hash || !user.password_reset_otp_expires_at) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  if (new Date(user.password_reset_otp_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  const incomingOtpHash = hashPasswordResetOtp(otp);

  if (incomingOtpHash !== user.password_reset_otp_hash) {
    return res.status(400).json({ message: 'Invalid or expired OTP' });
  }

  const password_hash = await bcrypt.hash(newPassword, 10);

  await store.updateUserById(user.id || user._id.toString(), {
    password_hash,
    password_reset_otp_hash: null,
    password_reset_otp_expires_at: null,
    password_reset_requested_at: null,
    password_reset_completed_at: nowIso(),
  });

  res.json({ message: 'Password reset successful. Please sign in with your new password.' });
});

app.get('/api/auth/session', authRequired, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/credits/balance', authRequired, async (req, res) => {
  const user = await store.findUserById(req.user.id || req.user._id.toString());
  res.json({
    balance: normalizeCreditValue(user?.credits_balance),
    totalAllocated: normalizeCreditValue(user?.credits_total_allocated),
    totalPurchased: normalizeCreditValue(user?.credits_total_purchased),
    totalUsed: normalizeCreditValue(user?.credits_total_used),
  });
});

app.get('/api/credits/transactions', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const transactions = await store.listCreditTransactions({ userId, limit: 100 });
  res.json({ transactions: transactions.map(sanitizeCreditTransaction) });
});

app.post('/api/credits/purchase-request', authRequired, async (req, res) => {
  const { amount, note } = req.body || {};
  const requestedAmount = normalizeCreditValue(amount);
  if (requestedAmount <= 0) {
    return res.status(400).json({ message: 'Requested credit amount must be greater than zero' });
  }

  const transaction = await store.insertCreditTransaction({
    user_id: req.user.id || req.user._id.toString(),
    amount: requestedAmount,
    balance_after: normalizeCreditValue(req.user.credits_balance),
    type: 'purchase_request',
    note: String(note || '').trim(),
    created_at: nowIso(),
    created_by: req.user.id || req.user._id.toString(),
  });

  res.status(201).json({
    message: 'Credit purchase request recorded. Payment gateway is not enabled yet.',
    request: sanitizeCreditTransaction(transaction),
  });
});

app.get('/api/wallet', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const user = await store.findUserById(userId);
  const transactions = await store.listCreditTransactions({ userId, limit: 100 });

  res.json({
    balance: normalizeCreditValue(user?.credits_balance),
    totalAllocated: normalizeCreditValue(user?.credits_total_allocated),
    totalPurchased: normalizeCreditValue(user?.credits_total_purchased),
    totalUsed: normalizeCreditValue(user?.credits_total_used),
    transactions: transactions.map(sanitizeCreditTransaction),
  });
});

app.post('/api/wallet/recharge', authRequired, async (req, res) => {
  const { amount, note } = req.body || {};
  const requestedAmount = normalizeCreditValue(amount);

  if (requestedAmount <= 0) {
    return res.status(400).json({ message: 'Requested credit amount must be greater than zero' });
  }

  const transaction = await store.insertCreditTransaction({
    user_id: req.user.id || req.user._id.toString(),
    amount: requestedAmount,
    balance_after: normalizeCreditValue(req.user.credits_balance),
    type: 'purchase_request',
    note: String(note || '').trim(),
    created_at: nowIso(),
    created_by: req.user.id || req.user._id.toString(),
  });

  res.status(201).json({
    message: 'Credit purchase request recorded. Payment gateway is not enabled yet.',
    request: sanitizeCreditTransaction(transaction),
  });
});

app.post('/api/wallet/webhook', async (req, res) => {
  const { userId, amount, paymentId, status } = req.body || {};
  const normalizedAmount = normalizeCreditValue(amount);

  if (String(status || '').toLowerCase() !== 'success') {
    return res.status(400).json({ message: 'Payment status is not successful' });
  }

  if (!String(userId || '').trim()) {
    return res.status(400).json({ message: 'User id is required' });
  }

  if (normalizedAmount <= 0) {
    return res.status(400).json({ message: 'Credit amount must be greater than zero' });
  }

  try {
    const result = await store.allocateCredits({
      userId: String(userId).trim(),
      amount: normalizedAmount,
      type: 'purchase',
      note: `Payment successful${paymentId ? `: ${paymentId}` : ''}`,
      createdBy: 'wallet_webhook',
    });

    res.json({
      message: 'Credits added successfully',
      user: sanitizeUser(result.user),
      transaction: sanitizeCreditTransaction(result.transaction),
    });
  } catch (error) {
    const message = error.message || 'Unable to process wallet webhook';
    const responseStatus = /not found/i.test(message) ? 404 : 400;
    res.status(responseStatus).json({ message });
  }
});

app.post('/api/contact', authRequired, async (req, res) => {
  const { subject, message } = req.body || {};

  req.body = {
    type: 'general_support',
    subject,
    message,
  };

  const requestType = 'general_support';
  const requestSubject = String(subject || '').trim();
  const requestMessage = String(message || '').trim();

  if (!requestSubject) {
    return res.status(400).json({ message: 'Subject is required' });
  }

  if (!requestMessage) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const now = nowIso();
  const userId = req.user.id || req.user._id.toString();

  const request = await store.insertSupportRequest({
    user_id: userId,
    user_name: req.user.full_name || req.user.email || '',
    user_email: req.user.email || '',
    company: req.user.company || '',
    type: requestType,
    subject: requestSubject,
    message: requestMessage,
    status: 'open',
    created_at: now,
    updated_at: now,
    created_by: userId,
  });

  res.status(201).json({
    message: 'Message submitted successfully. Our team will review it shortly.',
    request,
  });
});

app.post('/api/support-requests', authRequired, async (req, res) => {
  const { type, subject, message } = req.body || {};

  const requestType = String(type || '').trim();
  const requestSubject = String(subject || '').trim();
  const requestMessage = String(message || '').trim();

  const allowedTypes = [
    'credit_request',
    'persona_request',
    'bug_report',
    'feature_request',
    'general_support',
  ];

  if (!allowedTypes.includes(requestType)) {
    return res.status(400).json({ message: 'Please select a valid request type' });
  }

  if (!requestSubject) {
    return res.status(400).json({ message: 'Subject is required' });
  }

  if (!requestMessage) {
    return res.status(400).json({ message: 'Message is required' });
  }

  const now = nowIso();
  const userId = req.user.id || req.user._id.toString();

  const request = await store.insertSupportRequest({
    user_id: userId,
    user_name: req.user.full_name || req.user.email || '',
    user_email: req.user.email || '',
    company: req.user.company || '',
    type: requestType,
    subject: requestSubject,
    message: requestMessage,
    status: 'open',
    created_at: now,
    updated_at: now,
    created_by: userId,
  });

  res.status(201).json({
    message: 'Request submitted successfully. Our team will review it shortly.',
    request,
  });
});
app.get('/api/user/metrics', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const rows = await store.listHistory(
    (row) => String(row.user_id) === String(userId),
    'created_date'
  );

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const generationsThisMonth = rows.filter(
    (row) => new Date(row.created_date) >= thisMonthStart
  ).length;
  const companyPersonaCount = await store.countCompanyPersonas(userId);
  const user = await store.findUserById(userId);
  const planName = user?.plan_name || req.user.plan_name || 'Free';
  const personaLimit = normalizeCreditValue(user?.persona_limit, getPersonaLimitForPlan(planName));

  res.json({
    generationsThisMonth,
    totalGenerations: rows.length,
    planName,
    planId: req.user.plan_id || null,
    companyPersonaCount,
    companyPersonaLimit: personaLimit,
  });
});

app.get('/api/company-personas', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const rows = await store.listCompanyPersonas(userId);
  const user = await store.findUserById(userId);
  const planName = user?.plan_name || req.user.plan_name || 'Free';
  const personaLimit = normalizeCreditValue(user?.persona_limit, getPersonaLimitForPlan(planName));

  res.json({
    items: rows.map(sanitizeCompanyPersona),
    meta: {
      count: rows.length,
      limit: personaLimit,
      planName,
    },
  });
});

app.post('/api/company-personas/logo', authRequired, async (req, res) => {
  const { fileName, fileData } = req.body || {};

  if (!fileName || !fileData) {
    return res.status(400).json({ message: 'Logo file is required' });
  }

  try {
    const logoUrl = await saveLogoUpload(fileData);
    res.status(201).json({ logoUrl, fileName });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to upload logo' });
  }
});

app.post('/api/brand/logo', authRequired, async (req, res) => {
  const { fileName, fileData } = req.body || {};

  if (!fileName || !fileData) {
    return res.status(400).json({ message: 'Logo file is required' });
  }

  try {
    const logoUrl = await saveLogoUpload(fileData);
    res.status(201).json({ logoUrl, fileName });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to upload logo' });
  }
});

app.get('/api/personas', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const rows = await store.listCompanyPersonas(userId);
  const user = await store.findUserById(userId);
  const planName = user?.plan_name || req.user.plan_name || 'Free';
  const personaLimit = normalizeCreditValue(user?.persona_limit, getPersonaLimitForPlan(planName));

  res.json({
    items: rows.map(sanitizeCompanyPersona),
    meta: {
      count: rows.length,
      limit: personaLimit,
      planName,
    },
  });
});

app.post('/api/personas', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const {
    name,
    company,
    description,
    base_image_url,
    tagline,
    logo_url,
    logo_placement,
    preserve_original_logo,
    audience,
    voice,
    goals,
    notes,
    visual_style_instructions,
    brand_primary_color,
    brand_secondary_color,
    brand_accent_color,
    tuning_prompt,
  } = req.body || {};

  const resolvedCompany = String(company || name || '').trim();
  const resolvedNotes = String(notes || description || '').trim();

  if (!name || !resolvedCompany) {
    return res.status(400).json({ message: 'Persona name and company are required' });
  }

  const existingCount = await store.countCompanyPersonas(userId);
  const user = await store.findUserById(userId);
  const planName = user?.plan_name || req.user.plan_name || 'Free';
  const personaLimit = normalizeCreditValue(user?.persona_limit, getPersonaLimitForPlan(planName));

  if (existingCount >= personaLimit) {
    return res.status(403).json({ message: `Your ${planName} plan allows up to ${personaLimit} company persona${personaLimit > 1 ? 's' : ''}.` });
  }

  const timestamp = nowIso();
  const persona = await store.insertCompanyPersona({
    user_id: userId,
    company: resolvedCompany,
    name: String(name).trim(),
    tagline: String(tagline || '').trim(),
    logo_url: String(logo_url || base_image_url || '').trim(),
    logo_placement: String(logo_placement || 'none').trim() || 'none',
    preserve_original_logo: preserve_original_logo !== false,
    audience: String(audience || '').trim(),
    voice: String(voice || '').trim(),
    goals: String(goals || '').trim(),
    notes: resolvedNotes,
    visual_style_instructions: String(visual_style_instructions || '').trim(),
    brand_primary_color: String(brand_primary_color || '').trim(),
    brand_secondary_color: String(brand_secondary_color || '').trim(),
    brand_accent_color: String(brand_accent_color || '').trim(),
    tuning_prompt: String(tuning_prompt || '').trim(),
    learning_summary: '',
    learning_count: 0,
    analysis: buildPersonaAnalysis({
      name,
      company: resolvedCompany,
      tagline,
      audience,
      voice,
      goals,
      notes: resolvedNotes,
      visual_style_instructions,
      tuning_prompt,
    }),
    created_at: timestamp,
    updated_at: timestamp,
  });

  res.status(201).json(sanitizeCompanyPersona(persona));
});

app.post('/api/company-personas', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const {
    name,
    company,
    tagline,
    logo_url,
    logo_placement,
    preserve_original_logo,
    audience,
    voice,
    goals,
    notes,
    visual_style_instructions,
    brand_primary_color,
    brand_secondary_color,
    brand_accent_color,
    tuning_prompt,
  } = req.body || {};

  if (!name || !company) {
    return res.status(400).json({ message: 'Persona name and company are required' });
  }

  const existingCount = await store.countCompanyPersonas(userId);
  const user = await store.findUserById(userId);
  const planName = user?.plan_name || req.user.plan_name || 'Free';
  const personaLimit = normalizeCreditValue(user?.persona_limit, getPersonaLimitForPlan(planName));
  if (existingCount >= personaLimit) {
    return res.status(403).json({ message: `Your ${planName} plan allows up to ${personaLimit} company persona${personaLimit > 1 ? 's' : ''}.` });
  }

  const timestamp = nowIso();
  const persona = await store.insertCompanyPersona({
    user_id: userId,
    company: String(company).trim(),
    name: String(name).trim(),
    tagline: String(tagline || '').trim(),
    logo_url: String(logo_url || '').trim(),
    logo_placement: String(logo_placement || 'none').trim() || 'none',
    preserve_original_logo: preserve_original_logo !== false,
    audience: String(audience || '').trim(),
    voice: String(voice || '').trim(),
    goals: String(goals || '').trim(),
    notes: String(notes || '').trim(),
    visual_style_instructions: String(visual_style_instructions || '').trim(),
    brand_primary_color: String(brand_primary_color || '').trim(),
    brand_secondary_color: String(brand_secondary_color || '').trim(),
    brand_accent_color: String(brand_accent_color || '').trim(),
    tuning_prompt: String(tuning_prompt || '').trim(),
    learning_summary: '',
    learning_count: 0,
    analysis: buildPersonaAnalysis({ name, company, tagline, audience, voice, goals, notes, visual_style_instructions, tuning_prompt }),
    created_at: timestamp,
    updated_at: timestamp,
  });

  res.status(201).json(sanitizeCompanyPersona(persona));
});

app.patch('/api/company-personas/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const existing = await store.findCompanyPersonaById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({ message: 'Company persona not found' });
  }

  const nextValues = {
    name: String(req.body.name ?? existing.name).trim(),
    company: String(req.body.company ?? existing.company).trim(),
    tagline: String(req.body.tagline ?? existing.tagline).trim(),
    logo_url: String(req.body.logo_url ?? existing.logo_url).trim(),
    logo_placement: String(req.body.logo_placement ?? existing.logo_placement ?? 'none').trim() || 'none',
    preserve_original_logo: req.body.preserve_original_logo !== undefined ? req.body.preserve_original_logo !== false : existing.preserve_original_logo !== false,
    audience: String(req.body.audience ?? existing.audience).trim(),
    voice: String(req.body.voice ?? existing.voice).trim(),
    goals: String(req.body.goals ?? existing.goals).trim(),
    notes: String(req.body.notes ?? existing.notes).trim(),
    visual_style_instructions: String(req.body.visual_style_instructions ?? existing.visual_style_instructions).trim(),
    brand_primary_color: String(req.body.brand_primary_color ?? existing.brand_primary_color ?? '').trim(),
    brand_secondary_color: String(req.body.brand_secondary_color ?? existing.brand_secondary_color ?? '').trim(),
    brand_accent_color: String(req.body.brand_accent_color ?? existing.brand_accent_color ?? '').trim(),
    tuning_prompt: String(req.body.tuning_prompt ?? existing.tuning_prompt).trim(),
    learning_summary: String(req.body.learning_summary ?? existing.learning_summary).trim(),
    learning_count: Number(req.body.learning_count ?? existing.learning_count ?? 0),
  };

  const updated = await store.updateCompanyPersona(req.params.id, userId, {
    ...nextValues,
    analysis: buildPersonaAnalysis(nextValues),
    updated_at: nowIso(),
  });

  res.json(sanitizeCompanyPersona(updated));
});

app.put('/api/personas/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const existing = await store.findCompanyPersonaById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({ message: 'Company persona not found' });
  }

  const nextValues = {
    name: String(req.body.name ?? existing.name).trim(),
    company: String(req.body.company ?? existing.company ?? req.body.name ?? existing.name).trim(),
    tagline: String(req.body.tagline ?? existing.tagline).trim(),
    logo_url: String(req.body.logo_url ?? req.body.base_image_url ?? existing.logo_url).trim(),
    logo_placement: String(req.body.logo_placement ?? existing.logo_placement ?? 'none').trim() || 'none',
    preserve_original_logo: req.body.preserve_original_logo !== undefined ? req.body.preserve_original_logo !== false : existing.preserve_original_logo !== false,
    audience: String(req.body.audience ?? existing.audience).trim(),
    voice: String(req.body.voice ?? existing.voice).trim(),
    goals: String(req.body.goals ?? existing.goals).trim(),
    notes: String(req.body.notes ?? req.body.description ?? existing.notes).trim(),
    visual_style_instructions: String(req.body.visual_style_instructions ?? existing.visual_style_instructions).trim(),
    brand_primary_color: String(req.body.brand_primary_color ?? existing.brand_primary_color ?? '').trim(),
    brand_secondary_color: String(req.body.brand_secondary_color ?? existing.brand_secondary_color ?? '').trim(),
    brand_accent_color: String(req.body.brand_accent_color ?? existing.brand_accent_color ?? '').trim(),
    tuning_prompt: String(req.body.tuning_prompt ?? existing.tuning_prompt).trim(),
    learning_summary: String(req.body.learning_summary ?? existing.learning_summary).trim(),
    learning_count: Number(req.body.learning_count ?? existing.learning_count ?? 0),
  };

  const updated = await store.updateCompanyPersona(req.params.id, userId, {
    ...nextValues,
    analysis: buildPersonaAnalysis(nextValues),
    updated_at: nowIso(),
  });

  res.json(sanitizeCompanyPersona(updated));
});

app.delete('/api/company-personas/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const deleted = await store.deleteCompanyPersona(req.params.id, userId);

  if (!deleted) {
    return res.status(404).json({ message: 'Company persona not found' });
  }

  res.json({ ok: true });
});

app.post('/api/company-personas/:id/learn', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const existing = await store.findCompanyPersonaById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({ message: 'Company persona not found' });
  }

  const generatedSummary = summarizeGeneratedVariants(req.body?.variants);
  const manualFeedback = String(req.body?.feedback || '').trim();
  const nextLearningSummary = mergeLearningSummary(
    existing.learning_summary,
    [manualFeedback, generatedSummary].filter(Boolean).join(' ')
  );

  const nextValues = {
    name: existing.name,
    company: existing.company,
    tagline: existing.tagline,
    logo_url: existing.logo_url,
    logo_placement: existing.logo_placement || 'none',
    preserve_original_logo: existing.preserve_original_logo !== false,
    audience: existing.audience,
    voice: existing.voice,
    goals: existing.goals,
    notes: existing.notes,
    visual_style_instructions: existing.visual_style_instructions || '',
    tuning_prompt: existing.tuning_prompt || '',
    learning_summary: nextLearningSummary,
    learning_count: Number(existing.learning_count || 0) + 1,
  };

  const updated = await store.updateCompanyPersona(req.params.id, userId, {
    ...nextValues,
    analysis: buildPersonaAnalysis(nextValues),
    updated_at: nowIso(),
  });

  res.json(sanitizeCompanyPersona(updated));
});

const cloudinaryGravityMap = {
  'top-left': 'north_west',
  'top-center': 'north',
  'top-right': 'north_east',
  'center-left': 'west',
  'center': 'center',
  'center-right': 'east',
  'bottom-left': 'south_west',
  'bottom-center': 'south',
  'bottom-right': 'south_east',
};

app.post('/api/generate-text', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required for text generation' });
  }

  const settings = await store.getCreditSettings();
  const textCost = normalizeGenerationCost(settings.text_generation_cost, 1);
  let chargeResult = null;

  try {
    chargeResult = await chargeCreditsForGeneration({
      userId,
      amount: textCost,
      type: 'generation_text',
      note: `Text generation charge (${textCost} credit${textCost === 1 ? '' : 's'})`,
    });

    const variants = await generateTextVariants({ prompt });
    res.json({
      variants,
      credits: {
        charged: textCost,
        balance_after: normalizeCreditValue(chargeResult?.user?.credits_balance, normalizeCreditValue(req.user.credits_balance)),
      },
    });
  } catch (error) {
    if (chargeResult) {
      await refundGenerationCredits({
        userId,
        amount: textCost,
        type: 'generation_refund_text',
        note: 'Refund for failed text generation',
      });
    }

    const message = error.message || 'Text generation failed';
    const status = /insufficient credits/i.test(message) ? 402 : 500;
    res.status(status).json({ message });
  }
});

const imageWorker = new Worker('image-generation-jobs', async (job) => {
  const {
    jobId,
    prompt,
    size,
    logoUrl = '',
    logoPlacement = 'none',
  } = job.data || {};

  const existingJob = imageGenerationJobs.get(jobId);
  const startedAt = existingJob?.startedAt || Date.now();

  updateImageJob(jobId, {
    status: 'processing',
    phase: 'Submitting request to Azure image model',
    progress: 15,
  });

  const phaseTimer = setTimeout(() => {
    updateImageJob(jobId, {
      status: 'processing',
      phase: 'Waiting for Azure image model response',
      progress: 35,
    });
  }, 1500);

  try {
    const image = await generateImageWithAzure({
      prompt,
      size,
      logoUrl,
      logoPlacement,
    });

    clearTimeout(phaseTimer);

    const completedAt = Date.now();
    pushImageGenerationDuration(completedAt - startedAt);

    updateImageJob(jobId, {
      status: 'completed',
      phase: 'Image generated',
      progress: 100,
      completedAt,
      result: image,
    });

    if (store) {
      try {
        await store.saveImageGeneration({
          job_id: jobId,
          prompt,
          image_url: image?.image_url || null,
          revised_prompt: image?.revised_prompt || null,
          status: 'completed',
          created_at: nowIso(),
          completed_at: nowIso(),
        });
      } catch (dbError) {
        console.error('[IMAGE METADATA SAVE FAILED]', dbError);
      }
    }

    return image;
  } catch (error) {
    clearTimeout(phaseTimer);

    updateImageJob(jobId, {
      status: 'failed',
      phase: 'Image generation failed',
      completedAt: Date.now(),
      error: error.message || 'Image generation failed',
    });

    throw error;
  }
}, {
  connection,
  concurrency: 1,
});

imageWorker.on('completed', (job) => {
  console.log(`[IMAGE WORKER] completed job ${job?.data?.jobId || job?.id}`);
});

imageWorker.on('failed', (job, error) => {
  console.error(`[IMAGE WORKER] failed job ${job?.data?.jobId || job?.id}:`, error.message);
});

app.post('/api/generate-image', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const settings = await store.getCreditSettings();
  const imageCost = normalizeGenerationCost(settings.image_generation_cost, 3);
  let chargeResult = null;

  try {
    chargeResult = await chargeCreditsForGeneration({
      userId,
      amount: imageCost,
      type: 'generation_image',
      note: `Image generation charge (${imageCost} credit${imageCost === 1 ? '' : 's'})`,
    });

    const platform = req.body?.platform || null;
    const topic = String(req.body?.topic || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const companyPersona = req.body?.companyPersona || null;
    const aspectRatio = req.body?.aspectRatio || req.body?.aspect_ratio || null;
    const width = req.body?.width || null;
    const height = req.body?.height || null;
    const style = req.body?.style || null;
    const logoPlacement = String(req.body?.logoPlacement || '').trim();
    const useOriginalLogo = req.body?.useOriginalLogo !== false;
    const ragContext = String(req.body?.ragContext || '').trim();
    const keywords = String(req.body?.keywords || '').trim();
    const variantTitle = String(req.body?.variantTitle || '').trim();
    const variantContent = String(req.body?.variantContent || '').trim();

    if (!topic) {
      return res.status(400).json({ message: 'Topic is required for image generation' });
    }

    const prompt = buildImagePrompt({
      platform,
      topic,
      companyPersona: companyPersona ? {
        ...companyPersona,
        logoPlacementOverride: logoPlacement === 'persona-default'
          ? (companyPersona.logo_placement || companyPersona.logoPlacement || 'none')
          : (logoPlacement || companyPersona.logo_placement || companyPersona.logoPlacement || 'none'),
        useOriginalLogo,
      } : null,
      contentType,
      ragContext,
      keywords,
      variantTitle,
      variantContent,
    });

    const size = selectAzureImageSize({ platform, contentType, aspectRatio, width, height });

    if (req.body?.async !== false) {
      const resolvedLogoPlacement =
        logoPlacement === 'persona-default'
          ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
          : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none');
      
      const jobId = startImageGenerationJob({
        prompt,
        size,
        logoUrl: companyPersona?.logoUrl || companyPersona?.logo_url || '',
        logoPlacement: resolvedLogoPlacement,
        onFailed: async ({ error }) => {
          await refundGenerationCredits({
            userId,
            amount: imageCost,
            type: 'generation_refund_image',
            note: `Refund for failed image generation (${error?.message || 'unknown error'})`,
          });
        },
      });
      return res.status(202).json({
        jobId,
        prompt,
        size,
        status: getImageJobStatusPayload(imageGenerationJobs.get(jobId)),
        credits: {
          charged: imageCost,
          balance_after: normalizeCreditValue(chargeResult?.user?.credits_balance, normalizeCreditValue(req.user.credits_balance)),
        },
      });
    }

    const resolvedLogoPlacement =
      logoPlacement === 'persona-default'
        ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
        : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none');

    const image = await generateImageWithAzure({
      prompt,
      size,
      logoUrl: companyPersona?.logoUrl || companyPersona?.logo_url || '',
      logoPlacement: resolvedLogoPlacement,
    });
    res.json({
      prompt,
      size,
      ...image,
      credits: {
        charged: imageCost,
        balance_after: normalizeCreditValue(chargeResult?.user?.credits_balance, normalizeCreditValue(req.user.credits_balance)),
      },
    });
  } catch (error) {
    if (chargeResult) {
      await refundGenerationCredits({
        userId,
        amount: imageCost,
        type: 'generation_refund_image',
        note: 'Refund for failed image generation',
      });
    }

    const message = error.message || 'Image generation failed';
    const status = /insufficient credits/i.test(message) ? 402 : 500;
    res.status(status).json({ message });
  }
});

app.get('/api/generate-image/:jobId/status', authRequired, async (req, res) => {
  const job = imageGenerationJobs.get(String(req.params.jobId || '').trim());
  if (!job) {
    return res.status(404).json({ message: 'Image generation job not found' });
  }

  console.log("[IMAGE JOB STATUS]", job.id, "status:", job.status, "result:", job.result);
  return res.json(getImageJobStatusPayload(job));
});

app.post('/api/generate-video', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const settings = await store.getCreditSettings();
  const videoCost = normalizeGenerationCost(settings.video_generation_cost, 10);
  let chargeResult = null;

  try {
    chargeResult = await chargeCreditsForGeneration({
      userId,
      amount: videoCost,
      type: 'generation_video',
      note: `Video generation charge (${videoCost} credit${videoCost === 1 ? '' : 's'})`,
    });

    const platform = req.body?.platform || null;
    const topic = String(req.body?.topic || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const companyPersona = req.body?.companyPersona || null;
    const logoPlacement = String(req.body?.logoPlacement || '').trim();
    const useOriginalLogo = req.body?.useOriginalLogo !== false;
    const ragContext = String(req.body?.ragContext || '').trim();
    const keywords = String(req.body?.keywords || '').trim();
    const variantTitle = String(req.body?.variantTitle || '').trim();
    const variantContent = String(req.body?.variantContent || '').trim();

    if (!topic) {
      return res.status(400).json({ message: 'Topic is required for video generation' });
    }

    const prompt = buildVideoPrompt({
      platform,
      topic,
      companyPersona: companyPersona ? {
        ...companyPersona,
        logoPlacementOverride: logoPlacement === 'persona-default'
          ? (companyPersona.logo_placement || companyPersona.logoPlacement || 'none')
          : (logoPlacement || companyPersona.logo_placement || companyPersona.logoPlacement || 'none'),
        useOriginalLogo,
      } : null,
      contentType,
      ragContext,
      keywords,
      variantTitle,
      variantContent,
    });

    const resolvedLogoPlacement =
      logoPlacement === 'persona-default'
        ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
        : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none');

    const jobId = startVideoGenerationJob({
      prompt,
      logoUrl: companyPersona?.logoUrl || companyPersona?.logo_url || '',
      logoPlacement: resolvedLogoPlacement,
      onFailed: async ({ error }) => {
        await refundGenerationCredits({
          userId,
          amount: videoCost,
          type: 'generation_refund_video',
          note: `Refund for failed video generation (${error?.message || 'unknown error'})`,
        });
      },
    });

    res.status(202).json({
      prompt,
      video_id: jobId,
      status: 'queued',
      credits: {
        charged: videoCost,
        balance_after: normalizeCreditValue(chargeResult?.user?.credits_balance, normalizeCreditValue(req.user.credits_balance)),
      }, 
    });
  } catch (error) {
    if (chargeResult) {
      await refundGenerationCredits({
        userId,
        amount: videoCost,
        type: 'generation_refund_video',
        note: 'Refund for failed video generation',
      });
    }

    console.error('Video generation failed:', error?.message || error);
    const message = error.message || 'Video generation failed';
    const status = /insufficient credits/i.test(message) ? 402 : 500;
    res.status(status).json({ message });
  }
});

app.get('/api/video-status/:id', authRequired, async (req, res) => {
  try {
    const localJob = videoGenerationJobs.get(String(req.params.id || '').trim());
    if (localJob) {
      return res.json(getVideoJobStatusPayload(localJob));
    }

    const result = await getAzureVideoStatusById({ videoId: req.params.id });
    res.json(result);
    } catch (error) {
      console.error('Video status error:', error);

      return res.json({
        video_id: req.params.id,
        status: 'failed',
        phase: 'Azure video status check failed',
        retrying: false,
        error: error.message || 'Failed to fetch video status',
      });
    }
});

// Temporary debug endpoint: list in-memory video jobs (admin use only)
app.get('/api/debug/video-jobs', superAdminRequired, async (_req, res) => {
  try {
    const items = Array.from(videoGenerationJobs.values()).map(getVideoJobStatusPayload);
    res.json({ count: items.length, items });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to list debug video jobs' });
  }
});

// Temporary unauthenticated trigger for testing video job lifecycle (local debug only)
app.post('/api/debug/trigger-video', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || 'Test video generation prompt from debug endpoint').slice(0, 1000);
    const jobId = startVideoGenerationJob({ prompt, logoUrl: arthGangaLogoUrl, logoPlacement: 'top_left' });
    res.json({ message: 'Triggered video job', jobId });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to trigger debug video job' });
  }
});

app.get('/api/knowledge-sources', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const rows = await store.listKnowledgeSources(userId);
  res.json(rows.map((row) => ({ ...row, id: row.id || row._id?.toString?.() })));
});

app.get('/api/knowledge-sources/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const source = await store.findKnowledgeSourceById(req.params.id, userId);

  if (!source) {
    return res.status(404).json({ message: 'Knowledge source not found' });
  }

  res.json({ ...source, id: source.id || source._id?.toString?.() });
});

app.post('/api/knowledge-sources', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  const sourceType = String(req.body?.source_type || 'text').trim() || 'text';
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];

  if (!title || !content) {
    return res.status(400).json({ message: 'Title and content are required' });
  }

  const timestamp = nowIso();
  const source = await store.insertKnowledgeSource({
    user_id: userId,
    title,
    content,
    source_type: sourceType,
    tags,
    chunks: buildKnowledgeChunks(content),
    created_at: timestamp,
    updated_at: timestamp,
  });

  res.status(201).json({ ...source, id: source.id || source._id?.toString?.() });
});

app.post('/api/knowledge-sources/ingest-url', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const url = String(req.body?.url || '').trim();
  const sourceType = String(req.body?.source_type || 'text').trim() || 'text';
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];

  if (!url) {
    return res.status(400).json({ message: 'URL is required' });
  }

  try {
    const extracted = await extractTextFromUrl(url);
    if (!extracted.content) {
      return res.status(400).json({ message: 'No readable content found at the URL' });
    }

    const timestamp = nowIso();
    const source = await store.insertKnowledgeSource({
      user_id: userId,
      title: String(req.body?.title || extracted.title || url).trim(),
      content: extracted.content,
      source_type: sourceType,
      tags,
      source_url: url,
      ingestion_method: 'url',
      chunks: buildKnowledgeChunks(extracted.content),
      created_at: timestamp,
      updated_at: timestamp,
    });

    res.status(201).json({ ...source, id: source.id || source._id?.toString?.() });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to ingest URL' });
  }
});

app.post('/api/knowledge-sources/ingest-file', authRequired, upload.single('file'), async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const fileName = String(req.body?.fileName || req.file?.originalname || '').trim();
  const sourceType = String(req.body?.source_type || 'text').trim() || 'text';
  const ocrLanguages = normalizeOcrLanguages(req.body?.ocr_languages);
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : typeof req.body?.tags === 'string'
      ? req.body.tags.split(',').map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];

  if (!fileName || !req.file) {
    return res.status(400).json({ message: 'File upload is required' });
  }

  try {
    const timestamp = nowIso();
    const isImage = req.file.mimetype?.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(fileName);
    const initialContent = isImage ? '' : await extractTextFromBuffer({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName,
      ocrLanguages,
    });

    if (!isImage && !initialContent) {
      return res.status(400).json({ message: 'No readable content found in the uploaded file' });
    }

    const source = await store.insertKnowledgeSource({
      user_id: userId,
      title: String(req.body?.title || fileName).trim(),
      content: initialContent,
      source_type: sourceType,
      tags,
      source_file_name: fileName,
      ingestion_method: 'file',
      chunks: buildKnowledgeChunks(initialContent),
      ocr_status: isImage ? 'processing' : 'completed',
      ocr_languages: isImage ? ocrLanguages : null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const sourceId = source.id || source._id?.toString?.();

    if (isImage && sourceId) {
      const jobKey = `${userId}:${sourceId}`;
      if (!activeOcrJobs.has(jobKey)) {
        activeOcrJobs.set(jobKey, (async () => {
          try {
            const content = await extractTextFromBuffer({
              buffer: req.file.buffer,
              mimeType: req.file.mimetype,
              fileName,
              ocrLanguages,
            });

            await store.updateKnowledgeSource(sourceId, userId, {
              content,
              chunks: buildKnowledgeChunks(content),
              ocr_status: content ? 'completed' : 'empty',
              updated_at: nowIso(),
            });
          } catch (error) {
            await store.updateKnowledgeSource(sourceId, userId, {
              ocr_status: 'failed',
              ocr_error: error.message || 'OCR failed',
              updated_at: nowIso(),
            });
          } finally {
            activeOcrJobs.delete(jobKey);
          }
        })());
      }
    }

    res.status(201).json({ ...source, id: source.id || source._id?.toString?.() });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to ingest file' });
  }
});

app.patch('/api/knowledge-sources/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const existing = await store.findKnowledgeSourceById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({ message: 'Knowledge source not found' });
  }

  const title = String(req.body?.title ?? existing.title).trim();
  const content = String(req.body?.content ?? existing.content).trim();
  const sourceType = String(req.body?.source_type ?? existing.source_type ?? 'text').trim() || 'text';
  const tags = Array.isArray(req.body?.tags)
    ? req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : Array.isArray(existing.tags)
    ? existing.tags
    : [];

  const updated = await store.updateKnowledgeSource(req.params.id, userId, {
    title,
    content,
    source_type: sourceType,
    tags,
    chunks: buildKnowledgeChunks(content),
    updated_at: nowIso(),
  });

  res.json({ ...updated, id: updated.id || updated._id?.toString?.() });
});

app.delete('/api/knowledge-sources/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const deleted = await store.deleteKnowledgeSource(req.params.id, userId);

  if (!deleted) {
    return res.status(404).json({ message: 'Knowledge source not found' });
  }

  res.json({ ok: true });
});

app.post('/api/rag/context', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const query = String(req.body?.query || '').trim();

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  const knowledgeItems = await store.listKnowledgeSources(userId);
  const context = buildRagContext({ knowledgeItems, query, limit: 6 });
  res.json({ context, count: context ? context.split('\n').length : 0 });
});

app.get('/api/history', authRequired, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 10), 50);
  const before = String(req.query.before || '').trim();
  const userId = req.user.id || req.user._id.toString();
  const rows = await store.listHistoryPage({ user_id: userId }, 'created_date', limit, before || undefined);
  const serializedRows = rows.map(serializeHistoryListRow);
  const nextCursor = rows.length === limit ? rows[rows.length - 1]?.created_date || null : null;

  res.json({ items: serializedRows, nextCursor });
});

app.post('/api/history', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const payload = normalizeHistoryEntry({
    ...req.body,
    user_id: userId,
    user_name: req.user.full_name || req.user.email,
    user_email: req.user.email,
    status: req.body.status || 'completed',
  }, userId);

  const row = await store.upsertHistoryConversation(payload);
  res.status(201).json({ ...row, id: row.id || row._id?.toString?.() });
});

app.patch('/api/history/:id/delete', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  await store.updateHistoryStatus(req.params.id, userId);
  res.json({ ok: true });
});

app.get('/api/superadmin/metrics', superAdminRequired, async (_req, res) => {
  const users = await store.listUsers((user) => user.role !== 'superadmin');
  const rows = await store.listHistory({}, 'created_date', 200);
  res.json({ users, rows });
});

app.get('/api/superadmin/credits/settings', superAdminRequired, async (_req, res) => {
  const settings = await store.getCreditSettings();
  res.json(settings);
});

app.patch('/api/superadmin/credits/settings', superAdminRequired, async (req, res) => {
  const {
    default_signup_credits: defaultSignupCredits,
    text_generation_cost: textGenerationCost,
    image_generation_cost: imageGenerationCost,
    video_generation_cost: videoGenerationCost,
  } = req.body || {};

  const settings = await store.updateCreditSettings({
    defaultSignupCredits,
    textGenerationCost,
    imageGenerationCost,
    videoGenerationCost,
  });
  res.json(settings);
});

app.get('/api/superadmin/credits/users', superAdminRequired, async (_req, res) => {
  const users = await store.listUsers((user) => user.role !== 'superadmin');
  res.json({ users: users.map(sanitizeUser) });
});

app.get('/api/superadmin/credits/transactions', superAdminRequired, async (req, res) => {
  const userId = String(req.query.userId || '').trim();
  const transactions = await store.listCreditTransactions({ userId: userId || undefined, limit: 200 });
  res.json({ transactions: transactions.map(sanitizeCreditTransaction) });
});

app.post('/api/superadmin/credits/allocate', superAdminRequired, async (req, res) => {
  const { userId, amount, note, type } = req.body || {};
  if (!String(userId || '').trim()) {
    return res.status(400).json({ message: 'User id is required' });
  }

  try {
    const result = await store.allocateCredits({
      userId: String(userId).trim(),
      amount,
      note,
      type: String(type || 'manual_adjustment').trim() || 'manual_adjustment',
      createdBy: req.superAdmin.email || 'superadmin',
    });

    res.status(201).json({
      user: sanitizeUser(result.user),
      transaction: sanitizeCreditTransaction(result.transaction),
    });
  } catch (error) {
    const message = error.message || 'Unable to allocate credits';
    const status = /not found/i.test(message) ? 404 : /insufficient/i.test(message) ? 400 : 400;
    res.status(status).json({ message });
  }
});

app.get('/api/superadmin/support-requests', superAdminRequired, async (req, res) => {
  const status = String(req.query.status || '').trim();
  const requests = await store.listSupportRequests({ status, limit: 100 });

  res.json({
    items: requests.map((request) => ({
      id: request._id?.toString?.() || request.id,
      type: request.type || '',
      subject: request.subject || '',
      message: request.message || '',
      status: request.status || 'open',
      userName: request.user_name || '',
      userEmail: request.user_email || '',
      company: request.company || '',
      createdAt: request.created_at || '',
      updatedAt: request.updated_at || '',
    })),
  });
});

app.get('/api/admin/users', superAdminRequired, async (_req, res) => {
  const users = await store.listUsers((user) => user.role !== 'superadmin');
  res.json({ users: users.map(sanitizeUser) });
});

app.get('/api/admin/tickets', superAdminRequired, async (req, res) => {
  const status = String(req.query.status || '').trim();
  const requests = await store.listSupportRequests({ status, limit: 100 });

  res.json({
    items: requests.map((request) => ({
      id: request._id?.toString?.() || request.id,
      type: request.type || '',
      subject: request.subject || '',
      message: request.message || '',
      status: request.status || 'open',
      userName: request.user_name || '',
      userEmail: request.user_email || '',
      company: request.company || '',
      createdAt: request.created_at || '',
      updatedAt: request.updated_at || '',
    })),
  });
});

app.put('/api/admin/users/:id/credits', superAdminRequired, async (req, res) => {
  const { amount, note, type } = req.body || {};

  try {
    const result = await store.allocateCredits({
      userId: String(req.params.id || '').trim(),
      amount,
      note,
      type: String(type || 'manual_adjustment').trim() || 'manual_adjustment',
      createdBy: req.superAdmin.email || 'superadmin',
    });

    res.json({
      user: sanitizeUser(result.user),
      transaction: sanitizeCreditTransaction(result.transaction),
    });
  } catch (error) {
    const message = error.message || 'Unable to update user credits';
    const status = /not found/i.test(message) ? 404 : /insufficient/i.test(message) ? 400 : 400;
    res.status(status).json({ message });
  }
});

app.patch('/api/superadmin/users/:id/persona-limit', superAdminRequired, async (req, res) => {
  const { persona_limit: personaLimit } = req.body || {};

  try {
    const user = await store.updateUserPersonaLimit(req.params.id, personaLimit);
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    const message = error.message || 'Unable to update persona limit';
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ message });
  }
});

app.get('/api/superadmin/plans', superAdminRequired, async (_req, res) => {
  const plans = await store.listPlans();
  res.json(plans.map((plan) => ({ ...plan, id: plan.id || plan._id?.toString?.() })));
});

// ─── LinkedIn Ads Campaign Tracker Endpoints ─────────────────────────────────

function getMockLinkedInAnalytics(range) {
  let days = 30;
  if (range === '7d') days = 7;
  else if (range === '90d') days = 90;

  const campaigns = [
    { name: 'LinkedIn - Brand Awareness Q2', cplTarget: 320 },
    { name: 'LinkedIn - Lead Generation Tech Specs', cplTarget: 680 }, // Exceeds ₹500 to trigger alert
    { name: 'LinkedIn - Product Demo Video Ads', cplTarget: 410 },
    { name: 'LinkedIn - Retargeting Website Visitors', cplTarget: 220 }
  ];

  const rows = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const dateObj = new Date(now);
    dateObj.setDate(now.getDate() - i);
    const dateString = dateObj.toISOString().slice(0, 10);

    campaigns.forEach((camp) => {
      const baseImpressions = camp.name.includes('Brand') ? 8000 : 3000;
      const randFactor = 0.7 + Math.random() * 0.6;
      const impressions = Math.floor(baseImpressions * randFactor);

      const baseCtr = camp.name.includes('Video') ? 0.025 : 0.012;
      const ctrVal = parseFloat((baseCtr * (0.8 + Math.random() * 0.4) * 100).toFixed(2));
      const clicks = Math.floor(impressions * (ctrVal / 100));

      const baseCpc = camp.name.includes('Retargeting') ? 45 : 85;
      const spend = parseFloat((clicks * baseCpc * (0.9 + Math.random() * 0.2)).toFixed(2));

      const leadsRaw = spend / camp.cplTarget;
      const leads = Math.floor(leadsRaw * (0.8 + Math.random() * 0.4));
      const cpl = leads > 0 ? parseFloat((spend / leads).toFixed(2)) : null;

      rows.push({
        campaign: camp.name,
        date: dateString,
        creative: `${camp.name} - Ad Creative ${Math.floor(i / 10) + 1}`,
        imageUrl: '',
        impressions,
        clicks,
        ctr: ctrVal,
        spend,
        leads,
        cpl,
      });
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function getMockLinkedInCreatives() {
  const images = [
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&auto=format&fit=crop&q=60'
  ];

  return {
    creatives: [
      {
        name: 'Tech Specs Infographic',
        campaign: 'LinkedIn - Lead Generation Tech Specs',
        imageUrl: images[0],
        impressions: 45000,
        clicks: 810,
        ctr: 1.8,
        spend: 68850,
        leads: 102,
        cpl: 675
      },
      {
        name: 'Platform Demo Video Highlight',
        campaign: 'LinkedIn - Product Demo Video Ads',
        imageUrl: images[1],
        impressions: 120000,
        clicks: 3240,
        ctr: 2.7,
        spend: 113400,
        leads: 270,
        cpl: 420
      },
      {
        name: 'Growth Office Culture Image',
        campaign: 'LinkedIn - Brand Awareness Q2',
        imageUrl: images[2],
        impressions: 88000,
        clicks: 1056,
        ctr: 1.2,
        spend: 42240,
        leads: 132,
        cpl: 320
      },
      {
        name: 'Website Retargeting Carousel',
        campaign: 'LinkedIn - Retargeting Website Visitors',
        imageUrl: images[3],
        impressions: 32000,
        clicks: 768,
        ctr: 2.4,
        spend: 26880,
        leads: 128,
        cpl: 210
      }
    ]
  };
}

app.get('/api/linkedin/status', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (user && user.linkedin_connected) {
      return res.json({
        connected: true,
        accountName: user.linkedin_account_name || 'Connected User',
        adAccountName: user.linkedin_ad_account_name || 'Default Ad Account'
      });
    }
    res.json({ connected: false });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to check LinkedIn status' });
  }
});

app.post('/api/linkedin/disconnect', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    await store.updateUserById(userId, {
      linkedin_connected: false,
      linkedin_access_token: null,
      linkedin_account_name: null,
      linkedin_ad_account_name: null
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to disconnect LinkedIn' });
  }
});

app.post('/api/linkedin/simulate-connect', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    await store.updateUserById(userId, {
      linkedin_connected: true,
      linkedin_access_token: 'mock_token',
      linkedin_account_name: 'Acme Corp (Simulated)',
      linkedin_ad_account_name: 'Acme Leads Campaign (Simulated)'
    });
    res.json({
      success: true,
      connected: true,
      accountName: 'Acme Corp (Simulated)',
      adAccountName: 'Acme Leads Campaign (Simulated)'
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to simulate connection' });
  }
});

app.get('/api/linkedin/callback', async (req, res) => {
  const { code, state: userId, error, error_description } = req.query;
  const frontendUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';

  if (error || !code || !userId) {
    console.error('LinkedIn OAuth Callback Error:', error, error_description);
    return res.redirect(`${frontendUrl}/linkedinads?linkedin=error`);
  }

  try {
    const redirectUri = linkedinRedirectUri || `${req.protocol}://${req.get('host')}/api/linkedin/callback`;
    
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: linkedinClientId,
        client_secret: linkedinClientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    let accountName = 'LinkedIn Member';
    let adAccountName = 'Ad Account';
    let personUrn = '';

    try {
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        accountName = `${profile.given_name || ''} ${profile.family_name || ''}`.trim() || profile.name || accountName;
        if (profile.sub) {
          personUrn = `urn:li:person:${profile.sub}`;
        }
      }

      const adAccountsRes = await fetch('https://api.linkedin.com/v2/adAccounts?q=search', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (adAccountsRes.ok) {
        const adAccounts = await adAccountsRes.json();
        if (adAccounts.elements && adAccounts.elements.length > 0) {
          adAccountName = adAccounts.elements[0].name || adAccountName;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch LinkedIn profile details:', err);
    }

    await store.updateUserById(userId, {
      linkedin_connected: true,
      linkedin_access_token: accessToken,
      linkedin_account_name: accountName,
      linkedin_ad_account_name: adAccountName,
      linkedin_person_urn: personUrn
    });

    res.redirect(`${frontendUrl}/linkedinads?linkedin=connected`);
  } catch (err) {
    console.error('LinkedIn OAuth Callback exception:', err);
    res.redirect(`${frontendUrl}/linkedinads?linkedin=error`);
  }
});

app.get('/api/linkedin/analytics', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (!user || !user.linkedin_connected) {
      return res.status(400).json({ message: 'LinkedIn account is not connected' });
    }

    const range = req.query.range || '30d';

    let rows = [];
    if (user.linkedin_access_token === 'mock_token') {
      rows = getMockLinkedInAnalytics(range);
    }
    
    const totals = rows.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.clicks += r.clicks;
        acc.spend += r.spend;
        acc.leads += r.leads;
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0, leads: 0 }
    );

    totals.ctr = totals.impressions > 0 ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0;
    totals.cpl = totals.leads > 0 ? parseFloat((totals.spend / totals.leads).toFixed(2)) : null;
    totals.spend = parseFloat(totals.spend.toFixed(2));

    res.json({ rows, totals });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch analytics' });
  }
});

app.get('/api/linkedin/creatives', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (!user || !user.linkedin_connected) {
      return res.status(400).json({ message: 'LinkedIn account is not connected' });
    }

    let creatives = [];
    if (user.linkedin_access_token === 'mock_token') {
      const data = getMockLinkedInCreatives();
      creatives = data.creatives || [];
    }
    res.json({ creatives });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch creatives' });
  }
});

function getMockLinkedInOrganicPosts(range) {
  let days = 30;
  if (range === '7d') days = 7;
  else if (range === '90d') days = 90;

  const postsPool = [
    {
      text: "🚀 We are thrilled to launch Uden AI! Our new AI-driven marketing platform is designed to help growth managers scale campaigns effortlessly. Check out our website to learn more! #AI #Marketing #Growth",
      baseLikes: 120, baseComments: 24, baseShares: 15, baseImpressions: 5400
    },
    {
      text: "📊 5 Tips to Optimize your Paid Ad Campaigns: \n1. Refine target audience demographics\n2. Run dynamic A/B creatives\n3. Set automated budget alerts\n4. Benchmark CPC vs CPL\n5. Iterate weekly.\nRead more on our blog! #PaidAds #MarketingTips #Performance",
      baseLikes: 95, baseComments: 18, baseShares: 8, baseImpressions: 3800
    },
    {
      text: "🤝 Celebrating our new partnership with Creative Studio! Together, we're building the future of automated creative generation. Exciting features dropping next week! #CreativeOS #AI #BusinessDevelopment",
      baseLikes: 160, baseComments: 35, baseShares: 22, baseImpressions: 7200
    },
    {
      text: "💡 Why keeping a close eye on your Cost Per Lead (CPL) is crucial for startup growth. Read our latest thought leadership piece on how scaling companies manage ad spends without breaking the bank. #Startup #CPL #Finance",
      baseLikes: 78, baseComments: 12, baseShares: 5, baseImpressions: 2900
    },
    {
      text: "🏆 We are proud to be named one of the Top 10 Growth Marketing Tools of 2026! A huge thank you to our team and our amazing customers. We couldn't have done it without you! #Milestone #ThankYou #TeamUden",
      baseLikes: 210, baseComments: 45, baseShares: 30, baseImpressions: 9500
    }
  ];

  const now = new Date();
  const posts = [];

  let postCount = 5;
  if (days === 7) postCount = 2;
  else if (days === 90) postCount = 12;

  for (let i = 0; i < postCount; i++) {
    const postTemplate = postsPool[i % postsPool.length];
    
    const dateObj = new Date(now);
    const dayOffset = Math.floor((days / postCount) * i) + Math.floor(Math.random() * 2);
    dateObj.setDate(now.getDate() - dayOffset);
    const dateString = dateObj.toISOString().slice(0, 10);

    const randFactor = 0.8 + Math.random() * 0.4;
    const likes = Math.floor(postTemplate.baseLikes * randFactor);
    const comments = Math.floor(postTemplate.baseComments * randFactor);
    const shares = Math.floor(postTemplate.baseShares * randFactor);
    const impressions = Math.floor(postTemplate.baseImpressions * randFactor);
    
    const engagements = likes + comments + shares;
    const engagementRate = impressions > 0 ? parseFloat(((engagements / impressions) * 100).toFixed(2)) : 0;

    posts.push({
      id: `organic_${i}`,
      text: postTemplate.text,
      date: dateString,
      likes,
      comments,
      shares,
      impressions,
      engagementRate
    });
  }

  posts.sort((a, b) => b.date.localeCompare(a.date));
  return posts;
}

app.get('/api/linkedin/organic-posts', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (!user || !user.linkedin_connected) {
      return res.status(400).json({ message: 'LinkedIn account is not connected' });
    }

    const range = req.query.range || '30d';

    let userPosts = user.linkedin_posts || [];
    let accessToken = user.linkedin_access_token;
    let hasUpdates = false;

    // Try to update post stats if using a real connection
    if (accessToken && accessToken !== 'mock_token') {
      for (let i = 0; i < userPosts.length; i++) {
        const post = userPosts[i];
        if (post.id && !post.id.includes('mock_')) {
          try {
            const socialRes = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(post.id)}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0'
              }
            });
            if (socialRes.ok) {
              const socialData = await socialRes.json();
              const likes = socialData.likesSummary?.totalLikes || 0;
              const comments = socialData.commentsSummary?.totalComments || 0;
              
              if (post.likes !== likes || post.comments !== comments) {
                post.likes = likes;
                post.comments = comments;
                const engagements = likes + comments + (post.shares || 0);
                post.impressions = Math.max(post.impressions || 1, engagements);
                post.engagementRate = post.impressions > 0 
                  ? parseFloat(((engagements / post.impressions) * 100).toFixed(2)) 
                  : 0;
                hasUpdates = true;
              }
            } else {
              const errText = await socialRes.text();
              console.warn(`Failed to fetch social actions for post ${post.id}:`, errText);
            }
          } catch (err) {
            console.warn(`Error fetching social actions for post ${post.id}:`, err.message);
          }
        }
      }

      if (hasUpdates) {
        await store.updateUserById(userId, { linkedin_posts: userPosts });
      }
    }

    let posts = [];
    if (accessToken === 'mock_token') {
      const mockPosts = getMockLinkedInOrganicPosts(range);
      posts = [...userPosts, ...mockPosts];
    } else {
      posts = userPosts;
    }
    
    const totals = posts.reduce(
      (acc, p) => {
        acc.postsCount += 1;
        acc.likes += p.likes;
        acc.comments += p.comments;
        acc.shares += p.shares;
        acc.impressions += p.impressions;
        return acc;
      },
      { postsCount: 0, likes: 0, comments: 0, shares: 0, impressions: 0 }
    );

    const totalEngagements = totals.likes + totals.comments + totals.shares;
    totals.engagementRate = totals.impressions > 0 ? parseFloat(((totalEngagements / totals.impressions) * 100).toFixed(2)) : 0;

    res.json({ posts, totals });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch organic posts' });
  }
});

app.post('/api/linkedin/share', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (!user || !user.linkedin_connected) {
      return res.status(400).json({ message: 'LinkedIn account is not connected' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Post text is required' });
    }

    let accessToken = user.linkedin_access_token;
    let personUrn = user.linkedin_person_urn;

    // Fallback: fetch Person URN if missing
    if (!personUrn && accessToken && accessToken !== 'mock_token') {
      try {
        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile.sub) {
            personUrn = `urn:li:person:${profile.sub}`;
            await store.updateUserById(userId, { linkedin_person_urn: personUrn });
          }
        }
      } catch (err) {
        console.warn('Failed to retrieve profile URN on share fallback:', err);
      }
    }

    let postUrn = `urn:li:share:mock_${Date.now()}`;
    let isSimulated = true;

    if (accessToken && accessToken !== 'mock_token' && personUrn) {
      const ugcResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        }),
      });

      if (!ugcResponse.ok) {
        const errText = await ugcResponse.text();
        console.error('LinkedIn UGC Post API error:', errText);
        throw new Error(`LinkedIn share failed: ${errText}`);
      }

      const ugcData = await ugcResponse.json();
      postUrn = ugcData.id || postUrn;
      isSimulated = false;
    }

    const newPost = {
      id: postUrn,
      text,
      date: new Date().toISOString().slice(0, 10),
      likes: 0,
      comments: 0,
      shares: 0,
      impressions: 1,
      engagementRate: 0.0,
      isReal: !isSimulated,
    };

    const currentPosts = user.linkedin_posts || [];
    currentPosts.unshift(newPost);
    await store.updateUserById(userId, { linkedin_posts: currentPosts });

    res.json({ success: true, post: newPost });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to post on LinkedIn' });
  }
});

app.post('/api/linkedin/post/stats', authRequired, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id.toString();
    const user = await store.findUserById(userId);
    if (!user || !user.linkedin_connected) {
      return res.status(400).json({ message: 'LinkedIn account is not connected' });
    }

    const { postId, likes, comments, impressions } = req.body;
    if (!postId) {
      return res.status(400).json({ message: 'Post ID is required' });
    }

    const currentPosts = user.linkedin_posts || [];
    const post = currentPosts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Update stats
    post.likes = Math.max(0, parseInt(likes, 10) || 0);
    post.comments = Math.max(0, parseInt(comments, 10) || 0);
    post.impressions = Math.max(1, parseInt(impressions, 10) || 1);
    
    // Recalculate engagement rate
    const engagements = post.likes + post.comments + (post.shares || 0);
    post.impressions = Math.max(post.impressions, engagements); // Imp should be >= engagements
    post.engagementRate = post.impressions > 0 
      ? parseFloat(((engagements / post.impressions) * 100).toFixed(2)) 
      : 0;

    await store.updateUserById(userId, { linkedin_posts: currentPosts });

    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to update post stats' });
  }
});

const tryStartMongo = async () => {
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db(dbName);
  store = createMongoStore(db);
  await store.init();
  return client;
};
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const start = async () => {
  await tryStartMongo();
  await uploadArthGangaLogo();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Mongo API listening on http://0.0.0.0:${port}`);
    console.log(`Using MongoDB at ${mongoUri}`);
    console.log(`\n✓ MongoDB connected successfully!`);
    console.log(`✓ Open MongoDB Compass and connect to: ${mongoUri}`);
    console.log(`✓ Or visit http://localhost:${port} in your browser\n`);
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set PORT to a free port before starting the server.`);
      process.exit(1);
    }

    console.error('Failed to start HTTP server', error);
    process.exit(1);
  });
};

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
