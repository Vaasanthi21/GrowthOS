import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Zap, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { tokenStorage } from "@/api/apiClient";

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
    console.log('[FRONTEND DOWNLOAD] Triggered:', { url, filename, hasToken: !!token });

    const downloadUrl = `${API_ORIGIN}/api/download-asset?url=${encodeURIComponent(
      url,
    )}&filename=${encodeURIComponent(filename)}`;

    console.log('[FRONTEND DOWNLOAD] Requesting URL:', downloadUrl);
    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Auth-Token": token,
      },
    });

    console.log('[FRONTEND DOWNLOAD] Response status:', response.status);
    if (!response.ok) {
      throw new Error(`Download failed with status: ${response.status}`);
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

export default function VariantExpandedModal({
  variant,
  open,
  onClose,
  onExport,
  fullEntry,
  hideExport = false, // History passes hideExport so Export doesn't show there,
                       // while Generate.jsx (which doesn't pass this prop) keeps it.
}) {
  if (!variant) return null;

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

    const filename = `${(variant.title || "content_variant")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_image.png`;

    await downloadFile(resolveAssetUrl(imageSource), filename);
  };

  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

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
        setShareUrl(data.shareUrl);
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
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(caption || '');
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    };
  };

  const handleVideoDownload = async () => {
    if (!resolvedVideoUrl) {
      return;
    }

    const filename = `${(variant.title || "content_variant")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase()}_video.mp4`;

    await downloadFile(resolvedVideoUrl, filename);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">
            {variant.title || "Generated Content"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          {hasText ? (
            <div className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap">
              {variant.content}
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
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/20">
              <img
                src={
                  variant.image_url ||
                  `data:image/png;base64,${variant.image_base64}`
                }
                alt={variant.title || "Generated image"}
                className="max-h-[420px] w-full object-contain bg-black/10"
              />
            </div>
          )}
          {hasVideo && (
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/20">
              <video
                src={resolvedVideoUrl}
                controls
                className="max-h-[420px] w-full object-contain bg-black/10"
              />
            </div>
          )}
          {!hasVideo && isVideoMode && videoStatus === "processing" && (
            <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              Video request submitted. Waiting for Azure to finish rendering.
            </div>
          )}

          {/* Generation parameters and chat history */}
          {fullEntry && (
            <div className="mt-4 space-y-3">
              {(fullEntry.tone || fullEntry.length || fullEntry.keywords) && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Generation Parameters
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {fullEntry.tone && (
                      <div>
                        <span className="text-muted-foreground">Tone:</span>
                        <p className="text-secondary-foreground">
                          {fullEntry.tone}
                        </p>
                      </div>
                    )}
                    {fullEntry.length && (
                      <div>
                        <span className="text-muted-foreground">Length:</span>
                        <p className="text-secondary-foreground">
                          {fullEntry.length}
                        </p>
                      </div>
                    )}
                    {fullEntry.keywords && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Keywords:</span>
                        <p className="text-secondary-foreground">
                          {fullEntry.keywords}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chat History */}
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Chat History
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {fullEntry.original_prompt && (
                    <div className="text-xs rounded px-2 py-1 bg-muted/60 border-l-2 border-amber-500/50">
                      <p className="font-medium text-muted-foreground mb-1">
                        Your Request:
                      </p>
                      <p className="text-secondary-foreground whitespace-pre-wrap">
                        {fullEntry.original_prompt}
                      </p>
                    </div>
                  )}

                  <div className="text-xs rounded px-2 py-1 bg-muted/60 border-l-2 border-blue-500/50">
                    <p className="font-medium text-muted-foreground mb-1">
                      Generated:
                    </p>
                    <p className="text-secondary-foreground whitespace-pre-wrap line-clamp-3">
                      {variant.content ||
                        variant.title ||
                        "(Generated content)"}
                    </p>
                  </div>

                  {Array.isArray(fullEntry.refinement_messages) &&
                    fullEntry.refinement_messages.length > 0 &&
                    fullEntry.refinement_messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`text-xs rounded px-2 py-1 border-l-2 ${msg.role === "user" ? "bg-muted/60 border-amber-500/50" : "bg-muted/60 border-blue-500/50"}`}
                      >
                        <p className="font-medium text-muted-foreground mb-1 capitalize">
                          {msg.role === "user"
                            ? "Your Refinement:"
                            : "Generated:"}
                        </p>
                        <p className="text-secondary-foreground whitespace-pre-wrap line-clamp-3">
                          {msg.content}
                        </p>
                      </div>
                    ))}

                  {!fullEntry.original_prompt &&
                    (!Array.isArray(fullEntry.refinement_messages) ||
                      fullEntry.refinement_messages.length === 0) && (
                      <div className="text-xs text-muted-foreground italic py-2">
                        No chat history available for this entry
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {hasText
              ? `${wordCount} words`
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
          <div className="flex gap-2">
            {hasImage && (
              <Button variant="outline" size="sm" onClick={handleImageDownload}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Image
              </Button>
            )}
            {(hasImage || hasVideo) && (
              <div className="relative inline-block text-left">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenSharePopover}
                  disabled={isCreatingShareLink}
                  className="gap-1"
                >
                  {isCreatingShareLink ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                  Share
                </Button>
                {showSharePopover && shareUrl && (
                  <div className="absolute bottom-full mb-2 right-0 w-36 bg-card border border-border rounded-lg shadow-lg p-1.5 space-y-0.5 z-20">
                    {Object.entries(getShareLinks(shareUrl, variant.caption || variant.text)).map(([platformName, url]) => (
                      <a
                        key={platformName}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowSharePopover(false)}
                        className="block w-full text-left text-xs px-2 py-1.5 rounded capitalize text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        {platformName}
                      </a>
                    ))}
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
            {hasText && !hideExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExport(variant)}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Export
              </Button>
            )}
            {hasVideo && (
              <Button variant="outline" size="sm" onClick={handleVideoDownload}>
                <Download className="w-3.5 h-3.5 mr-1" />
                Download
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}