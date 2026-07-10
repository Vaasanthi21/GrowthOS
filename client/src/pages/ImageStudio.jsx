import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startAsyncImageGeneration, createGenerationPoller } from '@/services/generationPollingService';
import { useGenerationJobs } from '@/contexts/GenerationJobsContext';
import { buildCompanyPersonaPayload } from '@/utils/personaPayload';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress";
import { Loader2, Sparkles, Download, Share2, RefreshCw, Camera, Layers, Sliders, Flame, Wand2, Maximize2, Building2, Copy } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, tokenStorage } from '@/api/apiClient';
import { addHistoryEntry } from '@/services/aiService';
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { persistRefineSession } from '@/utils';

// Each preset carries the exact pixel output the user expects, plus the
// platform label used for AI prompt tailoring and the aspect-ratio bucket
// used to pick the closest Azure generation size (1024x1024 / 1792x1024 / 1024x1792).
// The backend crops/resizes the generated image down to the exact width/height below.
const OUTPUT_FORMATS = [
  { value: 'instagram_feed', label: 'Instagram Feed (Square)', dimensions: '1080×1080', width: 1080, height: 1080, aspectRatioBucket: '1:1', platform: 'instagram' },
  { value: 'instagram_portrait', label: 'Instagram Portrait', dimensions: '1080×1350', width: 1080, height: 1350, aspectRatioBucket: '4:5', platform: 'instagram' },
  { value: 'story_reel', label: 'IG/FB Story, Reel', dimensions: '1080×1920', width: 1080, height: 1920, aspectRatioBucket: '9:16', platform: 'instagram' },
  { value: 'facebook_post', label: 'Facebook Post', dimensions: '1200×630', width: 1200, height: 630, aspectRatioBucket: '1.91:1', platform: 'facebook' },
  { value: 'linkedin_post', label: 'LinkedIn Post', dimensions: '1200×627', width: 1200, height: 627, aspectRatioBucket: '1.91:1', platform: 'linkedin' },
  { value: 'twitter_post', label: 'X/Twitter Post', dimensions: '1600×900', width: 1600, height: 900, aspectRatioBucket: '16:9', platform: 'twitter' },
  { value: 'youtube_thumbnail', label: 'YouTube Thumbnail', dimensions: '1280×720', width: 1280, height: 720, aspectRatioBucket: '16:9', platform: 'youtube' },
];

const IMAGE_STYLES = [
  { value: 'realistic', label: 'Realistic Cinematic' },
  { value: 'illustration', label: 'Vector Illustration' },
  { value: 'anime', label: 'Anime / Manga' },
  { value: 'abstract', label: 'Abstract Concept Art' },
  { value: 'minimalist', label: 'Clean Minimalist' },
  { value: 'cyberpunk', label: 'Cyberpunk Neon' },
  { value: 'watercolor', label: 'Watercolor Wash' },
  { value: 'oil-painting', label: 'Oil Painting Textured' },
];

const LIGHTING_MODES = [
  { value: 'natural', label: 'Natural Soft Light' },
  { value: 'cinematic', label: 'Cinematic Volumetric' },
  { value: 'neon', label: 'Cyberpunk Neon Cyber Glow' },
  { value: 'studio', label: 'Studio Three-Point Lighting' },
  { value: 'dramatic', label: 'Dramatic Chiaroscuro' },
];

const LOGO_PLACEMENTS = [
  // NOTE: value must be 'persona-default' (hyphen) to match the backend's
  // exact string check (logoPlacement === 'persona-default') in index.js.
  // Using underscore here previously caused the persona's actual saved
  // placement to be silently ignored.
  { value: 'persona-default', label: 'Persona Default' },
  { value: 'none', label: 'No logo' },
  { value: 'top_left', label: 'Top Left' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'bottom_left', label: 'Bottom Left' },
  { value: 'bottom_right', label: 'Bottom Right' },
  { value: 'center', label: 'Centralized overlay' },
];

const IMAGE_STAGE_ESTIMATES_MS = 180000;

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/api\/?$/, '');

const formatRemainingTime = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};

const createShareLink = async (imageUrl, caption, title) => {
  const token = tokenStorage.getUserToken();
  const response = await fetch(`${API_ORIGIN}/api/create-share-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assetUrl: imageUrl, caption, title }),
  });
  if (!response.ok) throw new Error('Failed to create share link');
  const data = await response.json();
  return data.shareUrl;
};

const getShareLinks = (shareUrl, caption) => {
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(caption);
  return {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };
};

export default function ImageStudio() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [prompt, setPrompt] = useState(location.state?.prompt || '');
  const [style, setStyle] = useState('realistic');
  const [outputFormat, setOutputFormat] = useState('instagram_feed');
  const [lighting, setLighting] = useState('cinematic');
  const [logoPlacement, setLogoPlacement] = useState('persona-default'); 
  const [selectedPersona, setSelectedPersona] = useState(''); 
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const { getJob, setJob, clearJob } = useGenerationJobs();
  const imageJob = getJob('image');
  const navigate = useNavigate();

  const openRefinePage = () => {
    if (!generatedImage) return;

    const selectedPersonaObj = personasList?.find(p => p.id === selectedPersona) || null;
    const activePersonaKey = selectedPersona || 'linkedin';

    const refineState = {
      activePersona: activePersonaKey,
      params: {
        contentType: 'image-only',
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
        image_url: generatedImage,
        content: '',
      },
      ragContext: '',
      originalPrompt: prompt,
      messages: [
        {
          role: "assistant",
          content: "",
          image_url: generatedImage,
          image_prompt: prompt,
        },
      ],
    };

    persistRefineSession(refineState);
    navigate("/refine", { state: refineState });
  };

  const selectedFormat = OUTPUT_FORMATS.find((f) => f.value === outputFormat) || OUTPUT_FORMATS[0];

  const generatedImage = imageJob?.generatedImage || null;
  const isPolling = imageJob?.isPolling || false;
  const pollingStatus = imageJob?.pollingStatus || null;
  const stageStartedAt = imageJob?.stageStartedAt || null;
  const [stageElapsedMs, setStageElapsedMs] = useState(0);
  const [includeCaption, setIncludeCaption] = useState(true);
  const [generatedCaption, setGeneratedCaption] = useState("");
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);

  useEffect(() => {
    setShareUrl(null);
    setGeneratedCaption("");
  }, [includeCaption]);

  useEffect(() => {
    if (generatedImage && includeCaption && !generatedCaption && !isGeneratingCaption) {
      const fetchCaption = async () => {
        setIsGeneratingCaption(true);
        try {
          const token = tokenStorage.getUserToken();
          const captionRes = await apiClient.post('/generate-caption', { prompt }, token);
          setGeneratedCaption(captionRes?.caption || prompt);
        } catch (e) {
          console.error("Failed to auto-generate caption:", e);
          setGeneratedCaption(prompt);
        } finally {
          setIsGeneratingCaption(false);
        }
      };
      fetchCaption();
    }
  }, [generatedImage, includeCaption, generatedCaption, isGeneratingCaption, prompt]);

  const handleCopyCaption = async () => {
    if (!generatedCaption) return;
    try {
      await navigator.clipboard.writeText(generatedCaption);
      alert('Caption copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy caption:', err);
    }
  };

  const handleRegenerateCaption = async () => {
    setIsGeneratingCaption(true);
    setGeneratedCaption("");
    setShareUrl(null);
    try {
      const token = tokenStorage.getUserToken();
      const captionRes = await apiClient.post('/generate-caption', { prompt }, token);
      setGeneratedCaption(captionRes?.caption || prompt);
    } catch (e) {
      console.error("Failed to regenerate caption:", e);
    } finally {
      setIsGeneratingCaption(false);
    }
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
  // /api/generate-image route only reads req.body.companyPersona (a full
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
    const updateElapsed = () => setStageElapsedMs(Date.now() - stageStartedAt);
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [isPolling, stageStartedAt]);

  const displayProgressValue = isPolling
    ? Math.min(96, Math.max(8, Math.round((stageElapsedMs / IMAGE_STAGE_ESTIMATES_MS) * 100)))
    : 0;

  const displayRemainingMs = Math.max(0, IMAGE_STAGE_ESTIMATES_MS - stageElapsedMs);

  const attachPoller = useCallback((jobId) => {
    createGenerationPoller(
      jobId,
      'image',
      (status) => {
        if (!status) return;
        const statusCode = status?.status;
        setJob('image', { pollingStatus: statusCode });

        if (statusCode === 'completed' && status?.result) {
          const imageUrl = status?.result?.image_url || status?.result?.imageUrl;
          if (imageUrl) {
            const imageEntry = {
              topic: prompt,
              content_type: "Image",
              platform: "Studio Pro Canvas",
              variants: [{
                content: prompt,
                image_url: imageUrl,
                title: `${style.toUpperCase()} Studio Design (${selectedFormat.label})`
              }],
              status: "completed"
            };
            addHistoryEntry(imageEntry).catch(err => console.error("Failed history save:", err));
            setJob('image', { generatedImage: imageUrl });
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
          }
        }
      },
      (finalStatus) => {
        const statusCode = finalStatus?.status || 'failed';

        if (statusCode === 'completed' && finalStatus?.result) {
          const imageUrl = finalStatus?.result?.image_url || finalStatus?.result?.imageUrl;
          if (imageUrl) {
            setJob('image', { isPolling: false, stageStartedAt: null, pollingStatus: 'completed', generatedImage: imageUrl });
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
          } else {
            setJob('image', { isPolling: false, stageStartedAt: null, pollingStatus: 'failed' });
            queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
          }
        } else {
          setJob('image', { isPolling: false, stageStartedAt: null, pollingStatus: 'failed' });
          queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
        }
      },
      3000
    );
  }, [prompt, style, selectedFormat, setJob, queryClient]);

  useEffect(() => {
    if (hasResumedRef.current) return;
    hasResumedRef.current = true;

    const existing = imageJob;
    if (existing?.jobId && existing.isPolling && existing.pollingStatus !== 'completed' && existing.pollingStatus !== 'failed') {
      attachPoller(existing.jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateMutation = useMutation({
    mutationFn: async (params) => {
      setJob('image', { pollingStatus: 'preparing' });
      const finalBuiltPrompt = `${params.prompt}, ${params.style} style, ${params.lighting} lighting, ultra-detailed masterwork`;

      const companyPersonaPayload = buildCompanyPersonaPayload(params.personaObject);

      const response = await startAsyncImageGeneration({
        topic: finalBuiltPrompt,
        style: params.style,
        platform: params.platform,
        aspectRatio: params.aspectRatioBucket,
        aspect_ratio: params.aspectRatioBucket,
        outputWidth: params.outputWidth,
        outputHeight: params.outputHeight,
        companyPersona: companyPersonaPayload,
        logoPlacement: params.logoPlacement,
        logo_placement: params.logoPlacement, 
      });
      return response;
    },
    onSuccess: (response) => {
      const jobId = response?.jobId || response?.id || response?.job_id;
      if (!jobId) {
        setJob('image', { pollingStatus: 'failed', isPolling: false });
        return;
      }

      setJob('image', {
        jobId,
        isPolling: true,
        stageStartedAt: Date.now(),
        pollingStatus: 'queued',
        generatedImage: null,
      });

      queryClient.invalidateQueries({ queryKey: ['user-credit-balance'] });
      attachPoller(jobId);
    },
    onError: () => {
      setJob('image', { isPolling: false, stageStartedAt: null, pollingStatus: 'failed' });
    },
  });

  const submitGeneration = useCallback(() => {
    generateMutation.mutate({
      prompt: prompt.trim(),
      style: style,
      lighting: lighting,
      platform: selectedFormat.platform,
      aspectRatioBucket: selectedFormat.aspectRatioBucket,
      outputWidth: selectedFormat.width,
      outputHeight: selectedFormat.height,
      personaObject: selectedPersonaObject,
      logoPlacement: logoPlacement 
    });
  }, [prompt, style, lighting, selectedFormat, selectedPersonaObject, logoPlacement, generateMutation]);

  const handleGenerateClick = () => {
    if (!prompt.trim()) return;
    setShowConfirmDialog(true);
  };

  const handleDownload = async () => {
    if (!generatedImage) return;
    try {
      const token = tokenStorage.getUserToken();
      const filename = `studio-asset-${Date.now()}.png`;
      const downloadUrl = `${API_ORIGIN}/api/download-asset?url=${encodeURIComponent(generatedImage)}&filename=${encodeURIComponent(filename)}`;

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Auth-Token': token,
        },
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(generatedImage, '_blank', 'noopener,noreferrer');
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

  const handleOpenSharePopover = async () => {
    if (showSharePopover) {
      setShowSharePopover(false);
      return;
    }
    if (!generatedImage) return;

    if (!shareUrl) {
      setIsCreatingShareLink(true);
      try {
        const captionText = includeCaption ? (generatedCaption || prompt) : "";
        const title = `${style.toUpperCase()} Studio Design (${selectedFormat.label})`;
        const url = await createShareLink(generatedImage, captionText, title);
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
    clearJob('image');
    setPrompt('');
    setShowSharePopover(false);
    setShareUrl(null);
  };

  const getPreviewContainerStyle = () => {
    const ratio = selectedFormat.width / selectedFormat.height;
    const baseStyle = { aspectRatio: `${selectedFormat.width} / ${selectedFormat.height}` };

    if (ratio > 1.2) {
      return { ...baseStyle, width: '100%', maxWidth: '440px' };
    }
    if (ratio < 0.85) {
      return { ...baseStyle, height: '380px', width: 'auto' };
    }
    return { ...baseStyle, width: '100%', maxWidth: '380px' };
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Camera className="w-8 h-8 text-primary" />
            Image Studio Pro
          </h1>
          <p className="text-muted-foreground mt-2">
            Advanced asset laboratory designed for professional art style mapping and high-fidelity rendering.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-muted/30 border border-border/70 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Sliders className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Advanced Consistency</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Appends deep aesthetic filters to guarantee exact model output alignment.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Wand2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Illumination Control</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Fine-tune lighting layouts using advanced cinematic or studio nodes.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Layers className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Standalone Production</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Enriched rendering blocks built explicitly for masterwork branding assets.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-md flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" />
                Studio Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt Brief</Label>
                <Textarea
                  id="prompt"
                  placeholder="Describe your creative vision..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[140px] resize-none"
                  disabled={isPolling}
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
                <Label htmlFor="outputFormat">Output Format &amp; Platform</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat} disabled={isPolling}>
                  <SelectTrigger id="outputFormat">
                    <Maximize2 className="w-4 h-4 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Select output format" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMATS.map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        {format.label} — {format.dimensions}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyPersona" className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Active Brand Persona Profile
                </Label>
                <Select value={selectedPersona} onValueChange={setSelectedPersona} disabled={isPolling || loadingPersonas}>
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

              <div className="space-y-2">
                <Label htmlFor="logoPlacement">Company Logo Overlay Placement</Label>
                <Select value={logoPlacement} onValueChange={setLogoPlacement} disabled={isPolling}>
                  <SelectTrigger id="logoPlacement">
                    <Layers className="w-4 h-4 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="Watermark Position" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGO_PLACEMENTS.map((placement) => (
                      <SelectItem key={placement.value} value={placement.value}>{placement.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lighting">Studio Illumination</Label>
                <Select value={lighting} onValueChange={setLighting} disabled={isPolling}>
                  <SelectTrigger id="lighting">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIGHTING_MODES.map((light) => (
                      <SelectItem key={light.value} value={light.value}>{light.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="style">Artistic Profile Style</Label>
                <Select value={style} onValueChange={setStyle} disabled={isPolling}>
                  <SelectTrigger id="style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_STYLES.map((styleOption) => (
                      <SelectItem key={styleOption.value} value={styleOption.value}>{styleOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>



              <Button
                onClick={handleGenerateClick}
                disabled={isPolling || !prompt.trim()}
                className="w-full mt-2"
                size="lg"
              >
                {isPolling ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rendering Canvas...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Render Studio Asset</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-md flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary" />
                Studio Canvas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[440px] bg-muted/10 rounded-b-xl p-6">
              {isPolling || generateMutation.isPending ? (
                <div className="w-full space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-primary/10 p-2 text-primary mt-0.5 relative">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="absolute inset-0 flex items-center justify-center animate-pulse text-[9px] font-bold">✨</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Generating image</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pollingStatus === 'queued' 
                            ? 'Allocating compute nodes. Initializing layout engine models...' 
                            : 'This is an estimate based on recent image generation time. The image will appear automatically when the provider finishes.'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary tracking-tight">{displayProgressValue}%</p>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Estimated progress</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Progress value={displayProgressValue} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Elapsed: {formatRemainingTime(stageElapsedMs)}</span>
                      <span>{displayRemainingMs > 0 ? `About ${formatRemainingTime(displayRemainingMs)} remaining` : 'Finalizing result...'}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 grid-cols-3 mt-2">
                    <div className={`rounded-xl border px-3 py-3 ${pollingStatus === 'preparing' ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-background/60'}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Step 1</p>
                      <p className="mt-1 text-xs font-medium text-foreground">Prepare Prompt</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-3 ${pollingStatus === 'queued' || pollingStatus === 'processing' || pollingStatus === 'image' || isPolling ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-background/60'}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Step 2</p>
                      <p className="mt-1 text-xs font-medium text-foreground">Generate Image</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-3 ${displayProgressValue >= 92 ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-background/60'}`}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Step 3</p>
                      <p className="mt-1 text-xs font-medium text-foreground">Finalize Result</p>
                    </div>
                  </div>
                </div>
              ) : generatedImage ? (
                <div className="w-full flex flex-col items-center gap-4">
                  <div
                    className="relative border border-border/60 bg-background/50 shadow-inner overflow-hidden flex items-center justify-center p-1 rounded-lg"
                    style={getPreviewContainerStyle()}
                  >
                    <img src={generatedImage} alt="Studio output viewport preview" className="w-full h-auto max-h-[500px] object-contain rounded-lg" />
                  </div>

                  {includeCaption && (
                    <div className="w-full max-w-[440px] p-3.5 rounded-xl border border-border/50 bg-background/50 text-left relative group">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-primary">Generated AI Caption</span>
                        <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
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
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating caption...
                        </div>
                      ) : (
                        <p className="text-xs text-foreground/95 leading-relaxed font-sans select-all whitespace-pre-wrap">
                          {generatedCaption || "Generating caption..."}
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
                          {Object.entries(getShareLinks(shareUrl, generatedCaption)).map(([platformName, url]) => (
                            <a
                              key={platformName}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setShowSharePopover(false)}
                              className="block w-full text-left text-sm px-3 py-2 rounded-md capitalize transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              {platformName}
                            </a>
                          ))}
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
              ) : pollingStatus === 'failed' ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-red-500 font-semibold">Compilation interrupted or failed.</p>
                  <Button size="sm" variant="outline" onClick={handleReset} className="gap-2">
                    <RefreshCw className="w-3.5 h-3.5" /> Try Again
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-border/80 rounded-xl flex flex-col items-center justify-center bg-background/40 p-6 w-full aspect-square max-w-[380px]">
                  <Camera className="w-10 h-10 text-muted-foreground mb-2 stroke-[1.5]" />
                  <p className="text-xs text-muted-foreground text-center font-medium">
                    Ready to capture custom art profile weights.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => {
          setShowConfirmDialog(false);
          submitGeneration();
        }}
        title="Confirm Custom Studio Generation"
        description={`High-fidelity image canvas compiling can utilize up to 2-3 minutes of render cluster time. Output will be sized exactly for ${selectedFormat.label} (${selectedFormat.dimensions}). Please maintain this viewport session active.`}
        confirmLabel="Generate Image"
      />
    </div>
  );
}