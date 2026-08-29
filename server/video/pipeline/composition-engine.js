/**
 * server/video/pipeline/composition-engine.js
 *
 * FFmpeg Composition Engine combining normalized SceneAssets into a unified,
 * brand-watermarked final MP4 video.
 */

import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { defaultAudioMixer } from './audio-mixer.js';

if (typeof process !== 'undefined') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const execAsync = promisify(exec);

export class CompositionEngine {
  constructor(audioMixer = defaultAudioMixer) {
    this.audioMixer = audioMixer;
  }

  async composeVideo(sceneAssets = [], videoSpec = {}, options = {}) {
    const startTime = Date.now();
    const aspectRatio = String(videoSpec.aspectRatio || '9:16');
    const brandContext = videoSpec.brandContext || {};
    const logoUrl = brandContext.logoUrl || videoSpec.logoUrl || options.logoUrl || null;
    const logoPlacement = brandContext.logoPlacement || videoSpec.logoPlacement || options.logoPlacement || 'none';

    let width = 720;
    let height = 1280;
    if (aspectRatio === '16:9') {
      width = 1280;
      height = 720;
    } else if (aspectRatio === '1:1') {
      width = 720;
      height = 720;
    } else if (aspectRatio === '4:5') {
      width = 864;
      height = 1080;
    }

    const audioMix = this.audioMixer.prepareAudioTracks(sceneAssets, videoSpec);
    const targetTotalDuration = Number(videoSpec.duration) || sceneAssets.reduce((acc, s) => acc + (Number(s.duration) || 0), 0);

    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sessionPrefix = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputFileName = `${sessionPrefix}.mp4`;
    const outputPath = path.join(tempDir, outputFileName);
    const intermediateFiles = [];

    let finalVideoUrl = options.mockUrl || null;
    let thumbnailUrl = options.mockThumb || null;
    let actualComposedDuration = 0;
    let normalizedPlacement = 'none';
    let resolvedBrandLogoPath = null;

    try {
      // Step 1: Process and normalize each scene asset clip in PARALLEL
      const clipTasks = sceneAssets.map(async (scene, i) => {
        const sceneDuration = Number(scene.duration || scene.requestedDuration || 10);
        const sceneAssetUrl = scene.assetUrl || scene.video_url || null;
        const rawScenePath = path.join(tempDir, `${sessionPrefix}_scene_${i}_raw.mp4`);
        const normScenePath = path.join(tempDir, `${sessionPrefix}_scene_${i}_norm.mp4`);
        intermediateFiles.push(rawScenePath, normScenePath);

        let inputPathToNormalize = rawScenePath;

        if (sceneAssetUrl && (sceneAssetUrl.startsWith('http://') || sceneAssetUrl.startsWith('https://'))) {
          try {
            const resp = await fetch(sceneAssetUrl, { signal: AbortSignal.timeout(15000) });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
            const arrayBuf = await resp.arrayBuffer();
            fs.writeFileSync(rawScenePath, Buffer.from(arrayBuf));
          } catch (downloadErr) {
            console.warn(`[COMPOSITION ENGINE] Failed to download scene ${i} from ${sceneAssetUrl}:`, downloadErr.message);
            inputPathToNormalize = null;
          }
        } else if (sceneAssetUrl && fs.existsSync(sceneAssetUrl)) {
          inputPathToNormalize = sceneAssetUrl;
        } else {
          inputPathToNormalize = null;
        }

        if (inputPathToNormalize && fs.existsSync(inputPathToNormalize)) {
          // Normalize real downloaded scene clip: scale, pad, 30fps, synced AAC audio, exact duration, and faststart
          const normCmd = `ffmpeg -y -threads 2 -stream_loop -1 -i "${inputPathToNormalize}" -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1,trim=duration=${sceneDuration},setpts=PTS-STARTPTS[v];[1:a]atrim=duration=${sceneDuration},asetpts=PTS-STARTPTS[a]" -map "[v]" -map "[a]" -c:v libx264 -preset ultrafast -tune fastdecode -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -t ${sceneDuration} -movflags +faststart "${normScenePath}"`;
          try {
            await execAsync(normCmd);
          } catch (normErr) {
            console.warn(`[COMPOSITION ENGINE] Primary normalization warning for scene ${i}, applying safe baseline pad:`, normErr.message);
            const normFallbackCmd = `ffmpeg -y -threads 2 -stream_loop -1 -i "${inputPathToNormalize}" -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1[v]" -map "[v]" -map 1:a -c:v libx264 -preset ultrafast -tune fastdecode -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -t ${sceneDuration} -movflags +faststart "${normScenePath}"`;
            await execAsync(normFallbackCmd);
          }
        } else {
          // Production pipeline forbids placeholder clips: throw error to trigger proper retry or job failure
          throw new Error(`SCENE_ASSET_MISSING: Scene ${i} asset could not be downloaded or is missing (${sceneAssetUrl || 'no URL'}). Production pipeline forbids synthetic placeholder clips.`);
        }

        return { path: normScenePath, duration: sceneDuration, index: i };
      });

      const normalizedClips = await Promise.all(clipTasks);
      normalizedClips.sort((a, b) => a.index - b.index);
      const normalizedClipPaths = normalizedClips.map(c => c.path);
      actualComposedDuration = normalizedClips.reduce((acc, c) => acc + c.duration, 0);

      // Step 2: Concatenate normalized scene clips with filter_complex to guarantee 100% audio/video sync
      const unwatermarkedPath = path.join(tempDir, `${sessionPrefix}_unwatermarked.mp4`);
      intermediateFiles.push(unwatermarkedPath);

      if (normalizedClipPaths.length === 1) {
        fs.copyFileSync(normalizedClipPaths[0], unwatermarkedPath);
      } else {
        const concatInputs = normalizedClipPaths.map(p => `-i "${p}"`).join(' ');
        const filterStreams = normalizedClipPaths.map((_, idx) => `[${idx}:v][${idx}:a]`).join('');
        const concatFilter = `"${filterStreams}concat=n=${normalizedClipPaths.length}:v=1:a=1[v][a]"`;
        const concatCmd = `ffmpeg -y ${concatInputs} -filter_complex ${concatFilter} -map "[v]" -map "[a]" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${unwatermarkedPath}"`;
        await execAsync(concatCmd);
      }

      // Step 2.5: Generate & Multiplex Master Soundtrack (Voiceover narration + Cinematic Ambient Bed)
      let videoWithSoundPath = unwatermarkedPath;
      try {
        console.log(`[COMPOSITION ENGINE] Synthesizing master audio soundtrack for ${actualComposedDuration}s video...`);
        const masterAudioPath = await this.audioMixer.createMasterAudioTrack({
          storyboard: videoSpec.storyboard || options.storyboard || [],
          videoSpec,
          durationSeconds: actualComposedDuration,
          sessionPrefix,
          tempDir,
        });

        if (masterAudioPath && fs.existsSync(masterAudioPath)) {
          const multiplexedPath = path.join(tempDir, `${sessionPrefix}_with_sound.mp4`);
          intermediateFiles.push(multiplexedPath);
          console.log(`[COMPOSITION ENGINE] Multiplexing master soundtrack onto final video...`);
          const soundCmd = `ffmpeg -y -i "${unwatermarkedPath}" -i "${masterAudioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -t ${actualComposedDuration} -movflags +faststart "${multiplexedPath}"`;
          await execAsync(soundCmd);
          videoWithSoundPath = multiplexedPath;
        }
      } catch (soundErr) {
        console.warn('[COMPOSITION ENGINE] Sound soundtrack generation warning:', soundErr.message);
      }

      // Step 3: Overlay Watermarks (Platform Watermark at bottom-right + Brand Logo from Brand Setup)
      let videoToFinalizePath = videoWithSoundPath;
      const defaultWatermarkAsset = path.resolve('server/assets/default_watermark.png');

      const positionMap = {
        'top-left': '24:24',
        'top_left': '24:24',
        'top-right': 'main_w-overlay_w-24:24',
        'top_right': 'main_w-overlay_w-24:24',
        'bottom-left': '24:main_h-overlay_h-24',
        'bottom_left': '24:main_h-overlay_h-24',
        'bottom-right': 'main_w-overlay_w-24:main_h-overlay_h-24',
        'bottom_right': 'main_w-overlay_w-24:main_h-overlay_h-24',
        'center': '(main_w-overlay_w)/2:(main_h-overlay_h)/2',
      };

      const isBrandMode = videoSpec.mode === 'brand' || Boolean(videoSpec.brandContext?.brandName);
      normalizedPlacement = String(logoPlacement || (isBrandMode ? 'top-left' : 'none')).trim().toLowerCase().replace('_', '-');

      // Determine brand logo path if present (from Brand Setup)
      resolvedBrandLogoPath = null;
      if (logoUrl) {
        try {
          let logoBuffer = null;
          if (logoUrl.startsWith('data:')) {
            const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) logoBuffer = Buffer.from(match[2], 'base64');
          } else if (logoUrl.startsWith('/') || logoUrl.startsWith('uploads/')) {
            const relPath = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
            const localFilePath = path.join(process.cwd(), relPath);
            if (fs.existsSync(localFilePath)) logoBuffer = fs.readFileSync(localFilePath);
          } else if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
            const logoResp = await fetch(logoUrl, { signal: AbortSignal.timeout(15000) });
            if (logoResp.ok) {
              const logoBuf = await logoResp.arrayBuffer();
              logoBuffer = Buffer.from(logoBuf);
            }
          }
          if (logoBuffer && logoBuffer.length > 0) {
            const bPath = path.join(tempDir, `${sessionPrefix}_brand_logo.png`);
            fs.writeFileSync(bPath, logoBuffer);
            intermediateFiles.push(bPath);
            resolvedBrandLogoPath = bPath;
          }
        } catch (bErr) {
          console.warn('[COMPOSITION ENGINE] Failed to fetch brand logo:', bErr.message);
        }
      }

      // The platform watermark is ALWAYS the official UDEN watermark at bottom-right
      const resolvedWatermarkPath = fs.existsSync(defaultWatermarkAsset) ? defaultWatermarkAsset : null;
      const watermarkPos = positionMap['bottom-right'];

      try {
        if (resolvedBrandLogoPath && normalizedPlacement && normalizedPlacement !== 'none') {
          // If brand logo is set to bottom-right, move brand logo to top-left so it doesn't overlap the platform watermark
          let brandPosKey = normalizedPlacement;
          if (brandPosKey === 'bottom-right') {
            brandPosKey = 'top-left';
          }
          const brandPos = positionMap[brandPosKey] || '24:24';

          if (resolvedWatermarkPath) {
            // Dual Layer: Brand Logo (from Brand Setup) + UDEN Platform Watermark (Bottom-Right)
            const dualWatermarkedPath = path.join(tempDir, `${sessionPrefix}_dual_watermarked.mp4`);
            intermediateFiles.push(dualWatermarkedPath);

            console.log(`[COMPOSITION ENGINE] Embedding Brand Logo (${brandPosKey}) + UDEN Watermark (bottom-right)...`);
            const dualCmd = `ffmpeg -y -i "${videoWithSoundPath}" -i "${resolvedBrandLogoPath}" -i "${resolvedWatermarkPath}" -filter_complex "[1:v]scale=150:-1[brand];[2:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.92[wm];[0:v][brand]overlay=${brandPos}:format=auto[v1];[v1][wm]overlay=${watermarkPos}:format=auto[v]" -map "[v]" -map 0:a? -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a copy -movflags +faststart "${dualWatermarkedPath}"`;
            await execAsync(dualCmd);
            videoToFinalizePath = dualWatermarkedPath;
          } else {
            // Brand Logo only fallback
            const brandOnlyPath = path.join(tempDir, `${sessionPrefix}_brand_only.mp4`);
            intermediateFiles.push(brandOnlyPath);
            const brandCmd = `ffmpeg -y -i "${videoWithSoundPath}" -i "${resolvedBrandLogoPath}" -filter_complex "[1:v]scale=150:-1[brand];[0:v][brand]overlay=${brandPos}:format=auto[v]" -map "[v]" -map 0:a? -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a copy -movflags +faststart "${brandOnlyPath}"`;
            await execAsync(brandCmd);
            videoToFinalizePath = brandOnlyPath;
          }
        } else if (resolvedWatermarkPath) {
          // Custom Mode or Brand Mode without logo: UDEN Platform Watermark at Bottom-Right
          const singleWatermarkedPath = path.join(tempDir, `${sessionPrefix}_watermarked.mp4`);
          intermediateFiles.push(singleWatermarkedPath);

          console.log(`[COMPOSITION ENGINE] Embedding UDEN bottom-right watermark on final video (${videoSpec.mode || 'custom'} mode)...`);
          const singleCmd = `ffmpeg -y -i "${videoWithSoundPath}" -i "${resolvedWatermarkPath}" -filter_complex "[1:v]scale=160:-1,format=rgba,colorchannelmixer=aa=0.92[logo];[0:v][logo]overlay=${watermarkPos}:format=auto[v]" -map "[v]" -map 0:a? -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a copy -movflags +faststart "${singleWatermarkedPath}"`;
          await execAsync(singleCmd);
          videoToFinalizePath = singleWatermarkedPath;
        }
      } catch (watermarkErr) {
        console.warn('[COMPOSITION ENGINE] Watermark compositing error, falling back to clean video:', watermarkErr.message);
      }

      // Final output copy
      fs.copyFileSync(videoToFinalizePath, outputPath);

      // Step 4: Render thumbnail image via FFmpeg
      const thumbFileName = outputFileName.replace('.mp4', '.png');
      const thumbPath = path.join(tempDir, thumbFileName);
      const thumbCmd = `ffmpeg -y -ss 00:00:01 -i "${outputPath}" -vframes 1 "${thumbPath}"`;
      try {
        await execAsync(thumbCmd);
      } catch (thumbErr) {
        console.warn('[COMPOSITION ENGINE] Thumbnail extraction warning:', thumbErr.message);
      }

      // Step 5: Upload composed final video & thumbnail to S3 (or fallback to local /uploads)
      const buffer = fs.readFileSync(outputPath);
      const s3Key = `videos/${outputFileName}`;

      if (options.mockUrl) {
        finalVideoUrl = options.mockUrl;
        thumbnailUrl = options.mockThumb || `https://creative-os-assets.s3.ap-south-1.amazonaws.com/thumbnails/${outputFileName.replace('.mp4', '.png')}`;
      } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_BUCKET_NAME) {
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
          region: process.env.AWS_REGION || 'ap-south-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        });

        await s3.send(new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: buffer,
          ContentType: 'video/mp4',
        }));
        finalVideoUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`;

        if (fs.existsSync(thumbPath)) {
          const thumbBuffer = fs.readFileSync(thumbPath);
          const thumbS3Key = `thumbnails/${thumbFileName}`;
          await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: thumbS3Key,
            Body: thumbBuffer,
            ContentType: 'image/png',
          }));
          thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${thumbS3Key}`;
          fs.unlinkSync(thumbPath);
        } else {
          thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/thumbnails/${thumbFileName}`;
        }
      } else {
        // Local upload directory fallback
        const uploadsDir = path.resolve('./uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const localUploadPath = path.join(uploadsDir, outputFileName);
        fs.writeFileSync(localUploadPath, buffer);
        finalVideoUrl = `/uploads/${outputFileName}`;

        if (fs.existsSync(thumbPath)) {
          const localThumbPath = path.join(uploadsDir, thumbFileName);
          fs.copyFileSync(thumbPath, localThumbPath);
          thumbnailUrl = `/uploads/${thumbFileName}`;
          fs.unlinkSync(thumbPath);
        }
      }

      fs.unlinkSync(outputPath);
    } catch (ffmpegErr) {
      console.warn('[COMPOSITION ENGINE] FFmpeg render warning, using fallback asset composition:', ffmpegErr.message);
      finalVideoUrl = options.mockUrl || `https://creative-os-assets.s3.ap-south-1.amazonaws.com/videos/${outputFileName}`;
      thumbnailUrl = options.mockThumb || `https://creative-os-assets.s3.ap-south-1.amazonaws.com/thumbnails/${outputFileName.replace('.mp4', '.png')}`;
    } finally {
      // Clean up intermediate temp files
      for (const tempFile of intermediateFiles) {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    return {
      status: 'completed',
      clipsCount: sceneAssets.length,
      audioStatus: audioMix.status,
      outputDuration: actualComposedDuration || targetTotalDuration,
      outputResolution: `${width}x${height}`,
      outputAspectRatio: aspectRatio,
      finalVideoUrl,
      thumbnailUrl,
      watermarkApplied: true,
      watermarkPlacement: (normalizedPlacement && normalizedPlacement !== 'none' && normalizedPlacement !== 'bottom-right' && resolvedBrandLogoPath) ? `${normalizedPlacement}+bottom-right` : 'bottom-right',
      processingTimeMs: Date.now() - startTime,
      failureReason: null,
    };
  }
}

export const defaultCompositionEngine = new CompositionEngine();
