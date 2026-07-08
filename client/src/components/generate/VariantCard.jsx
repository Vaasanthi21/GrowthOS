import React, { useState } from "react";
import {
  Maximize2,
  Download,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const handleImageShare = async () => {
    const imageSource =
      variant.image_url ||
      (variant.image_base64
        ? `data:image/png;base64,${variant.image_base64}`
        : null);
    if (!imageSource) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: variant.title || "Generated image",
          text:
            variant.image_revised_prompt ||
            variant.image_prompt ||
            variant.title ||
            "Generated image",
          url: variant.image_url || undefined,
        });
        return;
      }

      await navigator.clipboard.writeText(imageSource);
      toast({
        title: "Image link copied",
        description:
          "Native share is unavailable here, so the image source was copied instead.",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Image share failed",
        description: "Unable to share this image right now.",
        variant: "destructive",
        duration: 2500,
      });
    }
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
        <span className="text-[10px] text-muted-foreground">
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
      </div>

      {hasText ? (
        <div className="text-sm text-secondary-foreground leading-relaxed whitespace-pre-wrap flex-1 max-h-48 overflow-y-auto">
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

      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onExport(variant)}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            Export
          </Button>
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
        {hasImage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleImageShare}
          >
            <Share2 className="w-3.5 h-3.5 mr-1" />
            Share image
          </Button>
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