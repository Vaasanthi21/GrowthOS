/**
 * server/video/pipeline/timeline-builder.js
 *
 * Timeline Builder constructing explicit timestamp offsets and validating
 * total composition duration against user requested duration.
 */

export class TimelineBuilder {
  /**
   * Constructs an explicit timeline object from an array of validated scene clips.
   *
   * @param {Object} options
   * @param {number} options.requestedDuration Total user requested video duration in seconds.
   * @param {Array<Object>} options.scenes Array of validated scene clip objects.
   * @returns {Object} Constructed timeline schema
   */
  buildTimeline({ requestedDuration = 15, scenes = [] } = {}) {
    const targetDur = Number(requestedDuration) || 15;
    let currentOffset = 0;
    const timelineEntries = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipDuration = Number(scene.duration || scene.actualDuration || 10);
      
      timelineEntries.push({
        scene_id: scene.sceneId || `scene_${String(i + 1).padStart(2, '0')}`,
        sequence: i + 1,
        start_time: currentOffset,
        duration: clipDuration,
        end_time: currentOffset + clipDuration,
        provider: scene.provider || 'sora-2',
        asset_url: scene.assetUrl || scene.outPath || '',
        sha256: scene.sha256 || '',
      });

      currentOffset += clipDuration;
    }

    const calculatedTotalDuration = currentOffset;
    const durationVariance = Math.abs(calculatedTotalDuration - targetDur);
    const isValidTimeline = durationVariance <= 0.5;

    return {
      requested_duration: targetDur,
      calculated_duration: calculatedTotalDuration,
      duration_variance: durationVariance,
      is_valid: isValidTimeline,
      scene_count: timelineEntries.length,
      timeline: timelineEntries,
    };
  }

  /**
   * Validates final rendered MP4 asset duration against user requested duration.
   * Fails validation if discrepancy exceeds 0.5 seconds.
   */
  validateFinalCompositionDuration({ requestedDuration, measuredDuration, tolerance = 0.5 }) {
    const req = Number(requestedDuration);
    const measured = Number(measuredDuration);

    if (!Number.isFinite(req) || !Number.isFinite(measured)) {
      return { isValid: false, error: 'Invalid duration metrics provided.' };
    }

    const diff = Math.abs(measured - req);
    const isValid = diff <= tolerance;

    return {
      isValid,
      requestedDuration: req,
      measuredDuration: measured,
      durationDifference: diff,
      error: isValid ? null : `Final render duration discrepancy (${measured.toFixed(2)}s vs requested ${req.toFixed(2)}s) exceeds threshold of ${tolerance}s.`,
    };
  }
}

export const defaultTimelineBuilder = new TimelineBuilder();
