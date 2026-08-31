import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import https from 'https';

export class AudioMixer {
  /**
   * Intelligently selects the optimal Azure Neural Voice based on character gender, presenter identity, brand context, and tone.
   */
  resolveVoiceName(optionsOrBrandContext = {}, theme = '') {
    let brandContext = {};
    let activeTheme = '';
    let promptText = '';
    let characterContext = {};
    let scriptText = '';

    if (typeof optionsOrBrandContext === 'object' && optionsOrBrandContext !== null) {
      if (optionsOrBrandContext.brandContext || optionsOrBrandContext.characterContext || optionsOrBrandContext.promptText || optionsOrBrandContext.scriptText) {
        brandContext = optionsOrBrandContext.brandContext || {};
        activeTheme = optionsOrBrandContext.theme || '';
        promptText = optionsOrBrandContext.promptText || '';
        characterContext = optionsOrBrandContext.characterContext || {};
        scriptText = optionsOrBrandContext.scriptText || '';
      } else {
        brandContext = optionsOrBrandContext;
        activeTheme = theme || '';
      }
    }

    const charStr = `${characterContext?.name || ''} ${characterContext?.role || ''} ${characterContext?.physicalIdentity || ''} ${characterContext?.anchorToken || ''} ${characterContext?.appearance || ''} ${characterContext?.wardrobe || ''}`;
    const combined = `${promptText} ${charStr} ${brandContext.voice || ''} ${brandContext.industry || ''} ${brandContext.tone || ''} ${activeTheme} ${scriptText}`.toLowerCase();

    // 1. Explicit Male Presenter / Character Detection
    const isMale = /\b(boy|man|male|guy|gentleman|father|brother|son|husband|businessman|actor|he|his|him|mr|himself|male presenter|male voice|young man|schoolboy|college boy|deep voice)\b/i.test(
      `${promptText} ${charStr} ${brandContext.voice || ''}`
    );

    // 2. Explicit Female Presenter / Character Detection
    const isFemale = /\b(girl|woman|female|lady|mother|sister|daughter|wife|businesswoman|actress|she|her|hers|ms|mrs|miss|herself|female presenter|female voice|young woman|schoolgirl|college girl)\b/i.test(
      `${promptText} ${charStr} ${brandContext.voice || ''}`
    );

    // Strict Gender Resolution: If character/presenter is male, strictly select from high-definition male neural voices
    if (isMale && !isFemale) {
      if (combined.includes('tech') || combined.includes('software') || combined.includes('innovation') || combined.includes('developer') || combined.includes('code')) {
        return 'en-US-BrianNeural'; // Intelligent, modern, articulate male voice
      }
      if (combined.includes('luxury') || combined.includes('premium') || combined.includes('elegance') || combined.includes('cinematic') || combined.includes('authoritative')) {
        return 'en-US-ChristopherNeural'; // Authoritative, rich, deep cinematic male voice
      }
      if (combined.includes('energetic') || combined.includes('fast') || combined.includes('action') || combined.includes('young') || combined.includes('casual')) {
        return 'en-US-GuyNeural'; // Energetic, vibrant, casual commercial male voice
      }
      if (combined.includes('calm') || combined.includes('peaceful') || combined.includes('wellness') || combined.includes('meditation') || combined.includes('story')) {
        return 'en-US-DavisNeural'; // Warm, calm, reassuring storyteller male voice
      }
      return 'en-US-AndrewNeural'; // Confident, warm, polished commercial presenter male voice
    }

    // Strict Gender Resolution: If character/presenter is female, strictly select from high-definition female neural voices
    if (isFemale && !isMale) {
      if (combined.includes('wellness') || combined.includes('health') || combined.includes('fitness') || combined.includes('calm') || combined.includes('supportive') || combined.includes('mindful')) {
        return 'en-US-AvaNeural'; // Expressive, calm, warm female voice
      }
      if (combined.includes('energetic') || combined.includes('promotional') || combined.includes('marketing') || combined.includes('sales') || combined.includes('launch')) {
        return 'en-US-AriaNeural'; // Crisp, broadcast-grade commercial female voice
      }
      if (combined.includes('friendly') || combined.includes('casual') || combined.includes('lifestyle') || combined.includes('culture')) {
        return 'en-US-EmmaNeural'; // Friendly, vibrant, approachable female voice
      }
      return 'en-US-JennyNeural'; // Clear, confident, professional corporate female voice
    }

    // Gender-neutral / Unspecified Fallback: Match by archetype & tone
    if (combined.includes('wellness') || combined.includes('health') || combined.includes('fitness') || combined.includes('calm') || combined.includes('supportive')) {
      return 'en-US-AvaNeural';
    }
    if (combined.includes('tech') || combined.includes('software') || combined.includes('innovation') || combined.includes('developer')) {
      return 'en-US-BrianNeural';
    }
    if (combined.includes('luxury') || combined.includes('premium') || combined.includes('elegance') || combined.includes('fashion')) {
      return 'en-US-ChristopherNeural';
    }
    if (combined.includes('energetic') || combined.includes('promotional') || combined.includes('marketing') || combined.includes('sales')) {
      return 'en-US-AndrewNeural';
    }
    if (combined.includes('friendly') || combined.includes('casual') || combined.includes('lifestyle')) {
      return 'en-US-EmmaNeural';
    }
    return 'en-US-AndrewNeural';
  }

  /**
   * Generates high-fidelity neural voiceover audio using Azure Cognitive Services Speech REST API.
   * Falls back gracefully to system synthesizer if offline.
   */
  async generateVoiceoverAudio({ text, outWavPath, brandContext = {}, theme = '', characterContext = {}, promptText = '' }) {
    const cleanText = String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 3000);

    if (!cleanText) {
      throw new Error('No voiceover text provided');
    }

    const parentDir = path.dirname(outWavPath);
    await fs.mkdir(parentDir, { recursive: true });

    const voiceName = this.resolveVoiceName({ brandContext, theme, characterContext, promptText, scriptText: cleanText });
    const speechKey = process.env.AZURE_SPEECH_KEY || process.env.AZURE_OPENAI_IMAGE_API_KEY;
    const region = process.env.AZURE_SPEECH_REGION || 'swedencentral';

    // 1. Primary Engine: Azure Neural AI Voice Synthesis
    if (speechKey) {
      try {
        const tempMp3Path = outWavPath.replace(/\.wav$/i, '_neural.mp3');
        const escapedText = cleanText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voiceName}'><prosody rate='+0%' pitch='+0Hz'>${escapedText}</prosody></voice></speak>`;

        const mp3Buffer = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: `${region}.tts.speech.microsoft.com`,
            path: '/cognitiveservices/v1',
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': speechKey,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
              'User-Agent': 'GrowthOS-VideoStudio-TTS',
              'Content-Length': Buffer.byteLength(ssml)
            },
            rejectUnauthorized: false
          }, (res) => {
            if (res.statusCode !== 200) {
              return reject(new Error(`Azure Speech API returned ${res.statusCode}: ${res.statusMessage}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          });

          req.on('error', reject);
          req.write(ssml);
          req.end();
        });

        await fs.writeFile(tempMp3Path, mp3Buffer);

        // Convert MP3 to standard 44.1kHz Stereo WAV for composition engine
        await new Promise((resolve, reject) => {
          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i', tempMp3Path,
            '-ar', '44100',
            '-ac', '2',
            '-c:a', 'pcm_s16le',
            outWavPath
          ]);
          let err = '';
          ffmpeg.stderr.on('data', d => err += d.toString());
          ffmpeg.on('close', async (code) => {
            try { await fs.unlink(tempMp3Path); } catch (_) {}
            if (code === 0 && fsSync.existsSync(outWavPath)) {
              resolve();
            } else {
              reject(new Error(err || `FFmpeg WAV conversion failed with code ${code}`));
            }
          });
          ffmpeg.on('error', reject);
        });

        return { outWavPath, voiceType: `Neural AI (${voiceName})` };
      } catch (azureErr) {
        console.warn(`[AUDIO MIXER] Neural TTS unavailable (${azureErr.message}). Falling back to system synthesizer...`);
      }
    }

    // 2. Fallback Engine: System Speech Synthesizer
    const scriptTxtPath = outWavPath.replace(/\.wav$/i, '_tts.txt');
    await fs.writeFile(scriptTxtPath, cleanText, 'utf8');

    const psScript = `
Add-Type -AssemblyName System.Speech;
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$synth.Rate = 0;
$synth.Volume = 100;
$txt = [System.IO.File]::ReadAllText('${scriptTxtPath.replace(/\\/g, '/')}');
$synth.SetOutputToWaveFile('${outWavPath.replace(/\\/g, '/')}');
$synth.Speak($txt);
$synth.Dispose();
    `;

    return new Promise((resolve, reject) => {
      const ps = spawn('powershell', ['-NoProfile', '-Command', psScript]);
      let err = '';
      ps.stderr.on('data', d => err += d.toString());
      ps.on('close', async (code) => {
        try { await fs.unlink(scriptTxtPath); } catch (_) {}
        if (code === 0 && fsSync.existsSync(outWavPath)) {
          resolve({ outWavPath, voiceType: 'System TTS' });
        } else {
          reject(new Error(err || `PowerShell SpeechSynthesizer exited with code ${code}`));
        }
      });
      ps.on('error', reject);
    });
  }

  /**
   * Generates a rich, studio-quality harmonic ambient soundtrack based on video theme and brand personality.
   */
  async generateAmbientSoundtrack({ durationSeconds = 15, theme = '', brandContext = {}, outWavPath }) {
    const dur = Math.max(2, Number(durationSeconds) || 15);
    const combined = `${theme} ${brandContext.industry || ''} ${brandContext.voice || ''} ${brandContext.purpose || ''}`.toLowerCase();

    // Thematic harmonic chords (rich, audible frequencies across sub-bass, root, third, fifth, and shimmer)
    let f1 = '146.83'; // D3 (Bass)
    let f2 = '293.66'; // D4 (Root)
    let f3 = '369.99'; // F#4 (Major 3rd)
    let f4 = '440.00'; // A4 (5th)
    let f5 = '587.33'; // D5 (High Shimmer)
    let themeCategory = 'Technology & Innovation';

    if (combined.includes('wellness') || combined.includes('health') || combined.includes('fitness') || combined.includes('lifestyle')) {
      f1 = '164.81'; // E3 (Bass)
      f2 = '329.63'; // E4 (Root)
      f3 = '415.30'; // G#4 (Major 3rd)
      f4 = '493.88'; // B4 (5th)
      f5 = '659.25'; // E5 (High Shimmer)
      themeCategory = 'Wellness & Lifestyle';
    } else if (combined.includes('corporate') || combined.includes('enterprise') || combined.includes('professional') || combined.includes('recruitment')) {
      f1 = '110.00'; // A2 (Bass)
      f2 = '220.00'; // A3 (Root)
      f3 = '277.18'; // C#4 (Major 3rd)
      f4 = '329.63'; // E4 (5th)
      f5 = '440.00'; // A4 (High Shimmer)
      themeCategory = 'Corporate & Enterprise';
    } else if (combined.includes('luxury') || combined.includes('premium') || combined.includes('elegance')) {
      f1 = '130.81'; // C3 (Bass)
      f2 = '261.63'; // C4 (Root)
      f3 = '329.63'; // E4 (Major 3rd)
      f4 = '392.00'; // G4 (5th)
      f5 = '523.25'; // C5 (High Shimmer)
      themeCategory = 'Luxury & Premium';
    } else if (combined.includes('calm') || combined.includes('peaceful') || combined.includes('nature') || combined.includes('scenery') || combined.includes('forest')) {
      f1 = '130.81'; // C3 (Bass)
      f2 = '196.00'; // G3 (5th)
      f3 = '261.63'; // C4 (Root)
      f4 = '329.63'; // E4 (3rd)
      f5 = '392.00'; // G4 (5th Shimmer)
      themeCategory = 'Nature & Serenity';
    } else if (combined.includes('energetic') || combined.includes('action') || combined.includes('promotional') || combined.includes('marketing')) {
      f1 = '98.00';  // G2 (Deep Bass)
      f2 = '196.00'; // G3 (Bass Root)
      f3 = '246.94'; // B3 (Major 3rd)
      f4 = '293.66'; // D4 (5th)
      f5 = '392.00'; // G4 (High Shimmer)
      themeCategory = 'High-Energy Promotional';
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
        '-f', 'lavfi', '-i', `anoisesrc=c=pink:r=44100:a=0.008`,
        '-filter_complex', `[0:a]volume=0.45[b];[1:a]volume=0.30,chorus=0.7:0.9:55:0.4:0.25:2[r];[2:a]volume=0.25,chorus=0.6:0.8:45:0.3:0.2:1.5[t];[3:a]volume=0.20,chorus=0.5:0.7:35:0.3:0.2:2[f];[4:a]volume=0.18[h];[5:a]lowpass=f=1200,volume=0.06[air];[b][r][t][f][h][air]amix=inputs=6:duration=longest,lowpass=f=2400,volume=1.2,afade=t=in:st=0:d=1.0,afade=t=out:st=${Math.max(1, dur - 2)}:d=2[out]`,
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
          resolve({ outWavPath, themeCategory });
        } else {
          reject(new Error(err || `FFmpeg ambient generation failed with code ${code}`));
        }
      });
      ffmpeg.on('error', reject);
    });
  }

  /**
   * Generates a complete master soundtrack combining neural voiceover narration and studio sound bed.
   */
  async createMasterAudioTrack({ storyboard = [], videoSpec = {}, durationSeconds = 15, sessionPrefix = 'mix', tempDir }) {
    const dur = Math.max(2, Number(durationSeconds) || 15);
    const theme = `${videoSpec.objective || ''} ${videoSpec.visualStyle || ''}`;
    const brandContext = videoSpec.brandContext || {};
    
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
    let voiceSynthesisType = 'Neural AI';
    const shouldVoiceover = videoSpec.audioPlan?.voiceover !== false;

    const characterContext = videoSpec.continuityContext?.characterBible || videoSpec.characterContext || videoSpec.character || {};
    const promptText = `${videoSpec.objective || ''} ${videoSpec.continuityContext?.directives?.rawText || ''} ${videoSpec.visualStyle || ''}`;

    if (shouldVoiceover && scriptText) {
      try {
        const vResult = await this.generateVoiceoverAudio({
          text: scriptText,
          outWavPath: voiceWavPath,
          brandContext,
          theme,
          characterContext,
          promptText,
        });
        voiceSynthesisType = vResult?.voiceType || voiceSynthesisType;
        hasVoice = true;
      } catch (voiceErr) {
        console.warn('[AUDIO MIXER] Voiceover generation warning (will use ambient music):', voiceErr.message);
      }
    }

    let audioThemeCategory = 'Harmonic Bed';
    try {
      const bedResult = await this.generateAmbientSoundtrack({ durationSeconds: dur, theme, brandContext, outWavPath: bedWavPath });
      audioThemeCategory = bedResult?.themeCategory || audioThemeCategory;
    } catch (bedErr) {
      console.warn('[AUDIO MIXER] Ambient soundtrack warning:', bedErr.message);
    }

    // Dynamic Ducking Mix: Voiceover at 1.4 volume with 0.35 background music bed
    if (hasVoice && fsSync.existsSync(bedWavPath)) {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', voiceWavPath,
          '-i', bedWavPath,
          '-filter_complex', `[0:a]volume=1.4,apad=whole_dur=${dur}[voice];[1:a]volume=0.35[bed];[voice][bed]amix=inputs=2:duration=first:weights=1.0 0.40,afade=t=out:st=${Math.max(1, dur - 1.5)}:d=1.5[out]`,
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
      console.log(`[AUDIO_PIPELINE] Voiceover: SYNTHESIZED (${voiceSynthesisType}) | Music Bed: SYNTHESIZED (${audioThemeCategory}) | Master: ${masterAacPath}`);
      return masterAacPath;
    } else if (hasVoice) {
      console.log(`[AUDIO_PIPELINE] Voiceover: SYNTHESIZED (${voiceSynthesisType}) | Music Bed: NONE | Master: ${voiceWavPath}`);
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
      console.log(`[AUDIO_PIPELINE] Voiceover: NOT_CONFIGURED | Music Bed: SYNTHESIZED (${audioThemeCategory}) | Master: ${masterAacPath}`);
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

