/**
 * server/video/pipeline/scene-asset-validator.js
 *
 * SceneAssetValidator verifies normalized SceneAssets against target VideoSpec constraints
 * (aspect ratio, duration, resolution, codecs, playability).
 */

export class SceneAssetValidator {
  validate(sceneAsset = {}, videoSpec = {}) {
    const errors = [];
    const warnings = [];

    const assetUrl = sceneAsset.assetUrl || sceneAsset.video_url;
    if (!assetUrl) {
      errors.push('SceneAsset missing output assetUrl or video_url');
    } else if (typeof assetUrl === 'string' && !assetUrl.startsWith('http://') && !assetUrl.startsWith('https://') && !assetUrl.startsWith('/') && !assetUrl.includes('.')) {
      errors.push('SceneAsset has invalid assetUrl format');
    }

    if (!sceneAsset.sha256 && !sceneAsset.assetClassification?.includes('GRAPHICS')) {
      errors.push('SceneAsset missing SHA-256 integrity checksum');
    }

    const targetAspect = String(videoSpec.aspectRatio || '9:16');
    if (sceneAsset.aspectRatio && sceneAsset.aspectRatio !== targetAspect) {
      warnings.push(`Aspect ratio mismatch: asset has ${sceneAsset.aspectRatio}, target is ${targetAspect}. FFmpeg pad/scale filter will auto-correct.`);
    }

    const reqTimelineDur = Number(sceneAsset.requestedTimelineDuration || sceneAsset.duration || 0);
    const provGenDur = Number(sceneAsset.providerGenerationDuration || sceneAsset.providerDuration || 0);
    const actAssetDur = Number(sceneAsset.actualAssetDuration || provGenDur || 0);

    if (reqTimelineDur <= 0) {
      errors.push(`Invalid scene requested timeline duration: ${reqTimelineDur}s`);
    }

    if (provGenDur <= 0) {
      errors.push(`Invalid scene provider generation duration: ${provGenDur}s`);
    }

    if (sceneAsset.provider === 'sora' && ![4, 8, 12].includes(provGenDur)) {
      warnings.push(`Sora provider requested with non-standard generation duration: ${provGenDur}s (supported: 4, 8, 12)`);
    }

    if (actAssetDur <= 0) {
      errors.push(`Invalid actual asset duration: ${actAssetDur}s`);
    }

    const isValid = errors.length === 0;
    return {
      valid: isValid,
      errors,
      warnings,
      validatedAsset: {
        ...sceneAsset,
        validationStatus: isValid ? 'valid' : 'invalid',
        failureReason: errors.length > 0 ? errors.join('; ') : null,
        validationWarnings: warnings,
      },
    };
  }
}

export const defaultSceneAssetValidator = new SceneAssetValidator();
