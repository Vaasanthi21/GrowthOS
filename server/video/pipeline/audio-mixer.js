import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

export class AudioMixer {
  /**
   * Generates a spoken voiceover audio file from script text using system TTS.
   */
  async generateVoiceoverAudio({ text, outWavPath }) {
    const cleanText = String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[<>"]/g, '')
      .replace(/'/g, "''")
      .trim()
      .slice(0, 2000);

    if (!cleanText) {
      throw new Error('No voiceover text provided');
    }

    const parentDir = path.dirname(outWavPath);
    await fs.mkdir(parentDir, { recursive: true });

    const psScript = `
Add-Type -AssemblyName System.Speech;
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$synth.Rate = 0;
$synth.Volume = 100;
$synth.SetOutputToWaveFile('${outWavPath.replace(/\\/g, '/')}');
$synth.Speak('${cleanText}');
$synth.Dispose();
    `;

    return new Promise((resolve, reject) => {
      const ps = spawn('powershell', ['-NoProfile', '-Command', psScript]);
      let err = '';
      ps.stderr.on('data', d => err += d.toString());
      ps.on('close', code => {
        if (code === 0 && fsSync.existsSync(outWavPath)) {
          resolve(outWavPath);
        } else {
          reject(new Error(err || `PowerShell SpeechSynthesizer exited with code ${code}`));
        }
      });
      ps.on('error', reject);
    });
  }

  /**
   * Generates a rich procedural cinematic ambient soundtrack based on the video theme.
   */
  async generateAmbientSoundtrack({ durationSeconds = 15, theme = '', outWavPath }) {
    const dur = Math.max(2, Number(durationSeconds) || 15);
    const lower = String(theme || '').toLowerCase();

    // Thematic harmonic chords (rich, audible frequencies across bass, mids, and treble)
    let f1 = '293.66'; // D4
    let f2 = '369.99'; // F#4
    let f3 = '440.00'; // A4
    let f4 = '587.33'; // D5
    let f5 = '146.83'; // D3 (Bass)

    if (lower.includes('calm') || lower.includes('peaceful') || lower.includes('nature') || lower.includes('scenery') || lower.includes('sunset')) {
      f1 = '261.63'; // C4
      f2 = '329.63'; // E4
      f3 = '392.00'; // G4
      f4 = '523.25'; // C5
      f5 = '130.81'; // C3 (Bass)
    } else if (lower.includes('energetic') || lower.includes('fast') || lower.includes('action') || lower.includes('promotional') || lower.includes('marketing')) {
      f1 = '329.63'; // E4
      f2 = '392.00'; // G4
      f3 = '493.88'; // B4
      f4 = '659.25'; // E5
      f5 = '164.81'; // E3 (Bass)
    }

    const parentDir = path.dirname(outWavPath);
    await fs.mkdir(parentDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-t', `${dur}`,
        '-f', 'lavfi', '-i', `sine=f=${f1}`,
        '-f', 'lavfi', '-i', `sine=f=${f2}`,
        '-f', 'lavfi', '-i', `sine=f=${f3}`,
        '-f', 'lavfi', '-i', `sine=f=${f4}`,
        '-f', 'lavfi', '-i', `sine=f=${f5}`,
        '-f', 'lavfi', '-i', `anoisesrc=c=pink:r=44100:a=0.015`,
        '-filter_complex', `[0:a]volume=0.35,chorus=0.7:0.9:55:0.4:0.25:2[a0];[1:a]volume=0.30,chorus=0.6:0.8:45:0.3:0.2:1.5[a1];[2:a]volume=0.25[a2];[3:a]volume=0.20[a3];[4:a]volume=0.45[a4];[5:a]lowpass=f=800,volume=0.08[a5];[a0][a1][a2][a3][a4][a5]amix=inputs=6:duration=longest:dropout_transition=2,volume=1.8,afade=t=in:st=0:d=1.0,afade=t=out:st=${Math.max(1, dur - 2)}:d=2[out]`,
        '-map', '[out]',
        '-c:a', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '2',
        '-t', `${dur}`,
        outWavPath
      ]);

      let err = '';
      ffmpeg.stderr.on('data', d => err += d.toString());
      ffmpeg.on('close', code => {
        if (code === 0 && fsSync.existsSync(outWavPath)) {
          resolve(outWavPath);
        } else {
          reject(new Error(err || `FFmpeg ambient generation failed with code ${code}`));
        }
      });
      ffmpeg.on('error', reject);
    });
  }

  /**
   * Generates a complete master soundtrack combining voiceover narration and ambient sound bed.
   */
  async createMasterAudioTrack({ storyboard = [], videoSpec = {}, durationSeconds = 15, sessionPrefix = 'mix', tempDir }) {
    const dur = Math.max(2, Number(durationSeconds) || 15);
    const theme = `${videoSpec.objective || ''} ${videoSpec.visualStyle || ''}`;
    
    // Extract script text from storyboard scene voiceovers or videoSpec
    const voiceoverLines = (storyboard || [])
      .map(s => String(s.voiceover || '').trim())
      .filter(Boolean);

    let scriptText = voiceoverLines.join('. ');
    if (!scriptText) {
      scriptText = videoSpec.objective || 'A cinematic visual journey.';
    }

    const voiceWavPath = path.join(tempDir, `${sessionPrefix}_voiceover.wav`);
    const bedWavPath = path.join(tempDir, `${sessionPrefix}_ambient_bed.wav`);
    const masterAacPath = path.join(tempDir, `${sessionPrefix}_master_audio.aac`);
    let hasVoice = false;
    const shouldVoiceover = videoSpec.audioPlan?.voiceover !== false;
    if (shouldVoiceover && scriptText) {
      try {
        await this.generateVoiceoverAudio({ text: scriptText, outWavPath: voiceWavPath });
        hasVoice = true;
      } catch (voiceErr) {
        console.warn('[AUDIO MIXER] Voiceover generation warning (will use ambient music):', voiceErr.message);
      }
    }

    try {
      await this.generateAmbientSoundtrack({ durationSeconds: dur, theme, outWavPath: bedWavPath });
    } catch (bedErr) {
      console.warn('[AUDIO MIXER] Ambient soundtrack warning:', bedErr.message);
    }

    // Mix voiceover + ambient bed together
    if (hasVoice && fsSync.existsSync(bedWavPath)) {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', voiceWavPath,
          '-i', bedWavPath,
          '-filter_complex', `[0:a]volume=1.5,apad=whole_dur=${dur}[voice];[1:a]volume=0.65[bed];[voice][bed]amix=inputs=2:duration=first:weights=1.0 0.50,afade=t=out:st=${Math.max(1, dur - 1.5)}:d=1.5[out]`,
          '-map', '[out]',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-t', String(dur),
          masterAacPath
        ]);
        let err = '';
        ffmpeg.stderr.on('data', d => err += d.toString());
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(err || `Audio mix failed with code ${code}`)));
        ffmpeg.on('error', reject);
      });
      return masterAacPath;
    } else if (hasVoice) {
      return voiceWavPath;
    } else if (fsSync.existsSync(bedWavPath)) {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', bedWavPath,
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-t', String(dur),
          masterAacPath
        ]);
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`Bed encode failed with code ${code}`)));
        ffmpeg.on('error', reject);
      });
      return masterAacPath;
    }

    return null;
  }

  prepareAudioTracks(sceneAssets = [], videoSpec = {}) {
    const mixedTracks = sceneAssets.map((asset, idx) => {
      const hasAudio = Boolean(asset.hasAudio);
      return {
        sceneId: asset.sceneId,
        sceneIndex: idx,
        hasAudio,
        audioCodec: hasAudio ? 'aac' : 'anullsrc',
        volumeLevel: hasAudio ? 0.8 : 0.0,
        injectSilentAudio: !hasAudio,
      };
    });

    return {
      status: 'mixed',
      audioTracksCount: mixedTracks.length,
      silentTracksInjected: mixedTracks.filter(t => t.injectSilentAudio).length,
      backgroundMusicUrl: videoSpec.brandContext?.backgroundMusicUrl || null,
      voiceoverUrl: videoSpec.brandContext?.voiceoverUrl || null,
      tracks: mixedTracks,
    };
  }
}

export const defaultAudioMixer = new AudioMixer();
