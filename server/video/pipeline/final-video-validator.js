/**
 * server/video/pipeline/final-video-validator.js
 *
 * FinalVideoValidator performs final quality verification on composed MP4 videos
 * before marking jobs COMPLETED.
 */

export class FinalVideoValidator {
  validateFinalVideo(compositionResult = {}, videoSpec = {}, storyboard = []) {
    const errors = [];
    const warnings = [];

    if (!compositionResult.finalVideoUrl) {
      errors.push('Final video missing asset URL');
    }

    const expectedDuration = Number(videoSpec.duration || 15);
    const actualDuration = Number(compositionResult.outputDuration || 0);
    const durationDiff = Math.abs(expectedDuration - actualDuration);
    if (durationDiff > 1.5) {
      errors.push(`Final render duration discrepancy (${actualDuration.toFixed(2)}s vs requested ${expectedDuration.toFixed(2)}s) exceeds maximum threshold of 1.5s.`);
    }

    const expectedAspect = String(videoSpec.aspectRatio || '9:16');
    if (compositionResult.outputAspectRatio && compositionResult.outputAspectRatio !== expectedAspect) {
      errors.push(`Aspect ratio mismatch: target is ${expectedAspect}, composed output is ${compositionResult.outputAspectRatio}`);
    }

    if (storyboard.length > 0 && compositionResult.clipsCount !== storyboard.length) {
      errors.push(`Scene count mismatch: storyboard requested ${storyboard.length} scenes, but composition rendered ${compositionResult.clipsCount} clips.`);
    }

    const isBrand = videoSpec.mode === 'brand' || Boolean(videoSpec.brandContext?.brandName);
    const logoRequired = Boolean(videoSpec.brandContext?.logoRequired || isBrand);
    if (logoRequired && !compositionResult.watermarkApplied) {
      warnings.push('Brand Mode enabled but watermark was not applied during composition.');
    }

    const valid = errors.length === 0;
    return {
      valid,
      errors,
      warnings,
      validationStatus: valid ? 'valid' : 'invalid',
      failureReason: errors.length > 0 ? errors.join('; ') : null,
    };
  }
}

export const defaultFinalVideoValidator = new FinalVideoValidator();
