import dotenv from 'dotenv';
if (typeof global !== 'undefined' && !global.DOMMatrix) {
  global.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';

import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { spawn } from 'child_process';
import { v2 as cloudinary } from 'cloudinary';
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

app.get(/^(?!\/(api|share)(?:\/|$)).*/, async (_req, res, next) => {
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
  user_email: entry.user_email || null,
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
  name: persona.name || persona.personaName || '',
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

const overlayLogoOnVideo = async ({
  videoBuffer,
  logoUrl,
  logoPlacement = 'bottom-right',
  fileNamePrefix = `video-${Date.now()}`,
}) => {
  const normalizedPlacement = String(logoPlacement || 'bottom-right')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();

  const resolvedPlacement =
    normalizedPlacement === 'persona-default'
      ? 'bottom-right'
      : normalizedPlacement;

  const positionMap = {
    'top-left': '24:24',
    'top-right': 'main_w-overlay_w-24:24',
    'bottom-left': '24:main_h-overlay_h-24',
    'bottom-right': 'main_w-overlay_w-24:main_h-overlay_h-24',
    center: '(main_w-overlay_w)/2:(main_h-overlay_h)/2',
  };

  const overlayPosition = positionMap[resolvedPlacement] || positionMap['bottom-right'];
  const logoBuffer = await fetchImageBufferFromUrl(logoUrl);

  const tempDir = path.join(process.cwd(), 'tmp');
  await fs.mkdir(tempDir, { recursive: true });

  const inputVideoPath = path.join(tempDir, `${fileNamePrefix}-input.mp4`);
  const inputLogoPath = path.join(tempDir, `${fileNamePrefix}-logo.png`);
  const outputVideoPath = path.join(tempDir, `${fileNamePrefix}-output.mp4`);

  await fs.writeFile(inputVideoPath, videoBuffer);
  await fs.writeFile(inputLogoPath, logoBuffer);

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', inputVideoPath,
      '-i', inputLogoPath,
      '-filter_complex', `[1:v]scale=180:-1[logo];[0:v][logo]overlay=${overlayPosition}:format=auto`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outputVideoPath,
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', reject);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });

  try {
    return await fs.readFile(outputVideoPath);
  } finally {
    await Promise.allSettled([
      fs.unlink(inputVideoPath),
      fs.unlink(inputLogoPath),
      fs.unlink(outputVideoPath),
    ]);
  }
};

const saveAzureVideoAsset = async ({
  videoId,
  variant = azureVideoDownloadVariant,
  logoUrl = '',
  logoPlacement = 'none',
}) => {
  const buffer = await downloadAzureVideoContent({ videoId, variant });

  let outputBuffer = buffer;

  if (logoUrl && logoPlacement && logoPlacement !== 'none') {
    try {
      outputBuffer = await overlayLogoOnVideo({
        videoBuffer: buffer,
        logoUrl,
        logoPlacement,
        fileNamePrefix: `${videoId}-${variant}`,
      });
    } catch (err) {
      console.warn('[VIDEO OVERLAY] FFmpeg overlay failed:', err?.message || err);
    }
  }

  return await uploadVideoBufferToS3({
    buffer: outputBuffer,
    mimeType: 'video/mp4',
    folder: 'videos',
    fileName: `${videoId}-${variant}.mp4`,
  });
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
  aspectRatio = '',
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

  const normalizedAspectRatio = String(aspectRatio || '').trim();

  const aspectRatioToSoraSize = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '720x720',
  };

  const soraSize = aspectRatioToSoraSize[normalizedAspectRatio] || '720x1280';

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
    seconds: normalizedDurationSeconds,
    size: soraSize,
  };

  let { response, data } = await requestVideo(requestBody);

  if (!response.ok && /duration/i.test(String(data?.error?.message || data?.message || ''))) {
    requestBody = {
      model: azureVideoModel,
      prompt,
      seconds: normalizedDurationSeconds,
      size: soraSize,
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
const OCR_AUTO_LANGUAGE = 'eng+spa+fra+deu+ita+por+nld';
const parsePdf = async (buffer) => {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result;
  } finally {
    await parser.destroy?.();
  }
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

  try {
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
  } catch (s3Err) {
    console.warn("AWS S3 logo upload failed, falling back to local file storage:", s3Err.message);
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
      console.log(`[LOGO UPLOAD] Saved logo locally (fallback): /uploads/${filename}`);
      return `/uploads/${filename}`;
    } catch (localErr) {
      console.error("Local file fallback failed for logo upload:", localErr);
      throw s3Err;
    }
  }
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
  const decodeHtml = (value) => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

  const getMetaContent = (name) => {
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escapedName}["'][^>]*>`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }

    return '';
  };

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  const metaText = [
    titleMatch ? decodeHtml(titleMatch[1]) : '',
    getMetaContent('description'),
    getMetaContent('og:title'),
    getMetaContent('og:description'),
    getMetaContent('twitter:title'),
    getMetaContent('twitter:description'),
  ].filter(Boolean).join(' ');

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
    content: [metaText, bodyText].filter(Boolean).join(' '),
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
    '4:5': '1024x1792',
    '1.91:1': '1792x1024',
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

const startVideoGenerationJob = ({ prompt, aspectRatio = '', logoUrl = '', logoPlacement = 'none', onCompleted, onFailed }) => {
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
        aspectRatio,
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

const runImageGenerationJobDirectly = async ({ jobId, prompt, size, logoUrl = '', logoPlacement = 'none', targetWidth = null, targetHeight = null, onCompleted, onFailed }) => {
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
      targetWidth,
      targetHeight,
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

const startImageGenerationJob = ({ prompt, size, logoUrl = '', logoPlacement = 'none', targetWidth = null, targetHeight = null, onCompleted, onFailed }) => {
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
    targetWidth,
    targetHeight,
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
      targetWidth,
      targetHeight,
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
      targetWidth,
      targetHeight,
    }).catch((error) => {
      console.warn(`[IMAGE JOB] Failed to add to imageQueue, running directly in-memory:`, error.message);
      void runImageGenerationJobDirectly({
        jobId,
        prompt,
        size,
        logoUrl,
        logoPlacement,
        targetWidth,
        targetHeight,
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

const overlayLogoOnImage = async ({
  imageUrl,
  logoUrl,
  logoPlacement = 'bottom-right',
  logoScale = 0.15,
}) => {
  const imageBuffer = await fetchImageBufferFromUrl(imageUrl);
  const logoBuffer = await fetchImageBufferFromUrl(logoUrl);

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const baseDimension = Math.min(
    metadata.width || 1024,
    metadata.height || 1024
  );

  const logoWidth = Math.round(baseDimension * logoScale);

  const resizedLogo = await sharp(logoBuffer)
    .resize({
      width: logoWidth,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

    const normalizedPlacement = String(logoPlacement || 'bottom-right')
      .trim()
      .replace(/_/g, '-')
      .toLowerCase();

  const resolvedPlacement =
    normalizedPlacement === 'persona-default'
      ? 'bottom-right'
      : normalizedPlacement;

  const gravityMap = {
    'top-left': 'northwest',
    'top-right': 'northeast',
    'bottom-left': 'southwest',
    'bottom-right': 'southeast',
    center: 'center',
  };

  const resizedLogoMetadata = await sharp(resizedLogo).metadata();
  const imageWidth = metadata.width || 1024;
  const imageHeight = metadata.height || 1024;
  const overlayWidth = resizedLogoMetadata.width || logoWidth;
  const overlayHeight = resizedLogoMetadata.height || logoWidth;
  const margin = 24;

  const positionMap = {
    'top-left': { left: margin, top: margin },
    'top-right': { left: imageWidth - overlayWidth - margin, top: margin },
    'bottom-left': { left: margin, top: imageHeight - overlayHeight - margin },
    'bottom-right': {
      left: imageWidth - overlayWidth - margin,
      top: imageHeight - overlayHeight - margin,
    },
    center: {
      left: Math.round((imageWidth - overlayWidth) / 2),
      top: Math.round((imageHeight - overlayHeight) / 2),
    },
  };

  const overlayPosition = positionMap[resolvedPlacement] || positionMap['bottom-right'];

  const outputBuffer = await image
    .composite([
      {
        input: resizedLogo,
        left: overlayPosition.left,
        top: overlayPosition.top,
      },
    ])
    .png()
    .toBuffer();

  return await uploadImageBufferToS3({
    buffer: outputBuffer,
    mimeType: 'image/png',
    folder: 'images',
  });
};

const resizeImageToExactDimensions = async ({ imageUrl, width, height }) => {
  const buffer = await fetchImageBufferFromUrl(imageUrl);

  const resizedBuffer = await sharp(buffer)
    .resize({
      width,
      height,
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  return await uploadImageBufferToS3({
    buffer: resizedBuffer,
    mimeType: 'image/png',
    folder: 'images',
  });
};

const generateImageWithAzure = async ({
  prompt,
  size = '1024x1024',
  logoUrl = '',
  logoPlacement = 'none',
  targetWidth = null,
  targetHeight = null,
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

  console.log('\n=== FINAL AZURE IMAGE PROMPT START ===');
  console.log(prompt);
  console.log('=== FINAL AZURE IMAGE PROMPT END ===\n');

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

if (finalImageUrl && activeLogoUrl && logoPlacement && logoPlacement !== 'none') {
  try {
    finalImageUrl = await overlayLogoOnImage({
      imageUrl: finalImageUrl,
      logoUrl: activeLogoUrl,
      logoPlacement,
      logoScale: 0.15,
    });
  } catch (err) {
    console.warn('[IMAGE OVERLAY] Sharp overlay failed:', err);
  }
}

if (finalImageUrl && targetWidth && targetHeight) {
  try {
    finalImageUrl = await resizeImageToExactDimensions({
      imageUrl: finalImageUrl,
      width: targetWidth,
      height: targetHeight,
    });
  } catch (resizeErr) {
    console.warn('[IMAGE RESIZE] Failed to resize to exact output dimensions:', resizeErr.message);
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

const userQuery = (userId) => {
  try {
    return { $in: [String(userId), new ObjectId(userId)] };
  } catch (e) {
    return String(userId);
  }
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
  async getCompanyByUserId(userId) {
    return await db.collection('companies').findOne({ user_id: userQuery(userId) });
  },
  async upsertCompany(userId, companyData) {
    const collection = db.collection('companies');
    const existing = await collection.findOne({ user_id: userQuery(userId) });

    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...companyData,
            user_id: existing.user_id,
            updated_at: nowIso(),
          },
        }
      );
      return await collection.findOne({ _id: existing._id });
    } else {
      const result = await collection.insertOne({
        ...companyData,
        user_id: String(userId),
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      return await collection.findOne({ _id: result.insertedId });
    }
  },
  async listBlogs(userId) {
    return await db.collection('blogs')
      .find({ user_id: userQuery(userId) })
      .sort({ updated_at: -1, created_at: -1 })
      .toArray();
  },
  async insertBlog(blog) {
    const result = await db.collection('blogs').insertOne(blog);
    return await db.collection('blogs').findOne({ _id: result.insertedId });
  },
  async listTopics(userId) {
    return await db.collection('topics')
      .find({ user_id: userQuery(userId) })
      .sort({ updated_at: -1, created_at: -1 })
      .toArray();
  },
  async insertTopic(topic) {
    const result = await db.collection('topics').insertOne(topic);
    return await db.collection('topics').findOne({ _id: result.insertedId });
  },
  async upsertResearchByTopicId(userId, topicId, researchData) {
    const timestamp = nowIso();
    const collection = db.collection('research');
    const existing = await collection.findOne({ user_id: userQuery(userId), topic_id: String(topicId) });

    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...researchData,
            user_id: existing.user_id,
            topic_id: String(topicId),
            updated_at: timestamp,
          },
        }
      );
      return await collection.findOne({ _id: existing._id });
    } else {
      const result = await collection.insertOne({
        ...researchData,
        user_id: String(userId),
        topic_id: String(topicId),
        created_at: timestamp,
        updated_at: timestamp,
      });
      return await collection.findOne({ _id: result.insertedId });
    }
  },
  async findResearchByTopicId(userId, topicId) {
    return await db.collection('research')
      .findOne({ user_id: userQuery(userId), topic_id: String(topicId) });
  },
  async listResearch(userId) {
    return await db.collection('research')
      .find({ user_id: userQuery(userId) })
      .sort({ updated_at: -1, created_at: -1 })
      .toArray();
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

    const query = { user_id: userQuery(entry.user_id) };
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
      { _id: new ObjectId(id), user_id: userQuery(userId) },
      { $set: { status: 'deleted', deleted_at: nowIso() } }
    );
    return await db.collection('content_history').findOne({ _id: new ObjectId(id) });
  },
  async listCompanyPersonas(userId) {
    return await db.collection('company_personas').find({ user_id: userQuery(userId) }).sort({ created_at: -1 }).toArray();
  },
  async countCompanyPersonas(userId) {
    return await db.collection('company_personas').countDocuments({ user_id: userQuery(userId) });
  },
  async countCompanies(userId) {
    return await db.collection('companies').countDocuments({ user_id: userQuery(userId) });
  },
  async findCompanyPersonaById(id, userId) {
    return await db.collection('company_personas').findOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
  },
  async insertCompanyPersona(persona) {
    const result = await db.collection('company_personas').insertOne(persona);
    return await db.collection('company_personas').findOne({ _id: result.insertedId });
  },
  async updateCompanyPersona(id, userId, updates) {
    await db.collection('company_personas').updateOne(
      { _id: new ObjectId(id), user_id: userQuery(userId) },
      { $set: updates }
    );
    return await db.collection('company_personas').findOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
  },
  async deleteCompanyPersona(id, userId) {
    const result = await db.collection('company_personas').deleteOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
    return result.deletedCount > 0;
  },
  async listKnowledgeSources(userId) {
    return await db.collection('knowledge_sources').find({ user_id: userQuery(userId) }).sort({ updated_at: -1 }).toArray();
  },
  async findKnowledgeSourceById(id, userId) {
    return await db.collection('knowledge_sources').findOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
  },
  async insertKnowledgeSource(source) {
    const result = await db.collection('knowledge_sources').insertOne(source);
    return await db.collection('knowledge_sources').findOne({ _id: result.insertedId });
  },
  async updateKnowledgeSource(id, userId, updates) {
    await db.collection('knowledge_sources').updateOne(
      { _id: new ObjectId(id), user_id: userQuery(userId) },
      { $set: updates }
    );
    return await db.collection('knowledge_sources').findOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
  },
  async deleteKnowledgeSource(id, userId) {
    const result = await db.collection('knowledge_sources').deleteOne({ _id: new ObjectId(id), user_id: userQuery(userId) });
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
let rawDb = null;

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
  let token = header.startsWith('Bearer ') ? header.slice(7) : (header || null);
  if (!token && req.query.token) {
    token = req.query.token;
  }

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




// Credit Allocation Costs
const COST_WEBSITE_CRAWL = 10;
const COST_RESEARCH_SYNTHESIS = 5;
const COST_CANONICAL_BLOG = 5;
const COST_PLATFORM_ADAPTATION = 5;
const COST_COVER_IMAGE = 3;
const COST_SEO_OPTIMIZE_PLATFORM = 5;
const COST_SEO_OPTIMIZE_BLOG = 5;



// AWS S3 Storage Helper
const uploadToS3 = async (buffer, fileName, mimeType) => {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn("AWS S3 credentials missing. Falling back to local file mock.");
    return `/uploads/${Date.now()}-${fileName}`;
  }
  try {
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    });
    const key = `${process.env.AWS_S3_FOLDER || 'growth-os'}/${Date.now()}-${fileName}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType
    }));
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
  } catch (s3Err) {
    console.warn("AWS S3 upload failed, falling back to local file storage:", s3Err.message);
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      const filename = `${Date.now()}-${fileName}`;
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, buffer);
      return `/uploads/${filename}`;
    } catch (localErr) {
      console.error("Local file fallback failed:", localErr);
      throw s3Err;
    }
  }
};


// Document Text Extraction Helper
const extractDocumentText = async (buffer, mimeType, fileName) => {
  const mime = String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    const data = await parsePdf(buffer);
    return data.text || '';
  }
  if (mime.includes('word') || mime.includes('officedocument') || name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  if (mime.includes('plain') || mime.includes('text') || name.endsWith('.txt')) {
    return buffer.toString('utf8');
  }
  
  // Resilient fallback: try mammoth first, then stringify
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (err) {
    return buffer.toString('utf8').replace(/[^\x20-\x7E\n]/g, '');
  }
};


const stripJsonWrapper = (text) => {
  if (!text) return '';
  let cleanText = text.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.slice(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.slice(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.slice(0, -3);
  }
  return cleanText.trim();
};

// Azure OpenAI AI Service Helper
const callAzureOpenAI = async (systemPrompt, userPrompt, temperature = 0.7) => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';

  if (!endpoint || !apiKey) {
    throw new Error('Azure OpenAI credentials missing');
  }

  const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const url = `${cleanEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
  const response = await axios.post(url, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_completion_tokens: 8000
  }, {
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
  });

  return response.data.choices[0].message.content;
};

const summarizeDocument = async (fileName, text) => {
  if (!text || text.trim() === '') {
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
${text}

Generate structured factual summary now:`;

  return await callAzureOpenAI(systemPrompt, userPrompt, 0.3);
};

const describeColorPalette = async (colors) => {
  try {
    const systemPrompt = "You are a Visual Identity Designer. Describe the brand color palette formed by these HEX colors in a single concise sentence (e.g., 'A color palette of dark blue and white' or 'A combination of warm coral orange and slate gray'). Respond ONLY with the sentence.";
    const userPrompt = `HEX colors: ${colors.join(', ')}`;
    const description = await callAzureOpenAI(systemPrompt, userPrompt, 0.3);
    return description.trim();
  } catch (err) {
    console.warn("Failed to describe color palette with AI:", err.message);
    return `A brand color palette consisting of ${colors.join(', ')}.`;
  }
};

const analyzeLogoColors = async (imageUrl, imageBuffer = null, contentType = '') => {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';

  if (!endpoint || !apiKey) {
    console.warn("Azure credentials missing for vision analysis.");
    return { colors: ['#f25b18', '#1c1c1e'], description: 'Default fallback palette.' };
  }

  let activeBuffer = imageBuffer;
  let activeContentType = contentType;

  // 1. Handle SVG files directly by parsing their hex colors
  if (activeContentType === 'image/svg+xml' && activeBuffer) {
    try {
      const svgText = Buffer.from(activeBuffer).toString('utf-8');
      const hexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;
      const matches = svgText.match(hexRegex) || [];
      const uniqueColors = [...new Set(matches.map(c => {
        let col = c.toLowerCase();
        if (col.length === 4) { // shorthand hex #fff -> #ffffff
          col = '#' + col[1] + col[1] + col[2] + col[2] + col[3] + col[3];
        }
        return col;
      }))];
      
      const hasWhite = /fill=["']white["']/i.test(svgText) || 
                       /stroke=["']white["']/i.test(svgText) || 
                       /fill:\s*white/i.test(svgText) || 
                       /stroke:\s*white/i.test(svgText) ||
                       /rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i.test(svgText);
                       
      const hasBlack = /fill=["']black["']/i.test(svgText) || 
                       /stroke=["']black["']/i.test(svgText) || 
                       /fill:\s*black/i.test(svgText) || 
                       /stroke:\s*black/i.test(svgText) ||
                       /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(svgText);

      if (hasWhite && !uniqueColors.includes('#ffffff')) {
        uniqueColors.push('#ffffff');
      }
      if (hasBlack && !uniqueColors.includes('#000000')) {
        uniqueColors.push('#000000');
      }

      const finalColors = uniqueColors.length > 0 ? uniqueColors : ['#f25b18', '#1c1c1e'];
      const desc = await describeColorPalette(finalColors);
      
      return {
        colors: finalColors.slice(0, 5),
        description: desc
      };
    } catch (svgErr) {
      console.warn("Failed to parse SVG logo colors:", svgErr.message);
    }
  }

  // 2. Fetch image if buffer is not provided
  if (!activeBuffer && imageUrl && imageUrl.startsWith('http')) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/*'
        }
      });
      if (response.status === 200) {
        activeBuffer = response.data;
        activeContentType = response.headers['content-type'] || 'image/png';
      }
    } catch (e) {
      console.warn("Failed to download image for base64 vision input:", e.message);
    }
  }

  // 3. Reject unsupported formats (like ico) or call Vision API for png/jpeg/webp/gif
  if (activeBuffer && activeContentType && activeContentType.startsWith('image/')) {
    if (activeContentType.includes('icon') || activeContentType.includes('microsoft')) {
      const desc = await describeColorPalette(['#f25b18', '#1c1c1e']);
      return { colors: ['#f25b18', '#1c1c1e'], description: desc };
    }

    const base64Data = Buffer.from(activeBuffer).toString('base64');
    const targetImageUrl = `data:${activeContentType};base64,${base64Data}`;

    const systemPrompt = `You are a Visual Identity Designer.
Analyze the company logo and identify the dominant brand colors.
Respond ONLY with a JSON object containing two fields:
1. "colors": an array of HEX strings of the top 3-5 dominant colors (e.g., ["#F25B18", "#181C25"])
2. "description": a concise, single-sentence description of the brand color palette (e.g., "A combination of warm coral orange, dark slate, and clean white accents.")
Ensure your output is raw JSON only.`;

    const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    const url = `${cleanEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

    try {
      const response = await axios.post(url, {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the dominant color palette from this logo.' },
              { type: 'image_url', image_url: { url: targetImageUrl } }
            ]
          }
        ],
        max_completion_tokens: 150
      }, {
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
      });

      let cleanText = response.data.choices[0].message.content.trim();
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();
      return JSON.parse(cleanText);
    } catch (err) {
      if (err.response && err.response.data) {
        console.error('[VISION ERROR DETAILS]:', JSON.stringify(err.response.data, null, 2));
      }
      console.error("Vision logo analysis failed:", err.message);
    }
  }

  const desc = await describeColorPalette(['#f25b18', '#1c1c1e']);
  return { colors: ['#f25b18', '#1c1c1e'], description: desc };
};

const extractBrandProfileAndPersonas = async (text) => {
  const systemPrompt = `You are an expert brand analyst at Growth OS.
Your task is to analyze the provided raw document text and extract details to populate a Company Profile and target Audience Personas.

You MUST extract the information and return it strictly as a single JSON object.
Do not include any markdown styling (like triple backticks followed by json) or introductory/concluding text. Only output the raw JSON object.

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
  const userPrompt = `Raw Document Content:\n${text.slice(0, 10000)}\n\nExtract Company and Persona details and return raw JSON now:`;
  const rawJson = await callAzureOpenAI(systemPrompt, userPrompt, 0.2);
  try {
    const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse brand analysis JSON:", rawJson);
    throw new Error("AI response was not in a valid JSON format");
  }
};

const generateCanonicalBlog = async (topic, brief, research) => {
  const systemPrompt = "You are a professional blog copywriter. Write a comprehensive, engaging canonical blog post based on the topic, brief, and research provided.";
  const userPrompt = `Topic: ${topic}\nBrief: ${JSON.stringify(brief)}\nResearch: ${research}\n\nWrite the blog post including a title:`;
  return await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
};

const suggestSEOKeywords = async (topicName, topicDetails, company) => {
  const systemPrompt = "You are a professional SEO copywriter and strategist. Given a topic name, detailed description, and company profile, generate 4 to 6 highly relevant, search-volume optimized SEO keywords. Return STRICTLY a valid JSON object with a keywords array.";
  const userPrompt = `Generate SEO keywords for:
COMPANY Name: ${company.companyName}
Industry: ${company.industry}
Description: ${company.productDescription}

TOPIC Name: ${topicName}
Details: ${topicDetails}

Return JSON with keywords array now:`;

  try {
    const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.6);
    let cleanText = responseText.trim();
    cleanText = stripJsonWrapper(cleanText);

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
};


const generateResearch = async (campaign, company, persona, knowledgeContext) => {
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
- Details: ${campaign.topicName}
Goal: ${campaign.goal || ''}
Keywords: ${campaign.keywords ? campaign.keywords.join(', ') : 'None'}

PERSONA Name: ${persona.personaName}
Tone: ${persona.tone}
Style: ${persona.writingStyle}
Audience: ${persona.audienceType}

${knowledgeContext ? `GROUNDING KNOWLEDGE BASE CONTEXT:\n${knowledgeContext}\n` : ''}

Generate JSON payload now:`;

  try {
    const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    let cleanText = responseText.trim();
    cleanText = stripJsonWrapper(cleanText);

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
};





const generateSEOBrief = async (topic, keywords) => {
  const systemPrompt = "You are an SEO strategist. Generate an SEO brief including keywords recommendations, structure, and word count target.";
  const userPrompt = `Generate an SEO brief for topic: "${topic}" with focus keywords: "${keywords}"`;
  return await callAzureOpenAI(systemPrompt, userPrompt, 0.5);
};

const analyzeBlogSEO = async (content) => {
  const systemPrompt = "You are an SEO auditor. Analyze the blog content and return an audit containing: score (0-100), readability, and recommendations.";
  const userPrompt = `Analyze this blog post:\n\n${content}`;
  const raw = await callAzureOpenAI(systemPrompt, userPrompt, 0.5);
  return { score: 85, readability: 'Good', details: raw };
};

const calculateSeoAnalysis = (title = '', content = '', metaDescription = '', keyword = '', slug = '', companyWebsite = '', platformName = '') => {
  const cleanTitle = String(title || '').trim();
  const cleanContent = String(content || '').trim();
  const cleanMeta = String(metaDescription || '').trim();
  const cleanKeyword = String(keyword || '').trim();
  const cleanSlug = String(slug || '').trim();
  
  const keywordLower = cleanKeyword.toLowerCase();

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
      scoreWordCount = Math.round((wordCount / 800) * 10);
    } else {
      recommendations.push(`Condense the article length to fit the target of 800-1200 words (current: ${wordCount} words).`);
      scoreWordCount = 5;
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
    scoreH2Count = h2Count * 5;
  }

  // 8. H3 Count (10 points)
  let scoreH3Count = 0;
  let h3Count = 0;
  if (cleanContent) {
    const h3MarkdownMatches = cleanContent.match(/^###\s+/mg);
    const h3HtmlMatches = cleanContent.match(/<h3>/mig);
    h3Count = (h3MarkdownMatches ? h3MarkdownMatches.length : 0) + (h3HtmlMatches ? h3HtmlMatches.length : 0);
  }
  checks.h3Count = h3Count;
  if (h3Count >= 1) {
    scoreH3Count = 10;
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

  // Links
  const mdLinkRegex = /(?<!\!)\[.*?\]\((.*?)\)/g;
  const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']/gi;
  const allLinks = [];
  let match;
  if (cleanContent) {
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
    if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) continue;
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

  // 13. Image Alt Text (No longer required - marked as green by default)
  checks.imageAltText = true;
  let scoreImageAlt = 0;

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

  // Readability
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

  // Legacy scores for backward compatibility
  let titleScore = 0;
  if (cleanTitle) {
    titleScore += 40;
    if (keywordLower && cleanTitle.toLowerCase().includes(keywordLower)) titleScore += 40;
    if (cleanTitle.length >= 40 && cleanTitle.length <= 70) titleScore += 20;
  }
  let metaScore = 0;
  if (cleanMeta) {
    metaScore += 40;
    if (keywordLower && cleanMeta.toLowerCase().includes(keywordLower)) metaScore += 40;
    if (cleanMeta.length >= 120 && cleanMeta.length <= 160) metaScore += 20;
  }
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
    score: seoScore,
    seoScore,
    readabilityScore,
    keywordDensity,
    titleScore,
    metaScore,
    headingScore,
    readability: readabilityScore >= 80 ? 'Excellent' : readabilityScore >= 60 ? 'Good' : 'Needs Work',
    checks,
    recommendations,
    details: 'Automated SEO metrics audit complete.'
  };
};

const generateBrandedImagePrompt = async (blog, company, campaign, persona, platform) => {
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
  let outlineContext = '';
  if (blog.outline && blog.outline.length > 0) {
    outlineContext = blog.outline.map(s => s.sectionTitle).join(', ');
  }
  const contentSnippet = blog.content ? blog.content.replace(/<[^>]*>/g, '').substring(0, 500) : '';
  const blogContext = `Title: ${blog.title}\nSummary: ${blog.metaDescription || 'N/A'}\nOutline Sections: ${outlineContext || 'N/A'}\nExcerpt: ${contentSnippet || 'N/A'}`;
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
   - Specify a distinct artistic style (e.g. detailed minimalist 3D render, modern flat vector, papercut layered art, line-art graphic, abstract glassmorphism shapes).`;
  const userPrompt = `Create a DALL-E image prompt for a blog post:
BLOG CONTEXT:
${blogContext}
TOPIC: ${topic}
PLATFORM: ${platform || 'General'}`;
  try {
    const promptText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    return promptText.trim();
  } catch (err) {
    console.warn('[IMAGE PROMPT WARNING] Failed to generate prompt, using fallback:', err.message);
    const fallbackColors = brandColors.length > 0 
      ? `with a color palette strictly limited to the brand colors: ${brandColors.join(', ')} (${brandColorsDescription})` 
      : 'using professional dark cyan and grey highlights';
    return `Minimalist 3D isometric vector illustration depicting a creative visual metaphor for "${blog.title}", ${fallbackColors}, flat solid background, no text, no letters, no typography.`;
  }
};

const generateImage = async (prompt, dimensions = '1024x1024') => {
  const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_IMAGE_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!apiKey || !endpoint) {
    throw new Error('Azure OpenAI credentials or Image API Key are missing from the environment configuration.');
  }
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
  console.log(`[DALL-E] Calling image generation at endpoint: ${url}`);
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
      timeout: 90000
    }
  );
  const imageUrl = response.data?.data?.[0]?.url;
  const b64Json = response.data?.data?.[0]?.b64_json;
  if (imageUrl) return imageUrl;
  if (b64Json) return `data:image/png;base64,${b64Json}`;
  throw new Error('No image URL returned from DALL-E.');
};

const generatePlatformBlog = async (blogContent, platform) => {
  const systemPrompt = `You are a social media copywriter. Adapt the following blog post to a ${platform} social media post format.`;
  const userPrompt = `Adapt this blog post:\n\n${blogContent}`;
  return await callAzureOpenAI(systemPrompt, userPrompt, 0.8);
};


// Bing Search / Research Engine Helper
const searchWebResearch = async (topic) => {
  const apiKey = process.env.BING_SEARCH_API_KEY;
  if (!apiKey) {
    console.warn("Bing Search API Key missing. Falling back to AI-only research synthesis.");
    return `AI Generated Web Synthesis: Research on "${topic}" - focused on market analysis, core trends, and user interests.`;
  }
  try {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(topic)}&count=5`;
    const response = await axios.get(url, { headers: { 'Ocp-Apim-Subscription-Key': apiKey } });
    const results = response.data?.webPages?.value || [];
    return results.map(r => `Source: ${r.name}\nSnippet: ${r.snippet}\nURL: ${r.url}`).join('\n\n');
  } catch (e) {
    console.error("Bing Search failed:", e.message);
    return `AI Generated Web Synthesis: Research on "${topic}" - fallback due to search API error.`;
  }
};

const synthesizeTopicResearch = async (topic, searchResults) => {
  const systemPrompt = "You are a research analyst. Synthesize the provided search results and create a structured research report containing market insights, audience pain points, and content angles.";
  const userPrompt = `Synthesize the following search results for topic: "${topic}":\n\n${searchResults}`;
  return await callAzureOpenAI(systemPrompt, userPrompt, 0.5);
};


// =========================================================================
// newly integrated Brand Setup & Blog Studio API endpoints
// =========================================================================

// Helpers

const extractLogoUrlFromHtml = (html, baseUrl) => {
  try {
    const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
                      html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    if (iconMatch && iconMatch[1]) {
      let iconUrl = iconMatch[1];
      if (!iconUrl.startsWith('http')) {
        const base = new URL(baseUrl);
        iconUrl = new URL(iconUrl, base.origin).toString();
      }
      return iconUrl;
    }
  } catch {}
  return null;
};


const cleanHtmlToText = (html) => {
  if (!html) return '';

  let metaText = '';
  try {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      metaText += `Page Title: ${titleMatch[1].trim()}\n`;
    }

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
    // Ignore
  }

  let text = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '');
  text = text.replace(/<head[^>]*>([\s\S]*?)<\/head>/gi, '');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<li>/gi, '\n* ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'");
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n+/g, '\n\n');
  
  let result = text.trim();
  if (metaText) {
    result = `${metaText}\n${text}`;
  }
  return result.trim();
};


// 1. Company endpoints
app.get('/api/company', authRequired, async (req, res) => {
  const company = await rawDb.collection('companies').findOne({ user_id: req.user._id });
  if (!company) {
    return res.status(200).json({ success: true, data: null });
  }
  res.json({ success: true, data: { ...company, id: company._id.toString() } });
});

app.post('/api/company', authRequired, async (req, res) => {
  try {
    const { 
      companyName, 
      website, 
      brandVoice, 
      targetAudience,
      industry,
      productDescription,
      competitors,
      logo,
      brandColors,
      brandColorsDescription
    } = req.body;

    const company = {
      user_id: req.user._id,
      companyName: companyName || '',
      website: website || '',
      brandVoice: brandVoice || '',
      targetAudience: targetAudience || '',
      industry: industry || '',
      productDescription: productDescription || '',
      competitors: competitors || [],
      logo: logo || '',
      brandColors: logo === '' ? [] : (brandColors || []),
      brandColorsDescription: logo === '' ? '' : (brandColorsDescription || ''),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const result = await rawDb.collection('companies').insertOne(company);
    const created = await rawDb.collection('companies').findOne({ _id: result.insertedId });
    
    // Link to user profile
    await rawDb.collection('users').updateOne({ _id: req.user._id }, { $set: { companyId: result.insertedId } });
    
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/company/:id', authRequired, async (req, res) => {
  try {
    const { 
      companyName, 
      website, 
      brandVoice, 
      targetAudience,
      industry,
      productDescription,
      competitors,
      logo,
      brandColors,
      brandColorsDescription
    } = req.body;

    const updates = {
      companyName: companyName || '',
      website: website || '',
      brandVoice: brandVoice || '',
      targetAudience: targetAudience || '',
      industry: industry || '',
      productDescription: productDescription || '',
      competitors: competitors || [],
      logo: logo || '',
      brandColors: logo === '' ? [] : (brandColors || []),
      brandColorsDescription: logo === '' ? '' : (brandColorsDescription || ''),
      updated_at: new Date().toISOString()
    };

    let companyId;
    if (req.params.id && req.params.id !== 'undefined' && req.params.id !== 'null' && ObjectId.isValid(req.params.id)) {
      companyId = new ObjectId(req.params.id);
    } else {
      const existing = await rawDb.collection('companies').findOne({ user_id: req.user._id });
      if (existing) {
        companyId = existing._id;
      }
    }

    if (companyId) {
      await rawDb.collection('companies').updateOne(
        { _id: companyId, user_id: req.user._id },
        { $set: updates }
      );
    } else {
      const result = await rawDb.collection('companies').insertOne({
        ...updates,
        user_id: req.user._id,
        created_at: new Date().toISOString()
      });
      companyId = result.insertedId;
      await rawDb.collection('users').updateOne({ _id: req.user._id }, { $set: { companyId: result.insertedId } });
    }

    const updated = await rawDb.collection('companies').findOne({ _id: companyId });
    res.json({ success: true, data: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/company/upload-logo', authRequired, upload.single('logo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No logo file provided' });
  }
  try {
    const s3Url = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    await rawDb.collection('companies').updateOne(
      { user_id: req.user._id },
      { $set: { logoUrl: s3Url, updated_at: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ success: true, logoUrl: s3Url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/company/delete-logo', authRequired, async (req, res) => {
  await rawDb.collection('companies').updateOne(
    { user_id: req.user._id },
    { $unset: { logo: '', logoUrl: '' }, $set: { updated_at: new Date().toISOString() } }
  );
  res.json({ success: true });
});

// 2. Personas endpoints
app.get('/api/personas', authRequired, async (req, res) => {
  const list = await rawDb.collection('company_personas').find({ user_id: req.user._id }).sort({ created_at: -1 }).toArray();
  res.json({ success: true, data: list.map(p => ({ ...p, id: p._id.toString() })) });
});

app.post('/api/personas', authRequired, async (req, res) => {
  try {
    const { 
      name, 
      personaName, 
      tone, 
      voice, 
      title, 
      writingStyle, 
      audienceType, 
      audience, 
      description, 
      notes 
    } = req.body;

    const persona = {
      user_id: req.user._id,
      personaName: personaName || name || '',
      tone: tone || voice || title || '',
      writingStyle: writingStyle || '',
      audienceType: audienceType || audience || '',
      description: description || notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const result = await rawDb.collection('company_personas').insertOne(persona);
    const created = await rawDb.collection('company_personas').findOne({ _id: result.insertedId });
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/personas/:id', authRequired, async (req, res) => {
  try {
    const { 
      name, 
      personaName, 
      tone, 
      voice, 
      title, 
      writingStyle, 
      audienceType, 
      audience, 
      description, 
      notes 
    } = req.body;

    const updates = {
      personaName: personaName || name || '',
      tone: tone || voice || title || '',
      writingStyle: writingStyle || '',
      audienceType: audienceType || audience || '',
      description: description || notes || '',
      updated_at: new Date().toISOString()
    };

    await rawDb.collection('company_personas').updateOne(
      { _id: new ObjectId(req.params.id), user_id: req.user._id },
      { $set: updates }
    );
    const updated = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/personas/:id', authRequired, async (req, res) => {
  await rawDb.collection('company_personas').deleteOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
  res.json({ success: true });
});

// 3. Reference Sources / Knowledge endpoints
app.get('/api/knowledge', authRequired, async (req, res) => {
  const list = await rawDb.collection('knowledge_sources').find({ user_id: req.user._id }).sort({ updated_at: -1 }).toArray();
  res.json({ success: true, data: list.map(k => ({ ...k, id: k._id.toString() })) });
});

// Helper check shell company profile before operations
const checkOrCreateShellCompany = async (userId) => {
  const company = await rawDb.collection('companies').findOne({ user_id: userId });
  if (!company) {
    const shell = {
      user_id: userId,
      companyName: 'Pending Setup',
      website: '',
      brandVoice: [],
      targetAudience: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const result = await rawDb.collection('companies').insertOne(shell);
    await rawDb.collection('users').updateOne({ _id: userId }, { $set: { companyId: result.insertedId } });
    return result.insertedId;
  }
  return company._id;
};

app.post('/api/knowledge/upload', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }
  try {
    await checkOrCreateShellCompany(req.user._id);
    const text = await extractDocumentText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const summary = await summarizeDocument(req.file.originalname, text);
    const fileUrl = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);

    const doc = {
      user_id: req.user._id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      fileUrl,
      fileType: 'file',
      extractedText: text,
      summaryText: summary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await rawDb.collection('knowledge_sources').insertOne(doc);
    const created = await rawDb.collection('knowledge_sources').findOne({ _id: result.insertedId });
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/knowledge/crawl', authRequired, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  const userId = req.user.id || req.user._id.toString();
  let crawlChargeResult = null;
  try {
    await checkOrCreateShellCompany(req.user._id);

    crawlChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: COST_WEBSITE_CRAWL,
      type: 'website_crawl',
      note: `Website crawl charge (${COST_WEBSITE_CRAWL} credits)`,
    });

    const cleanUrl = url.trim();
    const response = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 10000
    });
    const html = response.data || '';
    
    // Clean html text
    const text = cleanHtmlToText(html);

    const cleanDomain = cleanUrl.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
    const documentName = `${cleanDomain} Website Context`;

    const summary = await summarizeDocument(documentName, text);
    
    // Extract Logo and Colors
    let logoUrl = '';
    let brandColors = [];
    let brandColorsDescription = '';
    try {
      const rawLogoUrl = extractLogoUrlFromHtml(html, cleanUrl);
      if (rawLogoUrl) {
        console.log(`[CRAWLER] Downloading logo image: ${rawLogoUrl}`);
        const logoResponse = await axios.get(rawLogoUrl, {
          responseType: 'arraybuffer',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/*'
          }
        });
        const contentType = logoResponse.headers['content-type'] || '';
        if (logoResponse.status === 200 && contentType.startsWith('image/')) {
          const filename = rawLogoUrl.split('/').pop() || 'logo.png';
          logoUrl = await uploadToS3(logoResponse.data, filename, contentType);
          console.log(`[CRAWLER] Logo uploaded successfully to S3: ${logoUrl}`);

          // Extract colors using Vision / SVG fallback
          const colorAnalysis = await analyzeLogoColors(logoUrl, logoResponse.data, contentType);
          brandColors = colorAnalysis.colors || [];
          brandColorsDescription = colorAnalysis.description || '';
          console.log(`[CRAWLER] Vision analyzed brand colors: ${JSON.stringify(brandColors)}`);
        } else {
          console.log(`[CRAWLER] Logo URL is not a valid image. Content-Type: ${contentType}`);
        }
      }
    } catch (logoErr) {
      console.warn("[CRAWLER WARNING] Logo extraction or color analysis failed:", logoErr.message);
    }

    const doc = {
      user_id: req.user._id,
      fileName: documentName,
      fileSize: Buffer.byteLength(html),
      mimeType: 'text/html',
      fileUrl: cleanUrl,
      fileType: 'url',
      extractedText: text,
      summaryText: summary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const result = await rawDb.collection('knowledge_sources').insertOne(doc);
    
    // Analyze brand
    const brandData = await extractBrandProfileAndPersonas(text);
    
    // Update company profile
    const companyInfo = brandData.company || {};
    await rawDb.collection('companies').updateOne(
      { user_id: req.user._id },
      {
        $set: {
          companyName: companyInfo.companyName || cleanDomain,
          website: cleanUrl || companyInfo.website || '',
          industry: companyInfo.industry || '',
          productDescription: companyInfo.productDescription || '',
          targetAudience: companyInfo.targetAudience || '',
          brandVoice: companyInfo.brandVoice || '',
          competitors: companyInfo.competitors || [],
          logo: logoUrl || '',
          brandColors: brandColors.length > 0 ? brandColors : [],
          brandColorsDescription: brandColorsDescription || '',
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    // Seed target personas
    if (Array.isArray(brandData.personas)) {
      await rawDb.collection('company_personas').deleteMany({ user_id: req.user._id });
      const list = brandData.personas.map(p => ({
        user_id: req.user._id,
        personaName: p.personaName || '',
        tone: p.tone || '',
        writingStyle: p.writingStyle || '',
        audienceType: p.audienceType || '',
        description: p.description || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      await rawDb.collection('company_personas').insertMany(list);
    }

    const created = await rawDb.collection('knowledge_sources').findOne({ _id: result.insertedId });
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    if (crawlChargeResult) {
      await refundGenerationCredits({
        userId,
        amount: COST_WEBSITE_CRAWL,
        type: 'website_crawl_refund',
        note: `Refund for failed website crawl (${COST_WEBSITE_CRAWL} credits)`,
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/knowledge/:id/extract', authRequired, async (req, res) => {
  try {
    const doc = await rawDb.collection('knowledge_sources').findOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    const brandData = await extractBrandProfileAndPersonas(doc.extractedText);
    const companyInfo = brandData.company || {};
    await rawDb.collection('companies').updateOne(
      { user_id: req.user._id },
      {
        $set: {
          companyName: companyInfo.companyName || '',
          website: (doc.fileType === 'url' ? doc.fileUrl : (companyInfo.website || doc.fileUrl || '')),
          industry: companyInfo.industry || '',
          productDescription: companyInfo.productDescription || '',
          targetAudience: companyInfo.targetAudience || '',
          brandVoice: companyInfo.brandVoice || '',
          competitors: companyInfo.competitors || [],
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );
    if (Array.isArray(brandData.personas)) {
      await rawDb.collection('company_personas').deleteMany({ user_id: req.user._id });
      const list = brandData.personas.map(p => ({
        user_id: req.user._id,
        personaName: p.personaName || '',
        tone: p.tone || '',
        writingStyle: p.writingStyle || '',
        audienceType: p.audienceType || '',
        description: p.description || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
      await rawDb.collection('company_personas').insertMany(list);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/knowledge/:id/summary', authRequired, async (req, res) => {
  const { summaryText } = req.body;
  await rawDb.collection('knowledge_sources').updateOne(
    { _id: new ObjectId(req.params.id), user_id: req.user._id },
    { $set: { summaryText, updated_at: new Date().toISOString() } }
  );
  const updated = await rawDb.collection('knowledge_sources').findOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true, data: { ...updated, id: updated._id.toString() } });
});

app.delete('/api/knowledge/:id', authRequired, async (req, res) => {
  await rawDb.collection('knowledge_sources').deleteOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
  res.json({ success: true });
});

// 4. Blog Topics endpoints
app.get('/api/topics', authRequired, async (req, res) => {
  try {
    const list = await rawDb.collection('topics').find({ user_id: req.user._id }).sort({ created_at: -1 }).toArray();
    const populated = await Promise.all(list.map(async (t) => {
      let persona = null;
      const pId = t.personaId || t.audienceId;
      if (pId && (pId instanceof ObjectId || (typeof pId === 'string' && pId.length === 24))) {
        try {
          persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pId) });
          if (persona) {
            persona = { ...persona, id: persona._id.toString() };
          }
        } catch (e) {
          console.warn("Failed to populate personaId:", pId, e.message);
        }
      }
      return {
        ...t,
        id: t._id.toString(),
        personaId: persona,
        audienceId: pId
      };
    }));
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/topics', authRequired, async (req, res) => {
  try {
    const { topicName, topic, keywords, goal, personaId, audienceId } = req.body;
    const newTopic = {
      user_id: req.user._id,
      topicName: topicName || '',
      topic: topic || '',
      keywords: keywords || [],
      goal: goal || '',
      personaId: personaId || audienceId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const result = await rawDb.collection('topics').insertOne(newTopic);
    const created = await rawDb.collection('topics').findOne({ _id: result.insertedId });
    
    // Populate personaId for response
    let persona = null;
    const pId = created.personaId;
    if (pId && (pId instanceof ObjectId || (typeof pId === 'string' && pId.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pId) });
        if (persona) {
          persona = { ...persona, id: persona._id.toString() };
        }
      } catch (e) {
        console.warn("Failed to populate personaId in post topic:", pId, e.message);
      }
    }
    
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString(), personaId: persona } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/topics/suggest-keywords', authRequired, async (req, res) => {
  try {
    const { topicName, topic } = req.body;
    if (!topicName || !topic) {
      return res.status(400).json({ success: false, error: 'Topic name and details are required' });
    }
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id }) || {
      companyName: 'UDEN Tech',
      industry: 'EdTech',
      brandVoice: 'Professional',
      productDescription: 'AI career placement'
    };
    const suggested = await suggestSEOKeywords(topicName, topic, company);
    res.json({ success: true, data: suggested });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/topics/:id', authRequired, async (req, res) => {
  try {
    const { topicName, topic, keywords, goal, personaId, audienceId } = req.body;
    const updates = {
      topicName: topicName || '',
      topic: topic || '',
      keywords: keywords || [],
      goal: goal || '',
      personaId: personaId || audienceId || null,
      updated_at: new Date().toISOString()
    };
    await rawDb.collection('topics').updateOne(
      { _id: new ObjectId(req.params.id), user_id: req.user._id },
      { $set: updates }
    );
    const updated = await rawDb.collection('topics').findOne({ _id: new ObjectId(req.params.id) });
    
    // Populate personaId for response
    let persona = null;
    const pId = updated.personaId;
    if (pId && (pId instanceof ObjectId || (typeof pId === 'string' && pId.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pId) });
        if (persona) {
          persona = { ...persona, id: persona._id.toString() };
        }
      } catch (e) {
        console.warn("Failed to populate personaId in put topic:", pId, e.message);
      }
    }
    
    res.json({ success: true, data: { ...updated, id: updated._id.toString(), personaId: persona } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/topics/:id', authRequired, async (req, res) => {
  await rawDb.collection('topics').deleteOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
  res.json({ success: true });
});

// 5. Research endpoints
app.get('/api/research/:topicId', authRequired, async (req, res) => {
  const research = await rawDb.collection('researches').findOne({
    $or: [
      { topicId: req.params.topicId },
      { topic_id: req.params.topicId }
    ],
    user_id: req.user._id
  });
  res.json({ success: true, data: research ? { ...research, id: research._id.toString() } : null });
});

app.post('/api/research/generate', authRequired, async (req, res) => {
  try {
    const { topicId } = req.body;
    if (!topicId) {
      return res.status(400).json({ success: false, error: 'Topic ID is required' });
    }

    // 1. Fetch Topic details
    const topic = await rawDb.collection('topics').findOne({ _id: new ObjectId(topicId), user_id: req.user._id });
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // 2. Fetch Company details
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id }) || {
      companyName: 'UDEN Tech',
      industry: 'Employment Services',
      brandVoice: 'Supportive, career-focused',
      productDescription: 'Career guidance platform'
    };

    // 3. Fetch Persona details
    const pIdStr = topic.personaId || topic.audienceId;
    let persona = null;
    if (pIdStr && (pIdStr instanceof ObjectId || (typeof pIdStr === 'string' && pIdStr.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pIdStr) });
      } catch (e) {
        console.warn("Failed to query personaId in research:", pIdStr, e.message);
      }
    }
    if (!persona) {
      persona = {
        personaName: 'General Audience',
        tone: 'Professional',
        writingStyle: 'Direct',
        audienceType: 'B2C'
      };
    }

    // 4. Fetch Knowledge Base files
    const docs = await rawDb.collection('knowledge_sources').find({ user_id: req.user._id }).limit(3).toArray();
    let knowledgeContext = '';
    if (docs && docs.length > 0) {
      knowledgeContext = docs.map(doc => {
        const content = doc.summaryText || (doc.extractedText ? (doc.extractedText.slice(0, 1000) + '...') : '');
        return '[Grounding Material: ' + doc.fileName + ']\n' + content;
      }).join('\n\n');
    }

    // 5. Generate research synthesis via AI
    const synthesized = await generateResearch(topic, company, persona, knowledgeContext);

    // 6. Save/upsert to researches collection
    const researchRecord = {
      user_id: req.user._id,
      topicId: topicId,
      topic_id: topicId,
      topicName: topic.topicName,
      news: synthesized.news,
      keywords: synthesized.keywords,
      competitorAnalysis: synthesized.competitorAnalysis,
      suggestedAngles: synthesized.suggestedAngles,
      created_at: new Date().toISOString()
    };

    await rawDb.collection('researches').updateOne(
      { topicId: topicId, user_id: req.user._id },
      { $set: researchRecord },
      { upsert: true }
    );

    const created = await rawDb.collection('researches').findOne({ topicId: topicId, user_id: req.user._id });
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    console.error("Market research generation failed:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Blogs endpoints
const mapBlogDocument = (b) => {
  if (!b) return null;
  return {
    ...b,
    id: b._id.toString(),
    createdAt: b.createdAt || b.created_at,
    updatedAt: b.updatedAt || b.updated_at
  };
};

app.get('/api/blogs', authRequired, async (req, res) => {
  const list = await rawDb.collection('blogs').find({ user_id: req.user._id }).sort({ updated_at: -1 }).toArray();
  res.json({ success: true, data: list.map(mapBlogDocument) });
});

app.get('/api/blogs/:id', authRequired, async (req, res) => {
  const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
  if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });
  res.json({ success: true, data: mapBlogDocument(blog) });
});

app.post('/api/blogs/generate', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const blogGenerationCost = COST_RESEARCH_SYNTHESIS + COST_CANONICAL_BLOG;
  let blogChargeResult = null;
  try {
    const { topicId, customAngle } = req.body;
    if (!topicId) {
      return res.status(400).json({ success: false, error: 'Topic ID is required' });
    }

    // 1. Fetch Topic details
    const topic = await rawDb.collection('topics').findOne({ _id: new ObjectId(topicId), user_id: req.user._id });
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    blogChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: blogGenerationCost,
      type: 'blog_generation',
      note: `Canonical blog generation incl. SEO market research (${blogGenerationCost} credits)`,
    });

    // 2. Fetch Company details
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id }) || {
      companyName: 'UDEN Tech',
      industry: 'Employment Services',
      brandVoice: 'Supportive, career-focused',
      productDescription: 'Career guidance platform'
    };

    // 3. Fetch Persona details
    const pIdStr = topic.personaId || topic.audienceId;
    let persona = null;
    if (pIdStr && (pIdStr instanceof ObjectId || (typeof pIdStr === 'string' && pIdStr.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: pIdStr instanceof ObjectId ? pIdStr : new ObjectId(pIdStr) });
      } catch (e) {
        console.warn("Failed to query personaId in blog generation:", pIdStr, e.message);
      }
    }
    if (!persona) {
      persona = {
        personaName: 'General Audience',
        tone: 'Professional',
        writingStyle: 'Direct',
        audienceType: 'B2C'
      };
    }

    // 4. Fetch Research details
    const research = await rawDb.collection('researches').findOne({ 
      $or: [
        { topicId: topicId },
        { topic_id: topicId }
      ],
      user_id: req.user._id 
    }) || {
      news: 'Recent industry shifts show expanding career tech automation.',
      keywords: [{ keyword: topic.topicName, volume: 'High', difficulty: 'Medium', intent: 'Informational' }],
      competitorAnalysis: 'Legacy players fail to offer guided transitions.',
      suggestedAngles: ['Guide to ' + topic.topicName]
    };

    // 5. Fetch Grounding context
    const docs = await rawDb.collection('knowledge_sources').find({ user_id: req.user._id }).limit(3).toArray();
    let knowledgeContext = '';
    if (docs && docs.length > 0) {
      knowledgeContext = docs.map(doc => {
        const content = doc.summaryText || (doc.extractedText ? (doc.extractedText.slice(0, 1000) + '...') : '');
        return '[Grounding Material: ' + doc.fileName + ']\n' + content;
      }).join('\n\n');
    }

    // 6. Build SEO Brief (simple fallback/AI helper)
    const resolvedKeyword = topic.keywords && topic.keywords.length > 0 ? topic.keywords[0] : topic.topicName;
    const seoBrief = {
      primaryKeyword: resolvedKeyword,
      secondaryKeywords: [resolvedKeyword + ' tips', resolvedKeyword + ' guide'],
      searchIntent: 'Informational',
      h1Suggestion: 'The Definitive Guide to ' + resolvedKeyword,
      h2Suggestions: ['Why ' + resolvedKeyword + ' Matters', 'Implementing ' + resolvedKeyword + ' Successfully'],
      recommendedWordCount: 1000
    };

    // 7. Generate blog content using AI
    const systemPrompt = `You are a Principal Content Strategist and Copywriter at Growth OS.
Write a comprehensive, engaging canonical blog post based on campaign criteria, target persona, and synthesized research data.

CRITICAL CONTENT REQUIREMENTS:
1. WORD COUNT: The generated content MUST target approximately 1000 words. Keep it strictly between 800 and 1200 words.
2. TONE: Adhere strictly to the requested persona tone guidelines: "${persona.tone}".
3. TARGET AUDIENCE: Write content directly addressing the needs, pain points, and terminology of: "${persona.audienceType}".
4. SEO OPTIMIZATION: Seamlessly integrate the primary keyword "${resolvedKeyword}" naturally throughout the content. You MUST include "${resolvedKeyword}" in the H1 title, in the meta description, in the URL slug, in the first paragraph, and naturally throughout the text body (ideal density is 1.0% to 2.5%).
5. STRUCTURE: The content MUST contain:
   - An H1 heading at the very beginning of the content.
   - A minimum of 4 H2 headings throughout the body.
   - At least two H3 subheadings (Markdown '###' format) nested within H2 sections.
   - An FAQ section towards the end of the post under an H3 header (e.g. "### Frequently Asked Questions") containing at least 2 questions and answers.
   - A concluding section at the end under an H2 header containing a standard conclusion keyword (e.g., "Conclusion", "Key Takeaways", "Summary").
   - Short paragraphs for readability.
   - Practical examples illustrating key points.
   - At least one internal/relative link (e.g. [internal link text](/dashboard) or similar relative path) integrated naturally. You MUST wrap all links in bold markdown syntax (e.g. "**[Link Text](/dashboard)**") to highlight them.
   - At least one external link to an authoritative source (e.g. [Google Search](https://search.google.com/search-console/about)) integrated naturally. You MUST wrap all links in bold markdown syntax (e.g. "**[Google Search](https://search.google.com/search-console/about)**") to highlight them.
   - CRITICAL IMAGE RULE: Do NOT include any images, image tags, or markdown image references (e.g., '![Alt Text](url)') in the content under any circumstances. Keep the post text-only.
${customAngle ? `CRITICAL TARGET ANGLE REQUIREMENT: You MUST write a completely distinct and unique blog post based on this specific copy angle/title hook: "${customAngle}". The H1 title, outline structure (H2/H3 headings), and body paragraphs must be fully tailored and customized to focus on this angle, ensuring it does not look like other articles on the same topic.\n` : ''}

Your response MUST be returned strictly in a valid JSON object format matching the exact structure below. Do not wrap the JSON payload in markdown backticks or any other decorators.

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
PRIMARY KEYWORD: "${resolvedKeyword}"
CAMPAIGN Focus: ${topic.topic}
Goal: ${topic.goal}

PERSONA Name: ${persona.personaName}
Tone: ${persona.tone}
Writing Style: ${persona.writingStyle}

RESEARCH DATA SUMMARY:
- News Feeds: ${research.news ? research.news.slice(0, 500) : 'N/A'}
- Competitor Gaps: ${research.competitorAnalysis ? research.competitorAnalysis.slice(0, 500) : 'N/A'}
- Targeted keywords: ${research.keywords ? research.keywords.map(k => k.keyword).join(', ') : 'N/A'}

${knowledgeContext ? 'GROUNDING KNOWLEDGE BASE CONTEXT:\n' + knowledgeContext + '\n' : ''}

Generate JSON payload now:`;

    const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    let cleanText = responseText.trim();
    cleanText = stripJsonWrapper(cleanText);

    const blogPayload = JSON.parse(cleanText);
    if (!blogPayload.title || !blogPayload.content) {
      throw new Error('Sourced AI JSON is missing title or content.');
    }

    const finalTitle = blogPayload.title;
    const finalMeta = blogPayload.metaDescription || '';
    const finalContent = blogPayload.content;
    const finalSlug = blogPayload.slug || finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const finalCategory = blogPayload.category || 'General';

    const seoMetrics = calculateSeoAnalysis(finalTitle, finalContent, finalMeta, resolvedKeyword, finalSlug, company?.website || '');

    const blogRecord = {
      user_id: req.user._id,
      companyId: company._id || null,
      topicId: topicId,
      title: finalTitle,
      metaDescription: finalMeta,
      outline: (blogPayload.outline || []).map(item => typeof item === 'string' ? { sectionTitle: item, talkingPoints: [] } : item),
      content: finalContent,
      status: 'draft',
      keyword: resolvedKeyword,
      targetAudience: persona.audienceType,
      tone: persona.tone,
      slug: finalSlug,
      keywordCategory: finalCategory,
      seoScore: seoMetrics.seoScore,
      seoAnalysis: seoMetrics,
      seoBrief: seoBrief,
      wordCount: finalContent.split(/\s+/).filter(Boolean).length,
      versions: [
        {
          version: 1,
          title: finalTitle,
          metaDescription: finalMeta,
          content: finalContent,
          seoScore: seoMetrics.seoScore,
          createdAt: new Date()
        }
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save/upsert to blogs collection
    await rawDb.collection('blogs').updateOne(
      { topicId: topicId, user_id: req.user._id },
      { $set: blogRecord },
      { upsert: true }
    );

    const created = await rawDb.collection('blogs').findOne({ topicId: topicId, user_id: req.user._id });
    res.status(201).json({ success: true, data: mapBlogDocument(created) });
  } catch (err) {
    console.error("Blog generation failed:", err.message);
    if (blogChargeResult) {
      await refundGenerationCredits({
        userId,
        amount: blogGenerationCost,
        type: 'blog_generation_refund',
        note: `Refund for failed blog generation (${blogGenerationCost} credits)`,
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/blogs/:id', authRequired, async (req, res) => {
  try {
    const { title, metaDescription, content, status, publishDate, author, keywordCategory, keyword } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    
    if (title !== undefined) updates.title = title;
    if (metaDescription !== undefined) updates.metaDescription = metaDescription;
    if (content !== undefined) updates.content = content;
    if (status !== undefined) updates.status = status;
    if (publishDate !== undefined) {
      updates.publishDate = publishDate ? new Date(publishDate).toISOString() : null;
    }
    if (author !== undefined) updates.author = author;
    if (keywordCategory !== undefined) updates.keywordCategory = keywordCategory;
    if (keyword !== undefined) updates.keyword = keyword;

    // Load current blog to fill in any missing fields for SEO analysis
    const current = await rawDb.collection('blogs').findOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
    if (!current) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const finalTitle = title !== undefined ? title : current.title;
    const finalContent = content !== undefined ? content : current.content;
    const finalMeta = metaDescription !== undefined ? metaDescription : current.metaDescription;
    const finalKeyword = keyword !== undefined ? keyword : current.keyword;
    
    // Recalculate slug if title changed
    if (title) {
      updates.slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }
    const finalSlug = updates.slug || current.slug;

    // Recalculate SEO analysis
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id });
    const companyWebsite = company?.website || '';
    const seoMetrics = calculateSeoAnalysis(finalTitle, finalContent, finalMeta, finalKeyword, finalSlug, companyWebsite);
    
    updates.seoScore = seoMetrics.seoScore;
    updates.seoAnalysis = seoMetrics;
    updates.wordCount = finalContent.split(/\s+/).filter(Boolean).length;

    // Push new version to history if title or content changed
    const hasChanged = (title && title !== current.title) || (content && content !== current.content);
    if (hasChanged) {
      const nextVersion = (current.versions && current.versions.length > 0)
        ? Math.max(...current.versions.map(v => v.version)) + 1
        : 1;

      const newVersionEntry = {
        version: nextVersion,
        title: finalTitle,
        metaDescription: finalMeta,
        content: finalContent,
        seoScore: seoMetrics.seoScore,
        createdAt: new Date()
      };

      await rawDb.collection('blogs').updateOne(
        { _id: new ObjectId(req.params.id), user_id: req.user._id },
        { 
          $set: updates,
          $push: { versions: newVersionEntry }
        }
      );
    } else {
      await rawDb.collection('blogs').updateOne(
        { _id: new ObjectId(req.params.id), user_id: req.user._id },
        { $set: updates }
      );
    }

    const updated = await rawDb.collection('blogs').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: mapBlogDocument(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET blog versions
app.get('/api/blogs/:id/versions', authRequired, async (req, res) => {
  try {
    const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });
    res.json({ success: true, data: blog.versions || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore blog version
app.post('/api/blogs/:id/restore/:version', authRequired, async (req, res) => {
  try {
    const blogIdStr = req.params.id;
    const versionNum = parseInt(req.params.version, 10);

    const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(blogIdStr), user_id: req.user._id });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });

    const targetVersion = (blog.versions || []).find(v => v.version === versionNum);
    if (!targetVersion) {
      return res.status(404).json({ success: false, error: `Version ${versionNum} not found` });
    }

    const updates = {
      title: targetVersion.title,
      metaDescription: targetVersion.metaDescription || '',
      content: targetVersion.content,
      updated_at: new Date().toISOString()
    };

    updates.slug = targetVersion.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const targetKeyword = blog.keyword || '';
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id });
    const companyWebsite = company?.website || '';
    const seoMetrics = calculateSeoAnalysis(updates.title, updates.content, updates.metaDescription, targetKeyword, updates.slug, companyWebsite);
    
    updates.seoScore = seoMetrics.seoScore;
    updates.seoAnalysis = seoMetrics;
    updates.wordCount = updates.content.split(/\s+/).filter(Boolean).length;

    const nextVersion = (blog.versions && blog.versions.length > 0)
      ? Math.max(...blog.versions.map(v => v.version)) + 1
      : 1;

    const newVersionEntry = {
      version: nextVersion,
      title: updates.title,
      metaDescription: updates.metaDescription,
      content: updates.content,
      seoScore: updates.seoScore,
      createdAt: new Date()
    };

    await rawDb.collection('blogs').updateOne(
      { _id: new ObjectId(blogIdStr), user_id: req.user._id },
      { 
        $set: updates,
        $push: { versions: newVersionEntry }
      }
    );

    const updated = await rawDb.collection('blogs').findOne({ _id: new ObjectId(blogIdStr) });
    res.json({ success: true, data: mapBlogDocument(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST blog auto-optimize
app.post('/api/blogs/:id/optimize', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  let blogOptimizeChargeResult = null;
  try {
    const blogIdStr = req.params.id;
    const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(blogIdStr), user_id: req.user._id });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });

    blogOptimizeChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: COST_SEO_OPTIMIZE_BLOG,
      type: 'blog_seo_optimize',
      note: `Canonical blog SEO optimization (${COST_SEO_OPTIMIZE_BLOG} credits)`,
    });

    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id });
    const companyWebsite = company?.website || '';

    const oldScore = blog.seoScore || 0;
    let currentScore = oldScore;
    let title = blog.title || '';
    let content = blog.content || '';
    let metaDescription = blog.metaDescription || '';
    let slug = blog.slug || '';
    let seoMetrics = blog.seoAnalysis || calculateSeoAnalysis(title, content, metaDescription, blog.keyword, slug, companyWebsite);
    let recommendations = seoMetrics.recommendations || [];

    let iteration = 0;
    const history = [];
    let improvements = [];
    let optimized = false;

    // Run optimization loop up to 2 times if score < 80
    while (currentScore < 80 && iteration < 2) {
      iteration++;
      const systemPrompt = `You are a World-Class SEO Expert, Content Strategist, and Copywriter.
Your task is to optimize the provided canonical blog post to improve its SEO score to 80+ (target 90-100).
You will analyze the current blog title, meta description, content, target keyword, and the failed SEO checks/recommendations provided.

You MUST optimize:
1. Title: Ensure the target keyword is included naturally. Optimize length to be between 40 and 70 characters.
2. Meta Description: Ensure it contains the target keyword. Optimize length to be between 120 and 160 characters.
3. Heading Structure: Ensure there is exactly one H1 heading at the start of the content (Markdown '#' format) containing the target keyword. Include at least two H2 headings (Markdown '##' format) to structure the content, and at least one H3 heading (Markdown '###' format).
4. Keyword Placement: Integrate the target keyword naturally in the title, meta description, H1 heading, first paragraph, and throughout the body copy (ideal density is 1.0% to 2.5%).
5. FAQ Section: Add a structured FAQ section at the end of the content to address common user queries if missing or improve it. Use a heading like "### Frequently Asked Questions" or similar.
6. Internal Linking: Suggest and integrate at least one relevant internal/relative link (e.g. [internal link text](/path/to/page) or [dashboard](/dashboard) or similar relative path) in the body content. You MUST wrap all links in bold markdown syntax (e.g. "**[Link Text](/path/to/page)**") to highlight them.
7. External Linking: Add at least one external link to authoritative sources (e.g. [authoritative source](https://example.com/source)) in the body content. You MUST wrap all links in bold markdown syntax (e.g. "**[authoritative source](https://example.com/source)**") to highlight them.
8. Images: Ensure that image markdown tags (e.g. ![Alt text](url)) are present and that all of them have descriptive, non-empty alt text.
9. Word Count: Expand the body content to reach the target of 800 - 1200 words. Keep it comprehensive, deep-dive, and engaging.
10. Conclusion Section: Ensure there is a conclusion section (e.g. "### Conclusion" or "## Key Takeaways") at the end of the content.

You MUST respond strictly in a valid JSON object format matching the exact structure below. Do not wrap it in markdown codeblocks.

Required JSON Structure:
{
  "title": "The optimized, highly compelling blog title",
  "metaDescription": "The optimized, engaging meta description (under 160 characters)",
  "content": "The complete, optimized blog content in Markdown format (800-1200 words) containing the H1, H2s, H3s, FAQ, conclusion, links, and alt-texted images.",
  "improvements": [
    "Added target keyword to the blog title",
    "Expanded content length to meet the SEO target"
  ]
}`;

      const userPrompt = `Optimize the following blog post:
TARGET KEYWORD: "${blog.keyword || ''}"
CURRENT SEO SCORE: ${currentScore}
FAILED CHECKS & RECOMMENDATIONS:
${recommendations.map(r => `- ${r}`).join('\n')}

CURRENT TITLE: "${title}"
CURRENT META DESCRIPTION: "${metaDescription}"
CURRENT SLUG: "${slug}"

CURRENT CONTENT:
${content}

Generate the optimized JSON payload now:`;

      try {
        const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
        let cleanText = responseText.trim();
        cleanText = stripJsonWrapper(cleanText);
        const optResult = JSON.parse(cleanText);

        if (optResult.title && optResult.content) {
          title = optResult.title;
          metaDescription = optResult.metaDescription || '';
          content = optResult.content;
          improvements = improvements.concat(optResult.improvements || []);
          slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
          
          seoMetrics = calculateSeoAnalysis(title, content, metaDescription, blog.keyword, slug, companyWebsite);
          currentScore = seoMetrics.seoScore;
          recommendations = seoMetrics.recommendations || [];
          optimized = true;
        }
      } catch (err) {
        console.error('Optimization iteration failed:', err);
        break;
      }
    }

    if (optimized) {
      const updates = {
        title,
        metaDescription,
        content,
        slug,
        seoScore: currentScore,
        seoAnalysis: seoMetrics,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        updated_at: new Date().toISOString()
      };

      const nextVersion = (blog.versions && blog.versions.length > 0)
        ? Math.max(...blog.versions.map(v => v.version)) + 1
        : 1;

      const newVersionEntry = {
        version: nextVersion,
        title,
        metaDescription,
        content,
        seoScore: currentScore,
        createdAt: new Date()
      };

      await rawDb.collection('blogs').updateOne(
        { _id: new ObjectId(blogIdStr), user_id: req.user._id },
        { 
          $set: updates,
          $push: { versions: newVersionEntry }
        }
      );

      res.json({
        success: true,
        oldScore,
        newScore: currentScore,
        improvements,
        message: 'Blog post optimized successfully',
        data: mapBlogDocument({ ...blog, ...updates })
      });
    } else {
      res.json({
        success: true,
        oldScore,
        newScore: oldScore,
        improvements: [],
        message: 'Blog SEO score is already 80 or higher. No optimization performed.',
        data: mapBlogDocument(blog)
      });
    }
  } catch (err) {
    if (blogOptimizeChargeResult) {
      try {
        await refundGenerationCredits({
          userId,
          amount: COST_SEO_OPTIMIZE_BLOG,
          type: 'blog_seo_optimize_refund',
          note: `Refund for failed canonical blog SEO optimization (${COST_SEO_OPTIMIZE_BLOG} credits)`,
        });
      } catch (refundErr) {
        console.error('Failed to refund credits for failed blog optimize:', refundErr);
      }
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/blogs/:id', authRequired, async (req, res) => {
  await rawDb.collection('blogs').deleteOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
  res.json({ success: true });
});

// 7. Render/Adaptations endpoints
app.post('/api/render/:platform', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  let renderChargeResult = null;
  try {
    const { platform } = req.params;
    const { blogId } = req.body;
    if (!blogId) {
      return res.status(400).json({ success: false, error: 'Blog ID is required' });
    }
    const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(blogId), user_id: req.user._id });
    if (!blog) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    renderChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: COST_PLATFORM_ADAPTATION,
      type: 'platform_render',
      note: `${platform} rendering charge (${COST_PLATFORM_ADAPTATION} credits)`,
    });

    // Resolve platform config rules
    let searchName = platform.replace('-', ' ');
    if (searchName.toLowerCase() === 'dev to') {
      searchName = 'Dev.to';
    }
    const config = await rawDb.collection('platform_configs').findOne({
      platformName: { $regex: new RegExp('^' + searchName + '$', 'i') }
    }) || {
      platformName: searchName,
      titleRules: 'Create a short, high-curiosity hook under 80 characters.',
      structureRules: 'Format in readable blocks.',
      seoRules: 'Must include the primary keyword naturally.',
      ctaRules: 'Invite readers to comment.'
    };

    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id }) || {
      companyName: 'UDEN Tech',
      website: 'https://uden.tech'
    };
    const companyWebsite = company.website || 'https://uden.tech';
    const targetKeyword = blog.keyword || '';

    const campaign = await rawDb.collection('topics').findOne({ _id: blog.topicId }) || {
      goal: 'General Brand growth'
    };

    const pIdStr = blog.personaId || blog.audienceId;
    let persona = null;
    if (pIdStr && (pIdStr instanceof ObjectId || (typeof pIdStr === 'string' && pIdStr.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pIdStr) });
      } catch (e) {
        console.warn("Failed to query personaId in render:", pIdStr, e.message);
      }
    }
    if (!persona) {
      persona = {
        personaName: blog.targetAudience || 'General Audience',
        tone: blog.tone || 'Professional',
        writingStyle: 'Direct',
        audienceType: 'B2C'
      };
    }

    const isLongForm = ['medium', 'company-blog', 'company blog', 'dev.to', 'dev-to', 'substack'].includes(config.platformName.toLowerCase());
    
    let lengthInstruction = isLongForm
      ? `\n\nCRITICAL REQUIREMENT FOR LONG-FORM CONTENT:
Since this is a ${config.platformName} post, it MUST be a highly detailed, comprehensive, and structured article (aim for 800 to 1200 words). Do NOT summarize or condense it. Retain all technical explanations, code blocks, and lists.`
      : `\n\nCRITICAL REQUIREMENT FOR SOCIAL FEEDS:
Since this is a ${config.platformName} post, keep it punchy, engaging, and suitable for a social media feed (aim for 200-400 words).`;

    let seoPreservationPrompt = isLongForm
      ? `\n5. SEO VIABILITY PRESERVATION RULES:
   You MUST maintain the high SEO quality of the canonical post. Start the "copy" text with an H1 heading (Markdown "# Heading Title" format) containing the target keyword. Include the target keyword in the first paragraph and in H2/H3 headings. Preserve all links pointing to "${companyWebsite}". You MUST wrap all links (both internal and external) in bold markdown syntax (e.g. "**[Link Text](/path)**") to highlight them.`
      : '';

    const systemPrompt = `You are a World-Class Growth Specialist, Content Adaptor, and Copy Editor.
Transform a high-quality canonical blog post into a platform-specific post tailored exactly for the channel: ${config.platformName}.
CRITICAL IMAGE RULE: Do NOT include any images, image tags, or markdown image references (e.g., '![Alt Text](url)') in the copy under any circumstances. Keep the post copy text-only.
Return STRICTLY a valid JSON object format matching the exact structure below. Do not wrap in markdown codeblocks.

Required JSON Structure:
{
  "title": "Adapted title or headline matching Title Hook Rules",
  "copy": "Optimized platform-specific post text body in Markdown format (starting with an H1 heading for long-form platforms), fully utilizing Content Structuring & Formatting Rules. Do NOT include any image tags.",
  "hashtags": ["tag1", "tag2", "tag3"],
  "metaDescription": "Optimized platform meta excerpt"
}`;

    const userPrompt = `Adapt this canonical blog post for the platform ${config.platformName}:
Canonical Title: ${blog.title}
Canonical Content:
${blog.content}

Rules:
1. TITLE HEADLINE RULES: "${config.titleRules}"
2. CONTENT STRUCTURE & FORMATTING RULES: "${config.structureRules}"
3. SEO & KEYWORDS RULES: "${config.seoRules}"
4. CTA & CONVERSIONS RULES: "${config.ctaRules}"
${lengthInstruction}
${seoPreservationPrompt}

Render the tailored JSON payload now:`;

    const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    let cleanText = responseText.trim();
    cleanText = stripJsonWrapper(cleanText);

    const parsedData = JSON.parse(cleanText);
    if (!parsedData.title || !parsedData.copy) {
      throw new Error('Sourced JSON is missing required fields.');
    }

    const seoMetrics = calculateSeoAnalysis(
      parsedData.title,
      parsedData.copy,
      parsedData.metaDescription || '',
      targetKeyword,
      blog.slug,
      company?.website || '',
      config.platformName || ''
    );

    const adaptationRecord = {
      user_id: req.user._id,
      companyId: company._id || null,
      blogId: new ObjectId(blogId),
      platformName: config.platformName,
      title: parsedData.title,
      copy: parsedData.copy,
      hashtags: parsedData.hashtags || [],
      metaDescription: parsedData.metaDescription || '',
      seoScore: seoMetrics.seoScore,
      seoAnalysis: seoMetrics,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await rawDb.collection('rendered_blogs').updateOne(
      { blogId: new ObjectId(blogId), platformName: config.platformName, user_id: req.user._id },
      { $set: adaptationRecord },
      { upsert: true }
    );

    const created = await rawDb.collection('rendered_blogs').findOne({ blogId: new ObjectId(blogId), platformName: config.platformName, user_id: req.user._id });
    res.status(201).json({ success: true, data: { ...created, id: created._id.toString() } });
  } catch (err) {
    console.error("Platform render failed:", err.message);
    if (renderChargeResult) {
      await refundGenerationCredits({
        userId,
        amount: COST_PLATFORM_ADAPTATION,
        type: 'platform_render_refund',
        note: `Refund for failed ${req.params.platform} rendering (${COST_PLATFORM_ADAPTATION} credits)`,
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/render/blog/:blogId/platform/:platformName', authRequired, async (req, res) => {
  try {
    const { blogId, platformName } = req.params;
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

    const rendered = await rawDb.collection('rendered_blogs').findOne({
      blogId: new ObjectId(blogId),
      platformName: { $regex: new RegExp('^' + targetPlatform + '$', 'i') },
      user_id: req.user._id
    });
    
    if (!rendered) {
      return res.status(404).json({ success: false, error: 'No rendered blog post found' });
    }
    res.json({ success: true, data: { ...rendered, id: rendered._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/render/:id', authRequired, async (req, res) => {
  try {
    const { title, copy, hashtags, metaDescription } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (copy !== undefined) updates.copy = copy;
    if (hashtags !== undefined) updates.hashtags = hashtags;
    if (metaDescription !== undefined) updates.metaDescription = metaDescription;

    await rawDb.collection('rendered_blogs').updateOne(
      { _id: new ObjectId(req.params.id), user_id: req.user._id },
      { $set: updates }
    );
    const updated = await rawDb.collection('rendered_blogs').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/render/:id/optimize', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  let renderOptimizeChargeResult = null;
  try {
    const rendered = await rawDb.collection('rendered_blogs').findOne({ _id: new ObjectId(req.params.id), user_id: req.user._id });
    if (!rendered) return res.status(404).json({ success: false, error: 'Rendered post not found' });

    renderOptimizeChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: COST_SEO_OPTIMIZE_PLATFORM,
      type: 'platform_seo_optimize',
      note: `Platform render SEO optimization (${COST_SEO_OPTIMIZE_PLATFORM} credits)`,
    });

    const blog = await rawDb.collection('blogs').findOne({ _id: rendered.blogId });
    const targetKeyword = blog ? (blog.keyword || '') : '';
    const slug = blog ? (blog.slug || '') : '';
    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id });
    const companyWebsite = company?.website || '';
    const platformName = rendered.platformName || '';
    const recommendations = rendered.seoAnalysis?.recommendations || [];

    let recommendationsPrompt = '';
    if (recommendations && recommendations.length > 0) {
      recommendationsPrompt = `\n\nFAILED CHECKS & SEO RECOMMENDATIONS TO ADDRESS AND SOLVE:
${recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}`;
    }

    const systemPrompt = `You are an SEO Optimizer. Optimize this platform post for the platform "${platformName}" to maximize its SEO score, readability, and keyword integration.
You MUST preserve and naturally integrate the target keyword: "${targetKeyword}" in the title, first paragraph, and throughout the text.
Do NOT remove the target keyword. Keep the focus keyword density around 1% to 2.5%.
Preserve all links pointing to "${companyWebsite}". You MUST wrap all links (both internal and external) in bold markdown syntax (e.g. "**[Link Text](/path)**") to highlight them.
Return STRICTLY a valid JSON object format matching the exact structure below.

Required JSON Structure:
{
  "title": "Optimized Title",
  "copy": "Optimized copy body text in Markdown format",
  "hashtags": ["tag1", "tag2"]
}`;
    const userPrompt = `Optimize this platform post:
Platform: ${platformName}
Target Keyword: ${targetKeyword}
${recommendationsPrompt}

Title: ${rendered.title}
Body: ${rendered.copy}
Hashtags: ${rendered.hashtags ? rendered.hashtags.join(', ') : ''}

Optimize and return JSON now:`;

    const responseText = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    let cleanText = responseText.trim();
    cleanText = stripJsonWrapper(cleanText);
    const optimized = JSON.parse(cleanText);

    const seoMetrics = calculateSeoAnalysis(
      optimized.title || rendered.title,
      optimized.copy || rendered.copy,
      rendered.metaDescription || '',
      targetKeyword,
      slug,
      companyWebsite,
      platformName
    );

    const updates = {
      title: optimized.title || rendered.title,
      copy: optimized.copy || rendered.copy,
      hashtags: optimized.hashtags || rendered.hashtags || [],
      seoScore: seoMetrics.seoScore,
      seoAnalysis: seoMetrics,
      updated_at: new Date().toISOString()
    };

    await rawDb.collection('rendered_blogs').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    const updated = await rawDb.collection('rendered_blogs').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    if (renderOptimizeChargeResult) {
      try {
        await refundGenerationCredits({
          userId,
          amount: COST_SEO_OPTIMIZE_PLATFORM,
          type: 'platform_seo_optimize_refund',
          note: `Refund for failed platform render SEO optimization (${COST_SEO_OPTIMIZE_PLATFORM} credits)`,
        });
      } catch (refundErr) {
        console.error('Failed to refund credits for failed platform optimize:', refundErr);
      }
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/images/view/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!/^[a-zA-Z0-9_\-\.]+$/i.test(filename)) {
      return res.status(400).send('Invalid filename');
    }
    const s3Url = `https://creative-os-assets.s3.ap-south-1.amazonaws.com/images/${filename}`;
    const response = await axios.get(s3Url, {
      responseType: 'stream',
      timeout: 10000
    });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    response.data.pipe(res);
  } catch (error) {
    res.status(404).send('Image not found');
  }
});

// 8. Images endpoints
app.get('/api/images/download', authRequired, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: 'Image URL is required' });
    }

    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, error: 'Invalid image URL' });
    }

    console.log(`[IMAGE CONTROLLER] Proxy downloading image URL: ${url}`);
    
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 15000
    });

    const contentType = response.headers['content-type'] || 'image/png';
    const extension = url.split('.').pop().split('?')[0] || 'png';
    const filename = `cover_image_${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    response.data.pipe(res);
  } catch (error) {
    console.error(`[IMAGE CONTROLLER] Failed to proxy download image: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to download image from source.' });
  }
});

app.get('/api/images/:blogId', authRequired, async (req, res) => {
  try {
    const blogIdStr = req.params.blogId;
    const list = await rawDb.collection('image_metadata').find({
      $or: [
        { blog_id: blogIdStr },
        { blogId: blogIdStr },
        { blog_id: new ObjectId(blogIdStr) },
        { blogId: new ObjectId(blogIdStr) }
      ]
    }).sort({ created_at: -1 }).toArray();

    res.json({
      success: true,
      data: list.map(img => ({
        ...img,
        id: img._id.toString(),
        blogId: img.blog_id || img.blogId,
        createdAt: img.createdAt || img.created_at,
        dimensions: img.dimensions || '1792x1024'
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/images/generate', authRequired, async (req, res) => {
  const { blogId, dimensions, platform } = req.body;
  const userId = req.user.id || req.user._id.toString();
  let coverImageChargeResult = null;
  try {
    const blog = await rawDb.collection('blogs').findOne({ _id: new ObjectId(blogId), user_id: req.user._id });
    if (!blog) return res.status(404).json({ success: false, error: 'Blog not found' });

    coverImageChargeResult = await chargeCreditsForGeneration({
      userId,
      amount: COST_COVER_IMAGE,
      type: 'cover_image_generation',
      note: `Cover image generation charge (${COST_COVER_IMAGE} credits)`,
    });

    const company = await rawDb.collection('companies').findOne({ user_id: req.user._id }) || {};
    const campaign = await rawDb.collection('topics').findOne({ _id: blog.topicId }) || {};
    
    const pIdStr = blog.personaId || blog.audienceId;
    let persona = null;
    if (pIdStr && (pIdStr instanceof ObjectId || (typeof pIdStr === 'string' && pIdStr.length === 24))) {
      try {
        persona = await rawDb.collection('company_personas').findOne({ _id: new ObjectId(pIdStr) });
      } catch (e) {}
    }

    const resolvedPrompt = await generateBrandedImagePrompt(blog, company, campaign, persona, platform);
    
    // 1. Create a placeholder metadata record in the database with status 'generating'
    const img = {
      user_id: req.user._id,
      blog_id: blogId,
      blogId: blogId,
      prompt: resolvedPrompt,
      imageUrl: 'generating', // Placeholder status indicator
      dimensions: dimensions || '1792x1024',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const result = await rawDb.collection('image_metadata').insertOne(img);
    const created = await rawDb.collection('image_metadata').findOne({ _id: result.insertedId });
    
    // 2. Respond immediately to the client to avoid CloudFront / Nginx timeouts
    res.status(201).json({
      success: true,
      data: {
        ...created,
        id: created._id.toString(),
        blogId: created.blog_id,
        createdAt: created.created_at,
        dimensions: created.dimensions,
        imageUrl: 'generating'
      }
    });

    // 3. Start background task to generate the image, upload to S3, and update DB
    (async () => {
      let finalImageUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1024&q=80';
      let isSuccess = false;
      try {
        console.log('[IMAGE CONTROLLER BACKGROUND] Requesting DALL-E image generation...');
        const tempImageUrl = await generateImage(resolvedPrompt, dimensions);
        finalImageUrl = tempImageUrl;
        isSuccess = true;

        if (tempImageUrl && !tempImageUrl.includes('unsplash.com')) {
          try {
            console.log('[IMAGE CONTROLLER BACKGROUND] Starting background S3 upload and logo overlay...');
            let buffer;
            let mimeType = 'image/png';
            if (tempImageUrl.startsWith('data:image')) {
              const parts = tempImageUrl.split(',');
              const base64Data = parts[1];
              const match = parts[0].match(/data:(.*?);/);
              if (match) mimeType = match[1];
              buffer = Buffer.from(base64Data, 'base64');
            } else {
              const bufferResponse = await axios.get(tempImageUrl, { responseType: 'arraybuffer' });
              buffer = Buffer.from(bufferResponse.data, 'binary');
              const contentType = bufferResponse.headers['content-type'];
              if (contentType) mimeType = contentType;
            }
            let s3Url = await uploadToS3(buffer, `dalle_${blogId}_${Date.now()}.png`, mimeType);
            if (company && company.logo) {
              try {
                console.log('[IMAGE GENERATION LOGO OVERLAY BACKGROUND] Overlaying logo:', company.logo);
                const overlaidUrl = await overlayLogoOnImage({
                  imageUrl: s3Url,
                  logoUrl: company.logo,
                  logoPlacement: 'bottom-right',
                  logoScale: 0.15,
                });
                s3Url = overlaidUrl;
              } catch (overlayErr) {
                console.error('[IMAGE GENERATION LOGO OVERLAY BACKGROUND FAILED]', overlayErr);
              }
            }
            finalImageUrl = s3Url;
          } catch (uploadErr) {
            console.warn('[IMAGE UPLOAD BACKGROUND WARNING] Failed to upload image to S3 in background:', uploadErr.message);
          }
        }
      } catch (dalleErr) {
        console.warn('[DALL-E WARNING] Background image generation failed, falling back to mock unsplash image:', dalleErr.message);
      }

      // Update the database with the final URL
      await rawDb.collection('image_metadata').updateOne(
        { _id: result.insertedId },
        { $set: { imageUrl: finalImageUrl } }
      );
      console.log('[IMAGE CONTROLLER BACKGROUND] Image successfully updated in database to:', finalImageUrl);

      // If generation failed, refund the credits in the background
      if (!isSuccess && coverImageChargeResult) {
        try {
          await refundGenerationCredits({
            userId,
            amount: COST_COVER_IMAGE,
            type: 'cover_image_generation_refund',
            note: 'Refund for failed background image generation',
          });
          console.log('[IMAGE CONTROLLER BACKGROUND] Credits successfully refunded for failed generation.');
        } catch (refundErr) {
          console.error('[IMAGE CONTROLLER BACKGROUND REFUND ERROR] Failed to refund credits:', refundErr.message);
        }
      }
    })();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. SEO endpoints
app.post('/api/seo/analyze', authRequired, async (req, res) => {
  const { content } = req.body;
  try {
    const analysis = await analyzeBlogSEO(content);
    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/seo/optimize', authRequired, async (req, res) => {
  const { content, keywords } = req.body;
  try {
    const systemPrompt = "You are an SEO editor. Rewrite the blog content to optimize it for the focus keywords provided while preserving tone and readability.";
    const userPrompt = `Optimize this blog post for keywords "${keywords}":\n\n${content}`;
    const optimizedContent = await callAzureOpenAI(systemPrompt, userPrompt, 0.7);
    res.json({ success: true, data: { optimizedContent } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/seo/brief', authRequired, async (req, res) => {
  const { topic, keywords } = req.body;
  try {
    const brief = await generateSEOBrief(topic, keywords);
    res.json({ success: true, data: { brief } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


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
    note: String(note || '').trim() || `Credit purchase request (${requestedAmount} credits)`,
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
  const companyCount = await store.countCompanies(userId);
  const company = await store.getCompanyByUserId(userId);
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
    companyCount,
    companyLimit: personaLimit,
    brandLogoUrl: company?.logo || '',
  });
});
app.get('/api/company', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const company = await store.getCompanyByUserId(userId);

  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'No company associated with this user',
    });
  }

  res.json({
    success: true,
    data: company,
  });
});
app.post('/api/company', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const company = await store.upsertCompany(userId, req.body);

  res.status(201).json({
    success: true,
    data: company,
  });
});
app.put('/api/company/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const existing = await store.getCompanyByUserId(userId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Company not found',
    });
  }

  const updated = await store.upsertCompany(userId, {
    ...req.body,
  });

  res.json({
    success: true,
    data: updated,
  });
});
app.delete('/api/company/delete-logo', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const existing = await store.getCompanyByUserId(userId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Company not found',
    });
  }

  const updated = await store.upsertCompany(userId, {
    logo: '',
    brandColors: [],
    brandColorsDescription: '',
  });

  res.json({
    success: true,
    data: updated,
  });
});
app.post('/api/company/upload-logo', authRequired, upload.single('logo'), async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const existing = await store.getCompanyByUserId(userId);

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No logo image file provided',
    });
  }

  try {
    const fileData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const logoUrl = await saveLogoUpload(fileData);

    const updated = await store.upsertCompany(userId, {
      logo: logoUrl,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Unable to upload logo',
    });
  }
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
    success: true,
    data: rows.map(sanitizeCompanyPersona),
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

  res.status(201).json({
    success: true,
    data: sanitizeCompanyPersona(persona),
  });
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

  res.json({
    success: true,
    data: sanitizeCompanyPersona(updated),
  });
});

app.delete('/api/company-personas/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const deleted = await store.deleteCompanyPersona(req.params.id, userId);

  if (!deleted) {
    return res.status(404).json({ message: 'Company persona not found' });
  }

  res.json({ ok: true });
});

app.delete('/api/personas/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const deleted = await store.deleteCompanyPersona(req.params.id, userId);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Persona not found',
    });
  }

  res.json({
    success: true,
    data: null,
  });
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
    targetWidth = null,
    targetHeight = null,
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
      targetWidth,
      targetHeight,
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

    const company = await rawDb.collection('companies').findOne({ user_id: userQuery(userId) }) || {};
    const platform = req.body?.platform || null;
    const topic = String(req.body?.topic || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const companyPersona = req.body?.companyPersona || null;
    const aspectRatio = req.body?.aspectRatio || req.body?.aspect_ratio || null;
    const width = req.body?.width || null;
    const height = req.body?.height || null;
    const outputWidth = Number(req.body?.outputWidth) || null;
    const outputHeight = Number(req.body?.outputHeight) || null;
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
        company: companyPersona.company || company.companyName || '',
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
      const resolvedLogoPlacement = String(
        logoPlacement === 'persona-default'
          ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
          : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
      ).trim().replace('_', '-');
      
      const resolvedLogoUrl = companyPersona?.logoUrl || companyPersona?.logo_url || company?.logo || '';

      const promptWithLogoGuidance =
        resolvedLogoPlacement && resolvedLogoPlacement !== 'none'
          ? `${prompt} Logo overlay requirement: leave the ${resolvedLogoPlacement.replace(/-/g, ' ')} logo area clear, empty, and visually unobstructed. Do not place text, icons, faces, UI elements, or important visual details there because the real uploaded logo will be overlaid after generation.`
          : prompt;

      const jobId = startImageGenerationJob({
        prompt: promptWithLogoGuidance,
        size,
        logoUrl: resolvedLogoUrl,
        logoPlacement: resolvedLogoPlacement,
        targetWidth: outputWidth,
        targetHeight: outputHeight,
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
        prompt: promptWithLogoGuidance,
        size,
        status: getImageJobStatusPayload(imageGenerationJobs.get(jobId)),
        credits: {
          charged: imageCost,
          balance_after: normalizeCreditValue(chargeResult?.user?.credits_balance, normalizeCreditValue(req.user.credits_balance)),
        },
      });
    }

    const resolvedLogoPlacement = String(
      logoPlacement === 'persona-default'
        ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
        : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
    ).trim().replace('_', '-');

    const resolvedLogoUrl = companyPersona?.logoUrl || companyPersona?.logo_url || company?.logo || '';

    const image = await generateImageWithAzure({
      prompt,
      size,
      logoUrl: resolvedLogoUrl,
      logoPlacement: resolvedLogoPlacement,
      targetWidth: outputWidth,
      targetHeight: outputHeight,
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
// ─── Public Share Links (hides S3 bucket from social previews) ─────────────

app.post('/api/create-share-link', authRequired, async (req, res) => {
  try {
    const assetUrl = String(req.body?.assetUrl || '').trim();
    const caption = String(req.body?.caption || '').trim().slice(0, 300);
    const title = String(req.body?.title || 'Check out this asset').trim().slice(0, 120);

    if (!assetUrl) {
      return res.status(400).json({ message: 'assetUrl is required' });
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

    const shareId = crypto.randomBytes(8).toString('hex');

    await rawDb.collection('shared_assets').insertOne({
      share_id: shareId,
      asset_url: assetUrl,
      caption,
      title,
      user_id: req.user._id,
      created_at: nowIso(),
    });

    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return res.json({ shareUrl: `${baseUrl}/api/share/${shareId}` });
  } catch (error) {
    console.error('[CREATE SHARE LINK FAILED]', error?.message || error);
    return res.status(500).json({ message: 'Failed to create share link' });
  }
});

// Public — no auth. This is the page Facebook/WhatsApp/LinkedIn crawlers hit.
app.get('/api/share/:id', async (req, res) => {
  try {
    const record = await rawDb.collection('shared_assets').findOne({ share_id: req.params.id });
    if (!record) {
      return res.status(404).send('Not found');
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const imageProxyUrl = `${baseUrl}/api/public-asset/${req.params.id}`;
    const shareUrl = `${baseUrl}/api/share/${req.params.id}`;

    const escapeHtml = (str) => String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(record.title)}</title>
  <meta property="og:title" content="${escapeHtml(record.title)}" />
  <meta property="og:description" content="${escapeHtml(record.caption)}" />
  <meta property="og:image" content="${imageProxyUrl}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0; url=${imageProxyUrl}" />
</head>
<body>
  <p>Redirecting... <a href="${imageProxyUrl}">View image</a></p>
</body>
</html>`);
  } catch (error) {
    console.error('[SHARE PAGE FAILED]', error?.message || error);
    res.status(500).send('Something went wrong');
  }
});

// Public — no auth. Streams the actual image without exposing the bucket URL.
app.get('/api/public-asset/:id', async (req, res) => {
  try {
    const record = await rawDb.collection('shared_assets').findOne({ share_id: req.params.id });
    if (!record) {
      return res.status(404).send('Not found');
    }

    // Use axios to bypass local SSL cert validation blocks
    const assetResponse = await axios.get(record.asset_url, { responseType: 'arraybuffer' });
    const contentType = assetResponse.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = Buffer.from(assetResponse.data);
    return res.send(buffer);
  } catch (error) {
    console.error('[PUBLIC ASSET PROXY FAILED]', error?.message || error);
    res.status(500).send('Failed to load asset');
  }
});

// Public — no auth. Streams an image securely by decoding a base64 URL to avoid exposing S3 bucket URLs or causing 401s in downloads.
app.get('/api/media-proxy', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('Token is required');
    }

    let assetUrl;
    try {
      assetUrl = Buffer.from(token, 'base64').toString('utf8');
    } catch {
      return res.status(400).send('Invalid token');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(assetUrl);
    } catch {
      return res.status(400).send('Invalid asset URL');
    }

    const allowedHosts = new Set([
      `${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`,
      `${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com`,
      'res.cloudinary.com',
    ]);

    const isS3Host = parsedUrl.hostname.endsWith('.amazonaws.com');

    if (!allowedHosts.has(parsedUrl.hostname) && !isS3Host) {
      return res.status(400).send('Unsupported asset host');
    }

    // Use axios to bypass local SSL cert validation blocks
    const assetResponse = await axios.get(assetUrl, { responseType: 'arraybuffer' });
    const contentType = assetResponse.headers['content-type'] || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = Buffer.from(assetResponse.data);
    return res.send(buffer);
  } catch (error) {
    console.error('[MEDIA PROXY FAILED]', error?.message || error);
    res.status(500).send('Failed to load asset');
  }
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
    const company = await rawDb.collection('companies').findOne({ user_id: userQuery(userId) }) || {};
    const platform = req.body?.platform || null;
    const topic = String(req.body?.topic || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const companyPersona = req.body?.companyPersona || null;
    const aspectRatio = req.body?.aspectRatio || req.body?.aspect_ratio || '';
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
        company: companyPersona.company || company.companyName || '',
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

    const resolvedLogoPlacement = String(
      logoPlacement === 'persona-default'
        ? (companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
        : (logoPlacement || companyPersona?.logo_placement || companyPersona?.logoPlacement || 'none')
    ).trim().replace('_', '-');

    const resolvedLogoUrl = companyPersona?.logoUrl || companyPersona?.logo_url || company?.logo || '';

    const jobId = startVideoGenerationJob({
      prompt,
      aspectRatio,
      logoUrl: resolvedLogoUrl,
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

app.get('/api/knowledge', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const rows = await store.listKnowledgeSources(userId);

  res.json({
    success: true,
    data: rows,
  });
});

app.delete('/api/knowledge/:id', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const deleted = await store.deleteKnowledgeSource(req.params.id, userId);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge document not found',
    });
  }

  res.json({
    success: true,
    data: null,
  });
});

app.put('/api/knowledge/:id/summary', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const existing = await store.findKnowledgeSourceById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge document not found',
    });
  }

  const updated = await store.updateKnowledgeSource(req.params.id, userId, {
    summary: req.body.summaryText || '',
    updated_at: nowIso(),
  });

  res.json({
    success: true,
    data: updated,
  });
});

app.post('/api/knowledge/upload', authRequired, upload.single('file'), async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file provided',
    });
  }

  try {
    const timestamp = nowIso();
    const fileName = req.file.originalname;
    const content = await extractTextFromBuffer({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      fileName,
    });

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'No readable content found in the uploaded file',
      });
    }

    const source = await store.insertKnowledgeSource({
      user_id: userId,
      title: fileName,
      content,
      type: 'file',
      source_type: 'file',
      file_name: fileName,
      mime_type: req.file.mimetype,
      size: req.file.size,
      summary: content.slice(0, 1000),
      status: 'uploaded',
      ingestion_method: 'file',
      chunks: buildKnowledgeChunks(content),
      created_at: timestamp,
      updated_at: timestamp,
    });

    res.status(201).json({
      success: true,
      data: {
        ...source,
        id: source.id || source._id?.toString?.(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Unable to upload document',
    });
  }
});

app.post('/api/knowledge/crawl', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const url = String(req.body?.url || '').trim();

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required',
    });
  }

  try {
    const extracted = await extractTextFromUrl(url);

    if (!extracted.content) {
      return res.status(400).json({
        success: false,
        error: 'No readable content found at the URL',
      });
    }

    const timestamp = nowIso();

    const source = await store.insertKnowledgeSource({
      user_id: userId,
      title: String(extracted.title || url).trim(),
      content: extracted.content,
      source_type: 'website',
      tags: [],
      source_url: url,
      ingestion_method: 'url',
      chunks: buildKnowledgeChunks(extracted.content),
      created_at: timestamp,
      updated_at: timestamp,
    });

      const cleanDomain = url
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];

    const companyName = cleanDomain
      .split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const existingCompany = await store.getCompanyByUserId(userId);

    const company = await store.upsertCompany(userId, {
      companyName: existingCompany?.companyName || companyName,
      website: url,
      productDescription: existingCompany?.productDescription || String(extracted.content || '').slice(0, 1000),
      targetAudience: existingCompany?.targetAudience || '',
      brandVoice: existingCompany?.brandVoice || '',
      competitors: existingCompany?.competitors || [],
      brandColors: existingCompany?.brandColors || [],
      brandColorsDescription: existingCompany?.brandColorsDescription || '',
    });

    const existingPersonas = await store.listCompanyPersonas(userId);

    if (!existingPersonas.length) {
      const timestampForPersona = nowIso();

      await store.insertCompanyPersona({
        user_id: userId,
        company: company.companyName || companyName,
        name: `${company.companyName || companyName} Brand Persona`,
        tagline: '',
        logo_url: company.logoUrl || company.logo || '',
        logo_placement: 'none',
        preserve_original_logo: true,
        audience: company.targetAudience || '',
        voice: company.brandVoice || '',
        goals: 'Create brand-aligned content based on the crawled website context.',
        notes: String(extracted.content || '').slice(0, 1000),
        visual_style_instructions: '',
        brand_primary_color: '',
        brand_secondary_color: '',
        brand_accent_color: '',
        tuning_prompt: '',
        learning_summary: '',
        learning_count: 0,
        analysis: buildPersonaAnalysis({
          company: company.companyName || companyName,
          audience: company.targetAudience || '',
          voice: company.brandVoice || '',
          goals: 'Create brand-aligned content based on the crawled website context.',
          notes: String(extracted.content || '').slice(0, 1000),
        }),
        created_at: timestampForPersona,
        updated_at: timestampForPersona,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...source,
        id: source.id || source._id?.toString?.(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Unable to crawl website',
    });
  }
});

app.post('/api/knowledge/:id/extract', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const existing = await store.findKnowledgeSourceById(req.params.id, userId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge document not found',
    });
  }

  const content = String(existing.content || '').trim();

  if (!content) {
    return res.status(400).json({
      success: false,
      error: 'No readable content available for extraction',
    });
  }

  const updated = await store.updateKnowledgeSource(req.params.id, userId, {
    summary: content.slice(0, 1000),
    updated_at: nowIso(),
  });

  res.json({
    success: true,
    data: updated,
  });
});

app.get('/api/blogs', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const blogs = await store.listBlogs(userId);

  res.json({
    success: true,
    data: blogs.map((blog) => ({
      ...blog,
      id: blog.id || blog._id?.toString?.(),
    })),
  });
});

app.post('/api/blogs/generate', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const timestamp = nowIso();

  const title = req.body.topicName || req.body.title || 'Generated SEO Blog';
  const topic = req.body.topic || req.body.topicDetails || req.body.goal || '';
  const keywords = Array.isArray(req.body.keywords) ? req.body.keywords : [];

  const content = `# ${title}

This blog draft is generated from the selected brand setup, topic context, research angle, and grounding knowledge.

## Topic Focus
${topic}

## SEO Keywords
${keywords.join(', ')}

## Draft
A complete SEO blog draft can now be generated and refined from this saved Blog Studio context.`;

  const blog = await store.insertBlog({
    user_id: String(userId),
    topic_id: req.body.topicId || req.body.topic_id || '',
    title,
    content,
    keywords,
    status: 'draft',
    created_at: timestamp,
    updated_at: timestamp,
  });

  res.status(201).json({
    success: true,
    data: {
      ...blog,
      id: blog.id || blog._id?.toString?.(),
    },
  });
});

app.get('/api/topics', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const topics = await store.listTopics(userId);

  res.json({
    success: true,
    count: topics.length,
    data: topics.map((topic) => ({
      ...topic,
      id: topic.id || topic._id?.toString?.(),
    })),
  });
});

app.post('/api/topics', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const timestamp = nowIso();

  const topic = await store.insertTopic({
    user_id: String(userId),
    ...req.body,
    created_at: timestamp,
    updated_at: timestamp,
  });

  res.status(201).json({
    success: true,
    data: {
      ...topic,
      id: topic.id || topic._id?.toString?.(),
    },
  });
});

app.post('/api/research/generate', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();
  const topicId = String(req.body.topicId || req.body.topic_id || req.body.id || '').trim();

  if (!topicId) {
    return res.status(400).json({
      success: false,
      error: 'Topic ID is required',
    });
  }

  const research = await store.upsertResearchByTopicId(userId, topicId, {
    news: [],
    keywords: Array.isArray(req.body.keywords) ? req.body.keywords : [],
    competitorAnalysis: [],
    suggestedAngles: [
      'Resume clarity and ATS readiness',
      'Portfolio and GitHub project presentation',
      'Internship and entry-level job preparation',
    ],
    status: 'completed',
  });

  res.status(201).json({
    success: true,
    data: {
      ...research,
      id: research.id || research._id?.toString?.(),
    },
  });
});

app.get('/api/research/:topicId', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const research = await store.findResearchByTopicId(userId, req.params.topicId);

  if (!research) {
    return res.status(404).json({
      success: false,
      error: 'No research report found for this topic context. Synthesize one first.',
    });
  }

  res.json({
    success: true,
    data: {
      ...research,
      id: research.id || research._id?.toString?.(),
    },
  });
});

app.get('/api/research', authRequired, async (req, res) => {
  const userId = req.user.id || req.user._id.toString();

  const records = await store.listResearch(userId);

  res.json({
    success: true,
    count: records.length,
    data: records.map((record) => ({
      ...record,
      id: record.id || record._id?.toString?.(),
    })),
  });
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

  const userIds = [...new Set(transactions.map(t => t.user_id).filter(Boolean))];
  const users = await rawDb.collection('users').find({
    $or: [
      { _id: { $in: userIds.map(id => {
        try { return new ObjectId(id); } catch(e) { return null; }
      }).filter(Boolean) } },
      { id: { $in: userIds } }
    ]
  }).toArray();

  const userEmailMap = new Map();
  users.forEach(u => {
    const idStr = u._id?.toString?.() || u.id;
    if (idStr) {
      userEmailMap.set(idStr, u.email);
    }
  });

  const enrichedTransactions = transactions.map(t => ({
    ...t,
    user_email: userEmailMap.get(t.user_id) || t.user_id
  }));

  res.json({ transactions: enrichedTransactions.map(sanitizeCreditTransaction) });
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
  rawDb = db;
  // One-off migration for document tags and platform configurations
  try {
    await db.collection('knowledge_sources').updateMany(
      { mimeType: 'text/html', fileType: { $exists: false } },
      { $set: { fileType: 'url' } }
    );
    await db.collection('knowledge_sources').updateMany(
      { mimeType: { $ne: 'text/html' }, fileType: { $exists: false } },
      { $set: { fileType: 'file' } }
    );
    console.log("✓ Document fileType tags migration executed successfully!");
    
    // Seed platform configurations
    const count = await db.collection('platform_configs').countDocuments();
    if (count < 5) {
      const defaultConfigs = [
        {
          platformName: 'LinkedIn',
          titleRules: 'Create a short, hook under 80 characters. Start with an emoji. Emphasize a contrarian viewpoint or metric. Avoid generic corporate announcements.',
          structureRules: 'Format in mobile-friendly blocks: maximum 1-2 sentences. Use emoji bullets. Add clean white space. Place 3-5 relevant hashtags at the bottom.',
          seoRules: 'Must include the primary keyword naturally. 3-5 hashtags at the bottom.',
          ctaRules: 'Invite readers to comment. Do not include external links in post body.'
        },
        {
          platformName: 'Medium',
          titleRules: 'Design a compelling title between 60-90 characters. Pair it with a descriptive subtitle. Include keyword in title.',
          structureRules: 'Adopt storytelling format. Use H2/H3 structural section headers, lists, and tables. Write a detailed, long-form post (minimum 800-1200 words) covering all sections of the original post.',
          seoRules: 'Integrate target keyword in title, first paragraph, and H2 headings. Meta description under 160 characters. Preserve all links.',
          ctaRules: 'End with claps, responses, and visiting company website.'
        },
        {
          platformName: 'Company Blog',
          titleRules: 'Generate an SEO-optimized title containing campaign keywords. Keep it between 50-70 characters.',
          structureRules: 'Clear technical readability: use H2/H3 headers, lists, tables, FAQ, and Conclusion. Write a complete article (minimum 800-1200 words) matching canonical blog length.',
          seoRules: 'Maintain 1.0-1.5% keyword density. Keyword in title, first paragraph, H1, and H2 headings. Preserve all links.',
          ctaRules: 'Integrate corporate CTA requesting demo, free trial, or whitepaper download.'
        },
        {
          platformName: 'Dev.to',
          titleRules: 'Create developer-focused title between 50-80 characters. Include keyword in title.',
          structureRules: 'Developer-friendly Markdown: H2/H3 headers, code blocks (yaml, javascript, go), lists, FAQ, and Conclusion. Write a complete article (minimum 800-1200 words) matching canonical length.',
          seoRules: 'Place keyword in title, first paragraph, H1, and headings. Preserve links.',
          ctaRules: 'Encourage bookmarking, commenting stack implementation, and checking company website.'
        },
        {
          platformName: 'Substack',
          titleRules: 'Design warm, newsletter-style headline. Keep it between 50-70 characters. Include keyword in title.',
          structureRules: 'Email newsletter layout. Editorial opening. Use H2/H3 headers, lists, code blocks, FAQ, and Conclusion. Write a complete newsletter post (minimum 800-1200 words) matching canonical blog length.',
          seoRules: 'Place keyword in title, first paragraph, and H2 headings. Meta excerpt under 160 characters. Preserve links.',
          ctaRules: 'Newsletter signup CTA, subscribe request, and visiting company website.'
        }
      ];
      for (const config of defaultConfigs) {
        await db.collection('platform_configs').updateOne(
          { platformName: config.platformName },
          { $set: config },
          { upsert: true }
        );
      }
      console.log("✓ Default platform configurations seeded successfully!");
    }
  } catch (err) {
    console.warn("Failed to run database migrations/seeds:", err.message);
  }
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
