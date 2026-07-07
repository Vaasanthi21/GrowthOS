import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'creative_studio_os';
const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;
const dryRun = process.argv.includes('--dry-run');

if (!mongoUri) {
  throw new Error('MONGODB_URI is required');
}

if (!bucketName || !region || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS S3 credentials are required');
}

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const cloudinaryHost = 'res.cloudinary.com';

const isCloudinaryUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    return new URL(value).hostname === cloudinaryHost;
  } catch {
    return false;
  }
};

const inferExtension = (contentType, url) => {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  if (contentType?.includes('mp4')) return 'mp4';
  if (contentType?.includes('quicktime')) return 'mov';

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : 'bin';
  } catch {
    return 'bin';
  }
};

const inferFolder = (contentType, fieldPath) => {
  if (fieldPath.includes('logo')) return 'logos';
  if (contentType?.startsWith('video/')) return 'videos';
  return 'images';
};

const getCloudinaryAssetDescriptor = (sourceUrl) => {
  const parsedUrl = new URL(sourceUrl);
  const uploadIndex = parsedUrl.pathname.indexOf('/upload/');
  if (uploadIndex === -1) {
    return null;
  }

  let assetPath = parsedUrl.pathname.slice(uploadIndex + '/upload/'.length);
  assetPath = assetPath.replace(/^\//, '');
  assetPath = assetPath.replace(/^v\d+\//, '');

  const extensionMatch = assetPath.match(/\.([a-zA-Z0-9]+)$/);
  const format = extensionMatch ? extensionMatch[1].toLowerCase() : undefined;
  const publicId = assetPath.replace(/\.[^/.]+$/, '');
  const resourceType = publicId.includes('/videos/') || /\/video\//.test(parsedUrl.pathname) ? 'video' : 'image';

  return {
    publicId,
    format,
    resourceType,
  };
};

const sha1Hex = (value) => crypto.createHash('sha1').update(value).digest('hex');

const buildCloudinaryPrivateDownloadUrl = ({ publicId, format, resourceType }) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret || !format) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const resourceTypeParam = resourceType || 'image';
  const stringToSign = `format=${format}&public_id=${publicId}&resource_type=${resourceTypeParam}&timestamp=${timestamp}${apiSecret}`;
  const signature = sha1Hex(stringToSign);
  const query = new URLSearchParams({
    timestamp: String(timestamp),
    public_id: publicId,
    format,
    resource_type: resourceTypeParam,
    api_key: apiKey,
    signature,
  });

  return `https://api.cloudinary.com/v1_1/${cloudName}/download?${query.toString()}`;
};

const fetchCloudinaryAssetBuffer = async (sourceUrl) => {
  const descriptor = getCloudinaryAssetDescriptor(sourceUrl);
  if (!descriptor) {
    return null;
  }

  let downloadUrl = sourceUrl;
  try {
    const sourceCloudName = new URL(sourceUrl).pathname.split('/').filter(Boolean)[0];
    if (sourceCloudName === process.env.CLOUDINARY_CLOUD_NAME) {
      downloadUrl = buildCloudinaryPrivateDownloadUrl(descriptor) || sourceUrl;
    }
  } catch {
    downloadUrl = sourceUrl;
  }

  const response = await fetch(downloadUrl, {
    headers: process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
      ? {
          Authorization: `Basic ${Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString('base64')}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Cloudinary asset ${descriptor.publicId}: ${response.status}`);
  }

  return {
    contentType: response.headers.get('content-type') || (descriptor.resourceType === 'video' ? 'video/mp4' : 'image/png'),
    buffer: Buffer.from(await response.arrayBuffer()),
  };
};

const uploadRemoteAssetToS3 = async ({ sourceUrl, fieldPath }) => {
  let contentType = 'application/octet-stream';
  let buffer;

  const response = await fetch(sourceUrl);
  if (response.ok) {
    contentType = response.headers.get('content-type') || contentType;
    buffer = Buffer.from(await response.arrayBuffer());
  } else if (isCloudinaryUrl(sourceUrl)) {
    const cloudinaryAsset = await fetchCloudinaryAssetBuffer(sourceUrl);
    if (!cloudinaryAsset) {
      throw new Error(`Failed to resolve Cloudinary asset ${sourceUrl}: ${response.status}`);
    }
    contentType = cloudinaryAsset.contentType;
    buffer = cloudinaryAsset.buffer;
  } else {
    throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
  }

  const extension = inferExtension(contentType, sourceUrl);
  const folder = inferFolder(contentType, fieldPath);
  const key = `${folder}/migrated-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  if (!dryRun) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  }

  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

const collectHistoryUpdates = async (entry, migrateUrl) => {
  let changed = false;
  const nextEntry = { ...entry };

  if (isCloudinaryUrl(nextEntry.company_logo_url)) {
    nextEntry.company_logo_url = await migrateUrl(nextEntry.company_logo_url, 'company_logo_url');
    changed = true;
  }

  if (Array.isArray(nextEntry.variants)) {
    const nextVariants = [];
    for (const variant of nextEntry.variants) {
      const nextVariant = { ...variant };
      if (isCloudinaryUrl(nextVariant.image_url)) {
        nextVariant.image_url = await migrateUrl(nextVariant.image_url, 'variants.image_url');
        changed = true;
      }
      if (isCloudinaryUrl(nextVariant.video_url)) {
        nextVariant.video_url = await migrateUrl(nextVariant.video_url, 'variants.video_url');
        changed = true;
      }
      nextVariants.push(nextVariant);
    }
    nextEntry.variants = nextVariants;
  }

  if (Array.isArray(nextEntry.refinement_messages)) {
    const nextMessages = [];
    for (const message of nextEntry.refinement_messages) {
      const nextMessage = { ...message };
      if (isCloudinaryUrl(nextMessage.image_url)) {
        nextMessage.image_url = await migrateUrl(nextMessage.image_url, 'refinement_messages.image_url');
        changed = true;
      }
      nextMessages.push(nextMessage);
    }
    nextEntry.refinement_messages = nextMessages;
  }

  return changed ? nextEntry : null;
};

const main = async () => {
  const mongoClient = new MongoClient(mongoUri);
  const migratedUrlCache = new Map();
  const stats = {
    companyPersonasUpdated: 0,
    historyEntriesUpdated: 0,
    assetsMigrated: 0,
    assetsSkippedFromCache: 0,
    assetsFailed: 0,
  };

  const migrateUrl = async (sourceUrl, fieldPath) => {
    if (migratedUrlCache.has(sourceUrl)) {
      stats.assetsSkippedFromCache += 1;
      return migratedUrlCache.get(sourceUrl);
    }

    const nextUrl = await uploadRemoteAssetToS3({ sourceUrl, fieldPath });
    migratedUrlCache.set(sourceUrl, nextUrl);
    stats.assetsMigrated += 1;
    return nextUrl;
  };

  try {
    await mongoClient.connect();
    const db = mongoClient.db(dbName);

    const companyPersonas = db.collection('company_personas');
    const contentHistory = db.collection('content_history');

    const personaCursor = companyPersonas.find({ logo_url: { $regex: '^https://res\\.cloudinary\\.com/', $options: 'i' } });
    for await (const persona of personaCursor) {
      let nextLogoUrl;
      try {
        nextLogoUrl = await migrateUrl(persona.logo_url, 'logo_url');
      } catch (error) {
        stats.assetsFailed += 1;
        console.warn(`[company_personas] ${persona._id} skipped logo_url: ${error.message}`);
        continue;
      }
      if (!dryRun) {
        await companyPersonas.updateOne(
          { _id: persona._id },
          { $set: { logo_url: nextLogoUrl, updated_at: new Date().toISOString() } }
        );
      }
      stats.companyPersonasUpdated += 1;
      console.log(`[company_personas] ${persona._id} ${dryRun ? 'would update' : 'updated'} logo_url`);
    }

    const historyCursor = contentHistory.find({
      $or: [
        { company_logo_url: { $regex: '^https://res\\.cloudinary\\.com/', $options: 'i' } },
        { 'variants.image_url': { $regex: '^https://res\\.cloudinary\\.com/', $options: 'i' } },
        { 'variants.video_url': { $regex: '^https://res\\.cloudinary\\.com/', $options: 'i' } },
        { 'refinement_messages.image_url': { $regex: '^https://res\\.cloudinary\\.com/', $options: 'i' } },
      ],
    });

    for await (const entry of historyCursor) {
      let nextEntry;
      try {
        nextEntry = await collectHistoryUpdates(entry, migrateUrl);
      } catch (error) {
        stats.assetsFailed += 1;
        console.warn(`[content_history] ${entry._id} skipped: ${error.message}`);
        continue;
      }
      if (!nextEntry) {
        continue;
      }

      if (!dryRun) {
        await contentHistory.updateOne(
          { _id: entry._id },
          {
            $set: {
              company_logo_url: nextEntry.company_logo_url ?? null,
              variants: nextEntry.variants ?? [],
              refinement_messages: nextEntry.refinement_messages ?? [],
              updated_date: new Date().toISOString(),
            },
          }
        );
      }

      stats.historyEntriesUpdated += 1;
      console.log(`[content_history] ${entry._id} ${dryRun ? 'would update' : 'updated'} asset URLs`);
    }

    console.log(JSON.stringify({ dryRun, ...stats }, null, 2));
  } finally {
    await mongoClient.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});