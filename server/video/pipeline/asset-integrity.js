/**
 * server/video/pipeline/asset-integrity.js
 *
 * Computes SHA-256 checksums for physical media files / asset URLs
 * and enforces asset uniqueness validation for GENERATED_ASSET clips.
 */

import crypto from 'crypto';
import fs from 'fs';

export class AssetIntegrity {
  /**
   * Computes SHA-256 hash for a local file or string payload.
   */
  computeSHA256(filePathOrUrl) {
    if (!filePathOrUrl) return 'sha256-none';
    
    try {
      if (typeof filePathOrUrl === 'string' && fs.existsSync(filePathOrUrl)) {
        const buffer = fs.readFileSync(filePathOrUrl);
        return crypto.createHash('sha256').update(buffer).digest('hex');
      }
    } catch (err) {
      // Fallback for URLs or unreadable files
    }

    return crypto.createHash('sha256').update(String(filePathOrUrl)).digest('hex');
  }

  /**
   * Validates duplicate assets across a scene collection.
   * Only GENERATED_ASSET clips are flagged for duplicate checksum warnings.
   */
  validateCollectionIntegrity(sceneAssets = []) {
    const seenGeneratedHashes = new Set();

    return sceneAssets.map(asset => {
      const sha256 = asset.sha256 || this.computeSHA256(asset.assetUrl || asset.sceneId);
      const isGenerative = asset.assetClassification === 'GENERATED_ASSET';
      
      let isDuplicateWarning = false;
      if (isGenerative && seenGeneratedHashes.has(sha256)) {
        isDuplicateWarning = true;
      }
      if (isGenerative) {
        seenGeneratedHashes.add(sha256);
      }

      return {
        ...asset,
        sha256,
        duplicateWarning: isDuplicateWarning,
        integrityStatus: isDuplicateWarning ? 'DUPLICATE_ASSET_WARNING' : 'INTEGRITY_VERIFIED',
      };
    });
  }
}

export const defaultAssetIntegrity = new AssetIntegrity();
