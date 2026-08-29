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
  async generateAmbientSoundtrack({ durationSeconds = 15, theme = '', outAacPath }) {
    const dur = Math.max(2, Number(durationSeconds) || 15);
    const lower = String(theme || '').toLowerCase();

    // Thematic harmonic chords (C Major 7th for sunset/nature, D Minor 9th for tech/corporate)
    let f1 = '130.81'; // C3
    let f2 = '164.81'; // E3
    let f3 = '196.00'; // G3
    let f4 = '246.94'; // B3
    let noiseFilter = 'lowpass=f=350';

    if (lower.includes('tech') || lower.includes('ai') || lower.includes('software') || lower.includes('platform') || lower.includes('code') || lower.includes('uden')) {
      f1 = '146.83'; // D3
      f2 = '174.61'; // F3
      f3 = '220.00'; // A3
      f4 = '261.63'; // C4
      noiseFilter = 'lowpass=f=450';
    } else if (lower.includes('energetic') || lower.includes('fast') || lower.includes('action')) {
      f1 = '164.81'; // E3
      f2 = '207.65'; // G#3
      f3 = '246.94'; // B3
      f4 = '329.63'; // E4
      noiseFilter = 'bandpass=f=600:w=200';
    }

    const parentDir = path.dirname(outAacPath);
    await fs.mkdir(parentDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', `sine=f=${f1}:d=${dur}`,
        '-f', 'lavfi', '-i', `sine=f=${f2}:d=${dur}`,
        '-f', 'lavfi', '-i', `sine=f=${f3}:d=${dur}`,
        '-f', 'lavfi', '-i', `sine=f=${f4}:d=${dur}`,
        '-f', 'lavfi', '-i', `anoisesrc=d=${dur}:c=pink:r=44100:a=0.012`,
        '-filter_complex', `[0:a]volume=0.20[a0];[1:a]volume=0.15[a1];[2:a]volume=0.12[a2];[3:a]volume=0.10[a3];[4:a]${noiseFilter},volume=0.06[a4];[a0][a1][a2][a3][a4]amix=inputs=5:duration=first:dropout_transition=2,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(1, dur - 2)}:d=2[out]`,
        '-map', '[out]',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        outAacPath
      ]);

      let err = '';
      ffmpeg.stderr.on('data', d => err += d.toString());
      ffmpeg.on('close', code => {
        if (code === 0 && fsSync.existsSync(outAacPath)) {
          resolve(outAacPath);
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
    const bedAacPath = path.join(tempDir, `${sessionPrefix}_ambient_bed.aac`);
    const masterAacPath = path.join(tempDir, `${sessionPrefix}_master_audio.aac`);

    let hasVoice = false;
    try {
      await this.generateVoiceoverAudio({ text: scriptText, outWavPath: voiceWavPath });
      hasVoice = true;
    } catch (voiceErr) {
      console.warn('[AUDIO MIXER] Voiceover generation warning (will use ambient music):', voiceErr.message);
    }

    try {
      await this.generateAmbientSoundtrack({ durationSeconds: dur, theme, outAacPath: bedAacPath });
    } catch (bedErr) {
      console.warn('[AUDIO MIXER] Ambient soundtrack warning:', bedErr.message);
    }

    // Mix voiceover + ambient bed together
    if (hasVoice && fsSync.existsSync(bedAacPath)) {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', voiceWavPath,
          '-i', bedAacPath,
          '-filter_complex', `[0:a]volume=1.35,apad=whole_dur=${dur}[voice];[1:a]volume=0.40[bed];[voice][bed]amix=inputs=2:duration=first:weights=1.0 0.35,afade=t=out:st=${Math.max(1, dur - 1.5)}:d=1.5[out]`,
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
    } else if (fsSync.existsSync(bedAacPath)) {
      return bedAacPath;
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
