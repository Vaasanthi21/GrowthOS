import React, { useState } from "react";
import {
  Maximize2,
  Download,
  Share2,
  Sparkles,
  Trash2,
  Loader2,
  RefreshCw,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { tokenStorage } from "@/api/apiClient";
import CaptionCharacterCounter from "./CaptionCharacterCounter";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/api\/?$/,
  "",
);

const resolveAssetUrl = (value) => {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  const isVideo = source.toLowerCase().match(/\.(mp4|webm|ogg|mov|m4v)$/) || source.includes('/videos/');

  if (!isVideo && (source.includes('amazonaws.com') || source.includes('/images/'))) {
    const filename = source.split('/').pop();
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/images/view/${filename}`;
  }

  if (
    /^https?:\/\//i.test(source) ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  ) {
    return source;
  }

  return `${API_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
};

const downloadFile = async (url, filename) => {
  try {
    const token = tokenStorage.getUserToken();

    const downloadUrl = `${API_ORIGIN}/api/download-asset?url=${encodeURIComponent(
      url,
    )}&filename=${encodeURIComponent(filename)}`;

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Auth-Token": token,
      },
    });

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Download failed:", error);

    toast({
      title: "Download failed",
      description: "Unable to download this file.",
      variant: "destructive",
    });
  }
};

export default function VariantCard({
  variant,
  index,
  onExpand,
  onDelete,
  onExport,
  onEnhance,
}) {
  const hasText = Boolean(String(variant.content || "").trim());
  const hasImage = Boolean(variant.image_url || variant.image_base64);
  const hasVideo = Boolean(variant.video_url);
  const resolvedVideoUrl = resolveAssetUrl(variant.video_url);
  const videoStatus = String(variant.video_status || "")
    .trim()
    .toLowerCase();
  const isVideoMode = Boolean(
    videoStatus || variant.video_id || variant.video_prompt || hasVideo,
  );
  const wordCount = hasText
    ? variant.word_count || variant.content.split(/\s+/).filter(Boolean).length
    : 0;

  const handleImageDownload = async () => {
    const imageSource =
      variant.image_url ||
      (variant.image_base64
        ? `data:image/png;base64,${variant.image_base64}`
        : null);

    if (!imageSource) {
      return;
    }

    const filename = `${(variant.title || `variant_${index + 1}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_image.png`;

    await downloadFile(resolveAssetUrl(imageSource), filename);
  };

  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);
  const [captionText, setCaptionText] = useState(variant.content || variant.caption || "");
  const [selectedPlatform, setSelectedPlatform] = useState("instagram");
  const [selectedTone, setSelectedTone] = useState("Professional");
  const [isRegeneratingCaption, setIsRegeneratingCaption] = useState(false);

  const handleRegenerateCaption = async (platformOverride, toneOverride) => {
    const p = platformOverride || selectedPlatform;
    const t = toneOverride || selectedTone;
    setIsRegeneratingCaption(true);
    try {
      const token = tokenStorage.getUserToken();
      const response = await fetch(`${API_ORIGIN}/api/generate-caption`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: variant.title || captionText || "Creative post update",
          platform: p,
          tone: t,
        }),
      });
      const data = await response.json();
      if (data.caption) {
        setCaptionText(data.caption);
        variant.content = data.caption;
        toast({
          title: "Caption regenerated!",
          description: `Generated new ${p} caption in ${t} tone.`,
          duration: 3000,
        });
      }
    } catch (err) {
      console.error("Failed to regenerate caption:", err);
      toast({
        title: "Regeneration failed",
        description: "Could not regenerate caption.",
        variant: "destructive",
      });
    } finally {
      setIsRegeneratingCaption(false);
    }
  };

  const handleCopyCaption = async () => {
    const textToCopy = captionText || variant.content || "";
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: "Caption copied",
        description: "Text caption copied to clipboard.",
        duration: 2000,
      });
    } catch (err) {
      console.error("Copy caption failed:", err);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link copied",
          description: "Share link copied to clipboard successfully.",
          duration: 2000,
        });
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        toast({
          title: "Link copied",
          description: "Share link copied to clipboard successfully.",
          duration: 2000,
        });
      }
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
    setShowSharePopover(false);
  };

  const handleInstagramShare = async () => {
    const mediaUrl = variant.video_url || variant.image_url || (variant.image_base64 ? `data:image/png;base64,${variant.image_base64}` : null);
    const caption = captionText || variant.content || variant.caption || "";
    const title = variant.title || "Instagram Post";

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && navigator.share && navigator.canShare && mediaUrl) {
      try {
        const fileExtension = mediaUrl.toLowerCase().match(/\.(mp4|webm|ogg|mov|m4v)$/) || mediaUrl.includes('/videos/') ? 'mp4' : 'png';
        const response = await fetch(resolveAssetUrl(mediaUrl));
        const blob = await response.blob();
        const file = new File([blob], `post.${fileExtension}`, { type: blob.type });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title,
            text: caption,
            files: [file]
          });
          toast({
            title: "Instagram Share",
            description: "Opening Instagram via system share sheet...",
            duration: 3000,
          });
          setShowSharePopover(false);
          return;
        }
      } catch (err) {
        console.warn("Mobile native sharing failed, falling back to copy/download:", err);
      }
    }

    // Desktop/Fallback Flow
    if (caption) {
      try {
        await navigator.clipboard.writeText(caption);
      } catch (err) {
        console.warn("Clipboard copy failed:", err);
      }
    }

    toast({
      title: "Ready for Instagram! 📸",
      description: "Caption copied to clipboard! Paste the caption when creating your post in the Instagram app.",
      duration: 6000,
    });

    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    setShowSharePopover(false);
  };

  const handleOpenSharePopover = async () => {
    if (showSharePopover) {
      setShowSharePopover(false);
      return;
    }

    const mediaUrl = variant.video_url || variant.image_url || (variant.image_base64 ? `data:image/png;base64,${variant.image_base64}` : null);
    if (!mediaUrl) return;

    if (!shareUrl) {
      setIsCreatingShareLink(true);
      try {
        const token = tokenStorage.getUserToken();
        const response = await fetch(`${API_ORIGIN}/api/create-share-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            assetUrl: resolveAssetUrl(mediaUrl),
            caption: variant.caption || variant.text || "",
            title: variant.title || "Check out this post"
          }),
        });
        if (!response.ok) throw new Error('Failed to create share link');
        const data = await response.json();
        const cleanUrl = String(data.shareUrl || '').replace('/api/share/', '/share/');
        setShareUrl(cleanUrl);
      } catch (err) {
        console.error('Failed to create share link:', err);
        toast({
          title: "Share failed",
          description: "Could not create a shareable link. Please try again.",
          variant: "destructive",
        });
        setIsCreatingShareLink(false);
        return;
      }
      setIsCreatingShareLink(false);
    }
    setShowSharePopover(true);
  };

  const getShareLinks = (url, caption) => {
    const sanitizedUrl = String(url || '').replace('/api/share/', '/share/');
    const encodedUrl = encodeURIComponent(sanitizedUrl);
    const encodedText = encodeURIComponent(caption || '');
    return {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      twitter: `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    };
  };

  const handleVideoDownload = async () => {
    if (!resolvedVideoUrl) {
      return;
    }

    const filename = `${(variant.title || `variant_${index + 1}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_video.mp4`;

    await downloadFile(resolvedVideoUrl, filename);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col gap-3 group hover:border-muted-foreground/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Primary Result
          </span>
          {variant.title && (
            <span className="text-xs text-foreground font-medium">
              — {variant.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasText && (
            <CaptionCharacterCounter text={captionText} platform={selectedPlatform} />
          )}
          <span className="text-[10px] text-muted-foreground">
            {hasText
              ? `${captionText.split(/\s+/).filter(Boolean).length} words`
              : hasVideo
                ? "Video ready"
                : isVideoMode && videoStatus === "processing"
                  ? "Video processing"
                  : isVideoMode && videoStatus === "failed"
                    ? "Video failed"
                    : hasImage
                      ? "Image ready"
                      : "No text"}
          </span>
        </div>
      </div>

      {hasText ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 bg-muted/40 p-2 rounded-md border border-border/50 text-xs">
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground">Platform:</label>
              <select
                value={selectedPlatform}
                onChange={(e) => {
                  setSelectedPlatform(e.target.value);
                  handleRegenerateCaption(e.target.value, selectedTone);
                }}
                className="bg-card border border-border text-foreground text-xs rounded px-2 py-0.5"
              >
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">Twitter / X</option>
                <option value="facebook">Facebook</option>
                <option value="whatsapp">WhatsApp</option>
              </select>

              <label className="text-[10px] uppercase font-semibold text-muted-foreground ml-1">Tone:</label>
              <select
                value={selectedTone}
                onChange={(e) => {
                  setSelectedTone(e.target.value);
                  handleRegenerateCaption(selectedPlatform, e.target.value);
                }}
                className="bg-card border border-border text-foreground text-xs rounded px-2 py-0.5"
              >
                <option value="Professional">Professional</option>
                <option value="Casual">Casual</option>
                <option value="Witty">Witty</option>
                <option value="Inspirational">Inspirational</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => handleRegenerateCaption()}
              disabled={isRegeneratingCaption}
            >
              {isRegeneratingCaption ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Regenerate caption
            </Button>
          </div>

          <div className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap flex-1 max-h-48 overflow-y-auto p-1">
            {captionText}
          </div>
        </div>
      ) : isVideoMode ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {hasVideo
            ? "Video-only output. No caption text was generated for this mode."
            : videoStatus === "processing"
              ? "Video generation is still processing. The video will appear automatically once the provider finishes."
              : videoStatus === "failed"
                ? "Video generation failed before a playable asset was returned."
                : "Video-only output. No caption text was generated for this mode."}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Image-only output. No caption text was generated for this mode.
        </div>
      )}

      {hasImage && (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
          <img
            src={
              variant.image_url ||
              `data:image/png;base64,${variant.image_base64}`
            }
            alt={variant.title || `Generated content image ${index + 1}`}
            className="h-48 w-full object-cover"
          />
        </div>
      )}

      {hasVideo && (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
          <video
            src={resolvedVideoUrl}
            controls
            className="h-48 w-full object-cover"
          />
        </div>
      )}

      {!hasVideo && isVideoMode && videoStatus === "processing" && (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          Video request submitted. Waiting for Azure to finish rendering.
        </div>
      )}

      <div className="flex items-center flex-wrap gap-1.5 pt-1 border-t border-border">
        <Button
          variant="transparent"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onExpand(variant)}
        >
          <Maximize2 className="w-3.5 h-3.5 mr-1" />
          Expand
        </Button>
        {hasText && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCopyCaption}
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Copy caption
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onExport(variant)}
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export
            </Button>
          </>
        )}
        {hasVideo && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleVideoDownload}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Download
          </Button>
        )}
        {hasImage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleImageDownload}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Image
          </Button>
        )}
        {(hasImage || hasVideo) && (
          <div className="relative inline-block text-left">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={handleOpenSharePopover}
              disabled={isCreatingShareLink}
            >
              {isCreatingShareLink ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              Share
            </Button>
            {showSharePopover && shareUrl && (
              <div className="absolute bottom-full mb-2 left-0 w-40 bg-card border border-border rounded-lg shadow-lg p-1.5 space-y-0.5 z-20">
                {Object.entries(getShareLinks(shareUrl, variant.content || variant.caption || variant.text || "")).map(([platformName, url]) => (
                  <a
                    key={platformName}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      const text = variant.content || variant.caption || variant.text || "";
                      if (text) {
                        navigator.clipboard.writeText(text);
                        toast({
                          title: "Caption copied!",
                          description: `Caption copied to clipboard. Press Ctrl+V in ${platformName} to paste into your post.`,
                          duration: 4000,
                        });
                      }
                      setShowSharePopover(false);
                    }}
                    className="block w-full text-left text-xs px-2 py-1.5 rounded capitalize text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {platformName}
                  </a>
                ))}
                <button
                  onClick={handleInstagramShare}
                  className="block w-full text-left text-xs px-2 py-1.5 rounded capitalize text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  Instagram
                </button>
                <button
                  onClick={() => {
                    const text = variant.content || variant.caption || variant.text || "";
                    if (text) {
                      navigator.clipboard.writeText(text);
                      toast({
                        title: "Caption copied",
                        description: "The text caption has been copied to your clipboard.",
                        duration: 2000,
                      });
                    }
                    setShowSharePopover(false);
                  }}
                  className="block w-full text-left text-xs px-2 py-1.5 rounded text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  Copy caption
                </button>
                <button
                  onClick={handleCopyLink}
                  className="block w-full text-left text-xs px-2 py-1.5 rounded text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}
        {onEnhance && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onEnhance(variant)}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Enhance
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
            onClick={() => onDelete(variant)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}