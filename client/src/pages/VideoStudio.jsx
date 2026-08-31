import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGenerationJobs } from '@/contexts/GenerationJobsContext';
import { buildCompanyPersonaPayload } from '@/utils/personaPayload';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Download, Share2, RefreshCw, Video, Play, Pause, Volume2, Film, Sliders, Eye, Wand2, Maximize2, Layers, Building2, Copy, Clock } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, tokenStorage } from '@/api/apiClient';
import { addHistoryEntry } from '@/services/aiService';
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { persistRefineSession } from '@/utils';
import { toast } from '@/components/ui/use-toast';
import RealtimeVideoPipelineTracker from '@/components/generate/RealtimeVideoPipelineTracker';
import CaptionCharacterCounter from '@/components/generate/CaptionCharacterCounter';

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
];

const VIDEO_STYLES = [
  { value: 'cinematic', label: 'Cinematic Hyper-Real' },
  { value: 'documentary', label: 'Documentary Realism' },
  { value: 'promotional', label: 'High-Impact Promotional' },
  { value: 'testimonial', label: 'Authentic Testimonial' },
  { value: 'tutorial', label: 'Crisp E-Learning Tutorial' },
  { value: 'animated', label: '3D Stylized Animated' },
  { value: 'live-action', label: 'Natural Live Action' },
  { value: 'minimalist', label: 'Clean Editorial Minimalist' },
];

const VIDEO_DURATIONS = [
  { value: '15', label: '15 seconds', description: 'Standard social short' },
  { value: '30', label: '30 seconds', description: 'Multi-scene narrative' },
  { value: '60', label: '60 seconds (1 min)', description: 'Extended story feature' },
  { value: '90', label: '90 seconds (1.5 mins)', description: 'Deep-dive showcase' },
  { value: '120', label: '120 seconds (2 mins)', description: 'Full cinematic explainer' },
];

// Note: 1:1 (Square) intentionally excluded - Azure Sora's video API only
// supports '720x1280', '1280x720', '1024x1792', '1792x1024' (all rectangular,
// no square option exists). Requesting a square size returns a hard error
// from Azure, so we don't offer it in the UI at all.
const ASPECT_RATIOS = [
  { value: '16:9', label: 'Landscape (16:9)', description: 'Standard widescreen' },
  { value: '9:16', label: 'Portrait (9:16)', description: 'Optimized for Reels & Shorts' }
];

const LOGO_PLACEMENTS = [
  { value: 'none', label: 'No logo' },
  { value: 'top_left', label: 'Top Left' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'bottom_left', label: 'Bottom Left' },
  { value: 'bottom_right', label: 'Bottom Right' },
  { value: 'center', label: 'Centralized overlay' },
];

const ESTIMATED_TOTAL_MS = 600000; // 10 minutes total video processing allocation

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '');

const formatRemainingTime = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};

// Calls the backend to create a masked, non-S3 share link for the given
// asset URL. Same endpoint the Image Studio uses - hides the bucket host
// from social crawlers by proxying through /share/:id and /api/public-asset/:id.
const createShareLink = async (assetUrl, caption, title, thumbnailUrl = '') => {
  const token = tokenStorage.getUserToken();
  const response = await fetch(`${API_ORIGIN}/api/create-share-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assetUrl, caption, title, thumbnailUrl }),
  });
  if (!response.ok) throw new Error('Failed to create share link');
  const data = await response.json();
  return String(data.shareUrl || '').replace('/api/share/', '/share/');
};

// Builds platform share-intent URLs. These are plain links (no Web Share API),
// so they work over HTTP and on desktop, unlike navigator.share.
const getShareLinks = (videoUrl, caption) => {
  const sanitizedUrl = String(videoUrl || '').replace('/api/share/', '/share/');
  const encodedUrl = encodeURIComponent(sanitizedUrl);
  const encodedText = encodeURIComponent(caption || '');
  return {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    twitter: `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };
};

export default function VideoStudio() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { getJob, setJob, clearJob } = useGenerationJobs();
  const videoJob = getJob('video');
  const [generationMode, setGenerationMode] = useState('brand'); // 'brand' | 'custom'
  const [prompt, setPrompt] = useState(() => videoJob?.prompt || location.state?.prompt || '');
  const [platform, setPlatform] = useState('instagram');
  const [style, setStyle] = useState('cinematic');
  const [aspectRatio, setAspectRatio] = useState('9:16'); 
  const [duration, setDuration] = useState(() => String(videoJob?.duration || '15'));
  const [logoPlacement, setLogoPlacement] = useState('top_right');
  const [selectedPersona, setSelectedPersona] = useState(''); 
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [isInstagramModalOpen, setIsInstagramModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

  // Auto-sync duration if user mentions explicit duration in prompt text
  useEffect(() => {
    const trimmed = String(prompt || '').trim();
    if (!trimmed) return;
    const minMatch = trimmed.match(/\b(1|2)\s*(?:m|min|mins|minute|minutes)\b/i);
    const secMatch = trimmed.match(/\b(15|30|60|90|120)\s*(?:s|sec|secs|second|seconds)\b/i);
    if (minMatch) {
      const minVal = parseInt(minMatch[1], 10);
      setDuration(String(minVal * 60));
    } else if (secMatch) {
      setDuration(secMatch[1]);
    }
  }, [prompt]);
  
  const [pan, setPan] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [motionStrength, setMotionStrength] = useState(5);
  
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const videoRef = useRef(null);

  const generatedVideo = videoJob?.generatedVideo || null;
  const generatedThumbnail = videoJob?.generatedThumbnail || null;
  const isPolling = videoJob?.isPolling || false;
  const pollingStatus = videoJob?.pollingStatus || null;
  const stageStartedAt = videoJob?.stageStartedAt || null;
  const errorMessage = videoJob?.errorMessage || null;
  const [stageElapsedMs, setStageElapsedMs] = useState(0);
  const navigate = useNavigate();
  const [includeCaption, setIncludeCaption] = useState(() => {
    const saved = videoJob?.includeCaption;
    return saved !== undefined ? saved : true;
  });
  const [generatedCaption, setGeneratedCaption] = useState(() => videoJob?.generatedCaption || "");
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const lastFetchedPromptRef = useRef("");

  useEffect(() => {
    setJob('video', {
      prompt,
      generatedCaption,
      includeCaption
    });
  }, [prompt, generatedCaption, includeCaption, setJob]);

  useEffect(() => {
    setShareUrl(null);
    setGeneratedCaption("");
  }, [includeCaption]);

  const [selectedTone, setSelectedTone] = useState("Professional");

  const triggerCaptionGeneration = useCallback(async (textPrompt, toneOverride, platformOverride) => {
    const trimmed = String(textPrompt || '').trim();
    if (!trimmed) return;
    const toneToUse = toneOverride || selectedTone;
    const platformToUse = platformOverride || platform || 'instagram';

    setIsGeneratingCaption(true);
    try {
      const token = tokenStorage.getUserToken();
      const captionRes = await apiClient.post('/generate-caption', {
        prompt: trimmed,
        platform: platformToUse,
        tone: toneToUse,
      }, token);
      setGeneratedCaption(captionRes?.caption || trimmed);
    } catch (e) {
      console.error("Failed to generate caption:", e);
      setGeneratedCaption(trimmed);
    } finally {
      setIsGeneratingCaption(false);
    }
  }, [selectedTone, platform]);

  useEffect(() => {
    if (generatedVideo && includeCaption && !generatedCaption && !isGeneratingCaption) {
      triggerCaptionGeneration(prompt);
    }
  }, [generatedVideo, includeCaption, generatedCaption, isGeneratingCaption, prompt, triggerCaptionGeneration]);

  const handleCopyCaption = async () => {
    if (!generatedCaption) return;
    try {
      await navigator.clipboard.writeText(generatedCaption);
      alert('Caption copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy caption:', err);
    }
  };

  const handleRegenerateCaption = () => {
    setShareUrl(null);
    lastFetchedPromptRef.current = "";
    triggerCaptionGeneration(prompt, selectedTone, platform);
  };

  const openRefinePage = () => {
    if (!generatedVideo) return;

    const selectedPersonaObj = personasList?.find(p => p.id === selectedPersona) || null;
    const activePersonaKey = selectedPersona || 'linkedin';

    const refineState = {
      activePersona: activePersonaKey,
      params: {
        contentType: 'video-only',
        tone: 50,
        length: 50,
        keywords: '',
        topic: prompt,
        companyPersona: selectedPersonaObj ? {
          id: selectedPersonaObj.id,
          name: selectedPersonaObj.name,
          company: selectedPersonaObj.company || selectedPersonaObj.name,
        } : null,
      },
      generatedContent: {
        video_url: generatedVideo,
        content: includeCaption ? (generatedCaption || "") : "",
      },
      ragContext: '',
      originalPrompt: prompt,
      messages: [
        {
          role: "assistant",
          content: includeCaption ? (generatedCaption || "") : "",
          video_url: generatedVideo,
          video_prompt: prompt,
        },
      ],
    };

    persistRefineSession(refineState);
    navigate("/refine", { state: refineState });
  };

  const hasResumedRef = useRef(false);

  const { data: personasList, isLoading: loadingPersonas } = useQuery({
    queryKey: ['companyPersonasOverviewList'],
    queryFn: async () => {
      const token = tokenStorage.getUserToken();
      if (!token) return [];
      const response = await apiClient.get('/company-personas', token);

      if (Array.isArray(response)) return response;
      if (Array.isArray(response?.items)) return response.items;
      if (Array.isArray(response?.data)) return response.data;
      if (Array.isArray(response?.personas)) return response.personas;
      if (Array.isArray(response?.data?.personas)) return response.data.personas;

      return [];
    }
  });

  useEffect(() => {
    if (personasList?.length > 0 && !selectedPersona) {
      const defaultActive = personasList.find(p => p.isActive || p.active) || personasList[0];
      setSelectedPersona(defaultActive.id || defaultActive._id);
    }
  }, [personasList, selectedPersona]);

  // Resolve the selected persona ID into its full object. The backend's
  // /api/generate-video route only reads req.body.companyPersona (a full
  // object with logoUrl already on it) - it does not look up persona_id
  // server-side - so we must resolve it to the full object here before
  // sending, rather than sending the bare ID alone.
  const selectedPersonaObject = personasList?.find(
    (p) => (p.id || p._id) === selectedPersona
  ) || null;

  useEffect(() => {
    if (!isPolling || !stageStartedAt) {
      setStageElapsedMs(0);
      return undefined;
    }
    const updateElapsed = () => {
      setStageElapsedMs(Date.now() - stageStartedAt);
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [isPolling, stageStartedAt]);

  const estimatedTotalMs = Math.max(30000, ((Number(duration) || 15) / 10) * 12000 + 20000);

  const displayProgressValue = isPolling
    ? (videoJob?.progress && videoJob.progress > 0
        ? videoJob.progress
        : Math.min(96, Math.max(8, Math.round((stageElapsedMs / estimatedTotalMs) * 100))))
    : 0;

  const displayRemainingMs = Math.max(0, estimatedTotalMs - stageElapsedMs);
  const activePollIntervalRef = useRef(null);

  const handleResetGeneration = useCallback(() => {
    if (activePollIntervalRef.current) {
      clearInterval(activePollIntervalRef.current);
      activePollIntervalRef.current = null;
    }
    setJob('video', {
      isPolling: false,
      stageStartedAt: null,
      pollingStatus: 'idle',
      errorMessage: null,
      progress: 0,
      jobId: null,
    });
    toast({
      title: "Generation Reset",
      description: "Studio is ready for a new prompt generation.",
    });
  }, [setJob]);

  // Shared polling logic, used both for a freshly started generation and for
  // resuming a job that was already in flight when the user navigates back.
  const attachPoller = useCallback((jobId) => {
    if (activePollIntervalRef.current) {
      clearInterval(activePollIntervalRef.current);
    }

    let consecutiveErrors = 0;

    activePollIntervalRef.current = setInterval(async () => {
      try {
        const token = tokenStorage.getUserToken();
        const statusResponse = await apiClient.get(
          `/video-status/${encodeURIComponent(jobId)}`,
          token
        );

        consecutiveErrors = 0;
        const statusCode = statusResponse.status;
        setJob('video', {
          pollingStatus: statusCode,
          phase: statusResponse.phase,
          progress: statusResponse.progress,
        });

        if (statusCode === 'completed') {
          if (activePollIntervalRef.current) {
            clearInterval(activePollIntervalRef.current);
            activePollIntervalRef.current = null;
          }

          if (statusResponse.video_url) {
            const videoEntry = {
              topic: statusResponse.prompt || prompt,
              content_type: "Video",
              platform: platform,
              variants: [{
                content: statusResponse.prompt || prompt,
                video_url: statusResponse.video_url,
                thumbnail_url: statusResponse.thumbnail_url || null,
                title: platform + " Video"
              }],
              status: "completed"
            };
            addHistoryEntry(videoEntry).catch(err => console.error("Failed to save video to history:", err));

            try {
              localStorage.setItem('growth_os_latest_video', JSON.stringify({
                video_url: statusResponse.video_url,
                thumbnail_url: statusResponse.thumbnail_url || null,
                prompt: statusResponse.prompt || prompt,
                platform: platform,
                completedAt: Date.now(),
              }));
            } catch (e) {}

            setJob('video', {
              isPolling: false,
              stageStartedAt: null,
              pollingStatus: 'completed',
              generatedVideo: statusResponse.video_url,
              generatedThumbnail: statusResponse.thumbnail_url || null,
              errorMessage: null,
              progress: 100,
            });
            queryClient.invalidateQueries({ queryKey: ['contentHistory'] });
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
          } else {
            setJob('video', { isPolling: false, stageStartedAt: null, pollingStatus: 'failed' });
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
          }
        } else if (statusCode === 'failed') {
          if (activePollIntervalRef.current) {
            clearInterval(activePollIntervalRef.current);
            activePollIntervalRef.current = null;
          }
          setJob('video', {
            isPolling: false,
            stageStartedAt: null,
            pollingStatus: 'failed',
            errorMessage: statusResponse.error || 'Video generation failed',
          });
          queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        }
      } catch (error) {
        consecutiveErrors++;
        console.error('Polling error:', error);
        if (consecutiveErrors >= 10) {
          if (activePollIntervalRef.current) {
            clearInterval(activePollIntervalRef.current);
            activePollIntervalRef.current = null;
          }
          setJob('video', {
            isPolling: false,
            stageStartedAt: null,
            pollingStatus: 'failed',
            errorMessage: 'Connection to server timed out or session expired. Click Reset to start again.',
          });
        }
      }
    }, 1200);
  }, [prompt, platform, setJob, queryClient]);

  // On mount: if a job was already in flight when the user navigated away, resume
  // polling it here instead of starting fresh. If finished, hydrate canvas from localStorage.
  useEffect(() => {
    if (hasResumedRef.current) return;
    hasResumedRef.current = true;

    const existing = videoJob;
    if (existing?.jobId && existing.isPolling && existing.pollingStatus !== 'completed' && existing.pollingStatus !== 'failed') {
      attachPoller(existing.jobId);
    } else if (!existing?.generatedVideo) {
      try {
        const saved = JSON.parse(localStorage.getItem('growth_os_latest_video') || 'null');
        if (saved?.video_url) {
          setJob('video', {
            generatedVideo: saved.video_url,
            generatedThumbnail: saved.thumbnail_url || null,
            pollingStatus: 'completed',
            progress: 100,
            isPolling: false,
          });
          if (saved.prompt && !prompt) {
            setPrompt(saved.prompt);
          }
        }
      } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateMutation = useMutation({
    mutationFn: async (params) => {
      setJob('video', { pollingStatus: 'preparing' });
      const token = tokenStorage.getUserToken();
      if (!token) {
        throw new Error('User token not available');
      }

      const activeStyleLabel = VIDEO_STYLES.find(s => s.value === params.style)?.label || params.style;
      const finalBuiltPrompt = `${params.prompt}, shot in a distinct ${activeStyleLabel} style environment`;

      const isBrand = params.mode === 'brand';
      const companyPersonaPayload = isBrand && params.personaObject
        ? buildCompanyPersonaPayload(params.personaObject)
        : null;

      const response = await apiClient.post('/generate-video', {
        topic: finalBuiltPrompt,
        platform: params.platform,
        contentType: params.style,
        aspect_ratio: params.aspectRatio,     // backend strict schema expects snake_case
        duration: Number(params.duration || 15),
        duration_seconds: Number(params.duration || 15),
        durationSeconds: Number(params.duration || 15),
        mode: isBrand ? 'brand' : 'custom',
        companyPersona: companyPersonaPayload,
        logoPlacement: isBrand ? (params.logoPlacement || 'none') : 'none',
        logo_placement: isBrand ? (params.logoPlacement || 'none') : 'none', 
        logoUrl: isBrand ? (params.logoUrl || '') : '',
        cameraPan: params.pan,
        cameraZoom: params.zoom,
        motionStrength: params.motionStrength,
        async: true,
      }, token);

      return response;
    },
    onSuccess: (response) => {
      const jobId = response.video_id || response.jobId || response.id || response.job_id;

      if (!jobId) {
        setJob('video', { pollingStatus: 'failed', isPolling: false, errorMessage: 'No job ID returned from server' });
        return;
      }

      setJob('video', {
        jobId,
        isPolling: true,
        stageStartedAt: Date.now(),
        pollingStatus: 'queued',
        errorMessage: null,
        generatedVideo: null,
      });

      queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
      attachPoller(jobId);
    },
    onError: (error) => {
      setJob('video', {
        isPolling: false,
        stageStartedAt: null,
        pollingStatus: 'failed',
        errorMessage: error.message || 'Video generation failed',
      });
    },
  });

  const submitGeneration = useCallback(() => {
    const isBrand = generationMode === 'brand';
    generateMutation.mutate({
      prompt: prompt.trim(),
      platform: platform,
      style: style,
      aspectRatio: aspectRatio,
      duration: Number(duration || 15),
      mode: isBrand ? 'brand' : 'custom',
      personaObject: isBrand ? selectedPersonaObject : null, 
      logoPlacement: isBrand ? logoPlacement : 'none',
      logoUrl: isBrand ? (selectedPersonaObject?.logoUrl || selectedPersonaObject?.logo_url || '') : '',
      pan: pan,
      zoom: zoom,
      motionStrength: motionStrength
    });
  }, [prompt, platform, style, aspectRatio, duration, generationMode, selectedPersonaObject, logoPlacement, pan, zoom, motionStrength, generateMutation]);

  const handleAnimate = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt first');
      return;
    }
    setShowCameraModal(true);
  };

  const handleGenerateClick = () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }
    setJob('video', { errorMessage: null });
    setShowConfirmDialog(true);
  };

  const handleDownload = async () => {
    if (!generatedVideo) return;
    const filename = `creativeos-video-${Date.now()}.mp4`;
    try {
      const token = tokenStorage.getUserToken();
      const downloadUrl = `${API_ORIGIN}/api/download-asset?url=${encodeURIComponent(generatedVideo)}&filename=${encodeURIComponent(filename)}`;

      const response = await fetch(downloadUrl, {
        headers: token ? {
          Authorization: `Bearer ${token}`,
          'X-Auth-Token': token,
        } : {},
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Download started', description: 'Your video file is downloading.' });
    } catch (error) {
      console.warn('Backend download proxy failed, trying direct blob fetch:', error);
      try {
        const directResp = await fetch(generatedVideo);
        const directBlob = await directResp.blob();
        const url = window.URL.createObjectURL(directBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (directErr) {
        console.error('Direct download also failed:', directErr);
        window.open(generatedVideo, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    let success = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);
      }
    }

    if (!success) {
      // navigator.clipboard is unavailable on plain HTTP origins (non-secure context).
      // Fall back to the legacy execCommand approach via a hidden textarea.
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        success = document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textarea);
    }

    alert(success ? 'Link copied to clipboard!' : 'Could not copy automatically. Long-press or select the link text to copy it manually.');
    setShowSharePopover(false);
  };

  const resolveAssetUrl = (value) => {
    const source = String(value || "").trim();
    if (!source) return "";
    if (source.includes('amazonaws.com') || source.includes('/images/')) {
      const filename = source.split('/').pop();
      const baseUrl = window.location.origin;
      return `${baseUrl}/api/images/view/${filename}`;
    }
    if (/^https?:\/\//i.test(source) || source.startsWith("data:") || source.startsWith("blob:")) {
      return source;
    }
    return `${API_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
  };

  const handleInstagramShare = async () => {
    const mediaUrl = generatedVideo;
    const caption = generatedCaption || prompt || "";
    const title = `${platform.toUpperCase()} Studio Video (${aspectRatio})`;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && navigator.share && navigator.canShare && mediaUrl) {
      try {
        const response = await fetch(resolveAssetUrl(mediaUrl));
        const blob = await response.blob();
        const file = new File([blob], `post.mp4`, { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title,
            text: caption,
            files: [file]
          });
          setShowSharePopover(false);
          return;
        }
      } catch (err) {
        console.warn("Mobile native sharing failed, falling back to copy/download:", err);
      }
    }

    setIsInstagramModalOpen(true);
    setShowSharePopover(false);
  };

  const handleInstagramCopyAndDownload = async () => {
    const mediaUrl = generatedVideo;
    const caption = generatedCaption || prompt || "";
    const title = `${platform.toUpperCase()} Studio Video (${aspectRatio})`;

    if (caption) {
      try {
        await navigator.clipboard.writeText(caption);
      } catch (err) {
        console.warn("Clipboard copy failed:", err);
      }
    }

    if (mediaUrl) {
      const filename = `${String(title).replace(/[^a-z0-9]/gi, "_").toLowerCase()}_instagram.mp4`;
      try {
        const token = tokenStorage.getUserToken();
        const downloadUrl = `${API_ORIGIN}/api/download-asset?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
        const response = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Auth-Token': token,
          },
        });
        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } else {
          window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (error) {
        console.error('Download failed:', error);
        window.open(mediaUrl, '_blank', 'noopener,noreferrer');
      }
    }

    alert("Instagram Assets Ready! 📸\n\nVideo downloaded & caption copied — paste in Instagram app.");
  };

  // Lazily creates the masked share link (via /api/create-share-link) the
  // first time the popover is opened for a given generated video, then
  // reuses it for subsequent opens/clicks. Mirrors ImageStudio.jsx.
  const handleOpenSharePopover = async () => {
    if (showSharePopover) {
      setShowSharePopover(false);
      return;
    }
    if (!generatedVideo) return;

    if (!shareUrl) {
      setIsCreatingShareLink(true);
      try {
        const captionText = includeCaption ? (generatedCaption || prompt) : "";
        const title = `${platform.toUpperCase()} Studio Video (${aspectRatio})`;
        const url = await createShareLink(generatedVideo, captionText, title, generatedThumbnail);
        setShareUrl(url);
      } catch (err) {
        console.error('Failed to create share link:', err);
        alert('Could not create a shareable link. Please try again.');
        setIsCreatingShareLink(false);
        return;
      }
      setIsCreatingShareLink(false);
    }
    setShowSharePopover(true);
  };

  const handleReset = () => {
    clearJob('video');
    try {
      localStorage.removeItem('growth_os_latest_video');
    } catch (e) {}
    setPrompt('');
    setGeneratedCaption('');
    setIsPlaying(false);
    setShowSharePopover(false);
    setShareUrl(null);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleVolumeChange = (value) => {
    setVolume(value);
    if (videoRef.current) videoRef.current.volume = value;
  };

  const isButtonDisabled = !prompt.trim() || generateMutation.isPending || isPolling;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Block */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Video className="w-8 h-8 text-primary" />
            Video Studio Pro
          </h1>
          <p className="text-muted-foreground mt-2">
            Advanced motion picture engine designed for granular camera manipulation and multi-platform scenario generation.
          </p>
        </div>

        {/* Feature Differentiation Explainer Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-muted/30 border border-border/70 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Sliders className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Kinetic Control Panels</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manipulate complex physical attributes like camera panning matrices, focal zoom speeds, and animation motion weight parameters.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Film className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Target Platform Sizing</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bake custom timeline containers formatted perfectly for distribution rules across primary global video distribution networks.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Wand2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Standalone Render Core</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">High-end computing blocks optimized specifically for generating autonomous timeline footage clips without needing post context fields.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Video Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-md flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  Studio Parameters
                </CardTitle>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex rounded-lg bg-muted/70 p-1 border border-border mt-3">
                <button
                  type="button"
                  onClick={() => setGenerationMode('brand')}
                  disabled={generateMutation.isPending || isPolling}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                    generationMode === 'brand'
                      ? 'bg-background text-primary shadow-sm border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Brand Persona Mode
                </button>
                <button
                  type="button"
                  onClick={() => setGenerationMode('custom')}
                  disabled={generateMutation.isPending || isPolling}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                    generationMode === 'custom'
                      ? 'bg-background text-primary shadow-sm border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Custom / Freeform Mode
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Mode Explainer Sub-Banner */}
              {generationMode === 'brand' ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-primary text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>Brand Persona Mode:</strong> Applies company brand colors, persona tone guidelines, and watermark overlay.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-muted-foreground text-[11px]">
                  <Wand2 className="w-3.5 h-3.5 shrink-0 text-foreground" />
                  <span><strong>Custom / Freeform Mode:</strong> Unconstrained visual creation driven directly by prompt directives with 4.5/5 realism enhancement.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt Brief Scenario</Label>
                <Textarea
                  id="prompt"
                  placeholder={generationMode === 'brand' ? "Describe your brand campaign scene, commercial showcase, or company product story..." : "Describe anything you want to create (e.g., A beautiful golden sunset over ocean waves, a sports car drifting on mountain pass, a cute kitten playing in a flower garden...)"}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[140px] resize-none"
                  disabled={generateMutation.isPending || isPolling}
                />
                <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background/50 transition-all hover:bg-background">
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-foreground">Include generated caption</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">Generate social media text when sharing</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeCaption(!includeCaption)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      includeCaption ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        includeCaption ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform">Target Platform Layout</Label>
                <Select value={platform} onValueChange={setPlatform} disabled={generateMutation.isPending || isPolling}>
                  <SelectTrigger><SelectValue placeholder="Select network shell" /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aspectRatio" className="flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" /> Video Aspect Ratio
                </Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={generateMutation.isPending || isPolling}>
                  <SelectTrigger id="aspectRatio"><SelectValue placeholder="Select dimensions" /></SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((ar) => (
                      <SelectItem key={ar.value} value={ar.value}>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{ar.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration" className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> Target Video Duration
                </Label>
                <Select value={duration} onValueChange={setDuration} disabled={generateMutation.isPending || isPolling}>
                  <SelectTrigger id="duration"><SelectValue placeholder="Select video length" /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        <div className="flex flex-col text-left">
                          <span className="font-medium text-sm">{d.label}</span>
                          <span className="text-[11px] text-muted-foreground">{d.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand Persona Profile Dropdown (Only in Brand Mode) */}
              {generationMode === 'brand' && (
                <div className="space-y-2">
                  <Label htmlFor="companyPersona" className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Active Brand Persona Profile
                  </Label>
                  <Select value={selectedPersona} onValueChange={setSelectedPersona} disabled={generateMutation.isPending || isPolling || loadingPersonas}>
                    <SelectTrigger id="companyPersona">
                      <SelectValue placeholder={loadingPersonas ? "Syncing brand elements..." : "Select targeted profile context"} />
                    </SelectTrigger>
                    <SelectContent>
                      {personasList?.map((persona) => (
                        <SelectItem key={persona.id || persona._id} value={persona.id || persona._id}>
                          <div className="flex items-center gap-2">
                            {persona.logoUrl || persona.logo_url ? (
                              <img src={persona.logoUrl || persona.logo_url} alt="" className="h-4 w-4 object-contain rounded" />
                            ) : (
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span>{persona.name || persona.personaName || persona.persona_name || "Unnamed Persona"}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Watermark Placement (Only in Brand Mode) */}
              {generationMode === 'brand' && (
                <div className="space-y-2">
                  <Label htmlFor="logoPlacement" className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" /> Brand Watermark Logo Placement
                  </Label>
                  <Select value={logoPlacement} onValueChange={setLogoPlacement} disabled={generateMutation.isPending || isPolling}>
                    <SelectTrigger id="logoPlacement"><SelectValue placeholder="Select logo placement" /></SelectTrigger>
                    <SelectContent>
                      {LOGO_PLACEMENTS.map((lp) => (
                        <SelectItem key={lp.value} value={lp.value}>{lp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="style">Artistic Direction Style</Label>
                <Select value={style} onValueChange={setStyle} disabled={generateMutation.isPending || isPolling}>
                  <SelectTrigger><SelectValue placeholder="Select style matrix" /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_STYLES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 flex flex-col gap-2.5 w-full">
                <Button onClick={handleAnimate} disabled={!prompt.trim() || generateMutation.isPending || isPolling} className="w-full gap-2" variant="outline">
                  <Sliders className="w-4 h-4" /> Camera Controls ({pan !== 0 || zoom !== 1 || motionStrength !== 5 ? "Modified" : "Default"})
                </Button>
                
                <Button 
                  onClick={handleGenerateClick} 
                  disabled={isButtonDisabled} 
                  className="w-full gap-2" 
                  size="lg"
                >
                  {generateMutation.isPending || isPolling ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Rendering...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generate Video</>
                  )}
                </Button>
              </div>

              {errorMessage && (
                <div className="text-center p-3 bg-red-500/10 border border-red-500 rounded-lg">
                  <p className="text-sm text-red-500 font-semibold">{errorMessage}</p>
                  {/credit|quota|insufficient|balance/i.test(errorMessage) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Please add credits to your wallet dashboard to continue generating videos.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Panel - Studio Viewport Frame Container */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-md flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Studio Viewport
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center p-6 min-h-[400px]">
              {pollingStatus === 'preparing' || pollingStatus === 'queued' || pollingStatus === 'processing' || isPolling ? (
                <div className="w-full space-y-4">
                  <RealtimeVideoPipelineTracker
                    status={pollingStatus || (isPolling ? 'processing' : 'queued')}
                    phase={videoJob?.phase || (pollingStatus === 'queued' ? 'Allocating compute nodes & scene planner...' : 'Rendering video pipeline...')}
                    progress={displayProgressValue}
                    error={errorMessage}
                  />
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetGeneration}
                      className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Cancel & Reset Studio
                    </Button>
                  </div>
                </div>
              ) : generatedVideo ? (
                <div className="w-full space-y-5">
                  {/* Clean player visible directly at the top with no tall tracker above it */}
                  <div className="relative rounded-xl overflow-hidden border bg-black shadow-lg">
                    <video
                      key={generatedVideo}
                      ref={videoRef}
                      src={generatedVideo}
                      controls
                      autoPlay
                      playsInline
                      preload="auto"
                      className="w-full h-auto rounded-xl"
                      style={{ minHeight: '300px', maxHeight: '500px' }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                  </div>

                  {includeCaption && (
                    <div className="w-full max-w-[440px] p-3.5 rounded-xl border border-border/50 bg-background/50 text-left relative group space-y-2">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-primary">Generated AI Caption</span>
                          <CaptionCharacterCounter text={generatedCaption} platform={platform} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectedTone}
                            onChange={(e) => {
                              setSelectedTone(e.target.value);
                              triggerCaptionGeneration(prompt, e.target.value, platform);
                            }}
                            className="bg-card border border-border text-foreground text-[11px] rounded px-1.5 py-0.5"
                          >
                            <option value="Professional">Professional</option>
                            <option value="Casual">Casual</option>
                            <option value="Witty">Witty</option>
                            <option value="Inspirational">Inspirational</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={handleCopyCaption}
                            title="Copy Caption"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={handleRegenerateCaption}
                            disabled={isGeneratingCaption}
                            title="Regenerate Caption"
                          >
                            <RefreshCw className={`h-3 w-3 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </div>
                      {isGeneratingCaption ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground animate-pulse">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span>Generating caption...</span>
                        </div>
                      ) : (
                        <p className="text-xs text-foreground/95 leading-relaxed font-sans select-all whitespace-pre-wrap">
                          {generatedCaption || (
                            <span className="text-muted-foreground opacity-60">No caption generated</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 w-full max-w-[440px]">
                    <Button onClick={handleDownload} className="flex-1 gap-1.5"><Download className="w-4 h-4" /> Download</Button>

                    <Button onClick={openRefinePage} variant="secondary" className="flex-1 gap-1.5">
                      <Sparkles className="w-4 h-4 text-primary" /> Refine
                    </Button>

                    <div className="relative flex-1">
                      <Button
                        onClick={handleOpenSharePopover}
                        variant="secondary"
                        className="w-full gap-1.5"
                        disabled={isCreatingShareLink}
                      >
                        {isCreatingShareLink ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Preparing link...</>
                        ) : (
                          <><Share2 className="w-4 h-4" /> Share Asset</>
                        )}
                      </Button>
                      {showSharePopover && shareUrl && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 bg-background border border-border rounded-lg shadow-lg p-2 space-y-1 z-10">
                          {Object.entries(
                            getShareLinks(shareUrl, generatedCaption)
                          ).map(([platformName, url]) => (
                            <a
                              key={platformName}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => {
                                if (generatedCaption) {
                                  navigator.clipboard.writeText(generatedCaption);
                                  toast({
                                    title: "Caption copied!",
                                    description: `Caption copied to clipboard. Press Ctrl+V in ${platformName} to paste into your post.`,
                                    duration: 4000,
                                  });
                                }
                                setShowSharePopover(false);
                              }}
                              className="block w-full text-left text-sm px-3 py-2 rounded-md capitalize transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              {platformName}
                            </a>
                          ))}
                          <button
                            onClick={handleInstagramShare}
                            className="block w-full text-left text-sm px-3 py-2 rounded-md capitalize transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            Instagram
                          </button>
                          <button
                            onClick={() => {
                              if (generatedCaption) {
                                navigator.clipboard.writeText(generatedCaption);
                                toast({
                                  title: "Caption copied",
                                  description: "The text caption has been copied to your clipboard.",
                                  duration: 2000,
                                });
                              }
                              setShowSharePopover(false);
                            }}
                            className="block w-full text-left text-sm px-3 py-2 rounded-md transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            Copy caption
                          </button>
                          <button
                            onClick={handleCopyLink}
                            className="block w-full text-left text-sm px-3 py-2 rounded-md transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            Copy link
                          </button>
                        </div>
                      )}
                    </div>

                    <Button onClick={handleReset} variant="outline" className="px-3"><RefreshCw className="w-4 h-4" /></Button>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border/80 rounded-xl flex flex-col items-center justify-center bg-background/40 p-6 w-full max-w-[380px] aspect-square">
                  <Film className="w-12 h-12 text-muted-foreground mb-3 stroke-[1.5]" />
                  <p className="text-xs text-muted-foreground text-center font-medium px-4">
                    Enter a creative scenario and render to review your studio cinematic footage timeline.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Camera Control Modal Config */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border/70 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b bg-muted/20">
              <h2 className="text-md font-semibold flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" /> Camera Direction Configurations
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center"><Label>Horizontal Pan Sizing</Label><span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">{pan.toFixed(1)}</span></div>
                <input type="range" min="-10" max="10" step="0.1" value={pan} onChange={(e) => setPan(parseFloat(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>← Pan Left</span><span>Center</span><span>Pan Right →</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><Label>Focal Zoom Scale</Label><span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">{zoom.toFixed(1) || '1.0'}x</span></div>
                <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>Zoom Out</span><span>1.0x (Normal)</span><span>Zoom In</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><Label>Timeline Motion Strength</Label><span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-bold">{motionStrength}</span></div>
                <input type="range" min="1" max="10" step="1" value={motionStrength} onChange={(e) => setMotionStrength(parseInt(e.target.value))} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>Subtle Motion</span><span>Intense Motion</span></div>
              </div>
            </div>
            <div className="p-4 border-t bg-muted/20 flex gap-2 justify-end">
              <Button onClick={() => setShowCameraModal(false)} variant="outline" size="sm">Cancel Layout</Button>
              <Button size="sm" onClick={() => { setShowCameraModal(false); handleGenerateClick(); }}><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Confirm Direction</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => {
          setShowConfirmDialog(false);
          submitGeneration();
        }}
        title="Confirm Custom Studio Generation"
        description="Complex camera projection trajectories and high-fidelity video processing models can take up to 5-10 minutes to compile. Please leave this studio viewport session active."
        confirmLabel="Generate Video"
      />

      {/* Instagram Share Modal */}
      <Dialog open={isInstagramModalOpen} onOpenChange={setIsInstagramModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground p-6 rounded-lg shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <span className="text-xl">📸</span>
              <h3 className="text-lg font-semibold">Share to Instagram</h3>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Instagram does not support direct sharing from web browsers on desktop. Follow these steps to post:
            </p>

            <div className="bg-muted/40 rounded-lg p-3.5 border border-border/50 space-y-3 text-xs">
              <div className="flex gap-2">
                <span className="font-bold text-primary">1.</span>
                <p>Click <strong>Copy & Download</strong> to get your media and copy your caption to the clipboard.</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-primary">2.</span>
                <p>Click <strong>Go to Instagram</strong> to open Instagram in a new tab.</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-primary">3.</span>
                <p>Click the <strong>Create (+)</strong> button on Instagram, upload your file, and paste your caption.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <Button
                onClick={handleInstagramCopyAndDownload}
                className="flex-1 text-xs gap-1.5 py-2 font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                Copy & Download
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
                }}
                className="flex-1 text-xs gap-1.5 py-2 font-medium"
              >
                Go to Instagram
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}