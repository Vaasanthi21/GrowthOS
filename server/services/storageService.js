import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const exports = {};

// Check credentials for S3
const hasS3 = 
  process.env.AWS_ACCESS_KEY_ID && 
  process.env.AWS_SECRET_ACCESS_KEY;

let s3Client = null;
const bucketName = process.env.AWS_BUCKET_NAME || 'creative-os-assets';

if (hasS3) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  logger.info('AWS S3 storage engine configuration loaded.');
} else {
  logger.warn('AWS S3 credentials missing in .env. Falling back to local file uploads.');
}

/**
 * Uploads a file buffer to S3 or saves it locally as a fallback
 * @param {Buffer} fileBuffer - Sourced file buffer
 * @param {String} fileName - Sourced file name
 * @returns {Promise<Object>} - Sourced URL and asset key metadata
 */
exports.uploadBuffer = (fileBuffer, fileName, options = {}) => {
  return new Promise((resolve, reject) => {
    // 1. AWS S3 Upload Path
    if (hasS3) {
      const baseName = path.parse(fileName).name;
      const ext = path.parse(fileName).ext;
      const sanitizedName = baseName
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_');

      const s3Folder = process.env.AWS_S3_FOLDER || 'growth-os-knowledge';
      const cleanFolder = s3Folder.replace(/\/$/, ''); // Remove trailing slash
      const publicId = `${cleanFolder}/${Date.now()}_${sanitizedName}${ext}`;

      let contentType = 'application/octet-stream';
      const extLower = ext.toLowerCase();
      if (extLower === '.png') contentType = 'image/png';
      else if (extLower === '.jpg' || extLower === '.jpeg') contentType = 'image/jpeg';
      else if (extLower === '.webp') contentType = 'image/webp';
      else if (extLower === '.svg') contentType = 'image/svg+xml';
      else if (extLower === '.pdf') contentType = 'application/pdf';
      else if (extLower === '.txt') contentType = 'text/plain';

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: publicId,
        Body: fileBuffer,
        ContentType: contentType
      });

      s3Client.send(command)
        .then(() => {
          const url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${publicId}`;
          logger.info(`Successfully uploaded asset to S3: ${url}`);
          resolve({
            url,
            public_id: publicId
          });
        })
        .catch(err => {
          logger.error('AWS S3 Upload Error: ' + err.message);
          reject(err);
        });

    // 2. Local Storage Fallback
    } else {
      try {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const uniqueName = `${Date.now()}_${fileName}`;
        const filePath = path.join(uploadDir, uniqueName);

        fs.writeFileSync(filePath, fileBuffer);
        const localUrl = `/uploads/${uniqueName}`;
        
        resolve({
          url: localUrl,
          public_id: uniqueName,
        });
      } catch (error) {
        logger.error('Local File Upload Fallback Error: ' + error.message);
        reject(error);
      }
    }
  });
};

/**
 * Deletes a file asset from S3 or local uploads folder
 * @param {String} publicId - Sourced asset key metadata
 */
exports.deleteAsset = async (publicId) => {
  if (hasS3) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: publicId
      });
      await s3Client.send(command);
      logger.info(`Successfully deleted S3 asset: ${publicId}`);
    } catch (error) {
      logger.error(`AWS S3 Delete Error: ${error.message}`);
    }
  } else {
    try {
      const filePath = path.join(__dirname, '../uploads', publicId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Successfully deleted local asset file: ${publicId}`);
      }
    } catch (error) {
      logger.error(`Local File Delete Error: ${error.message}`);
    }
  }
};

export default exports;