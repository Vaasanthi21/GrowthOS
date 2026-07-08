import React, { useEffect, useState } from "react";
import { Loader2, Sparkles, CheckCircle, XCircle, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { createGenerationPoller } from "@/services/generationPollingService";

const STAGE_LABELS = {
  queued: "Queued for processing",
  processing: "Generating content",
  generating_text: "Writing content...",
  completing: "Finalizing...",
  completed: "Generation complete!",
  failed: "Generation failed",
};

const STAGE_COLORS = {
  queued: "bg-muted text-muted-foreground",
  processing: "bg-primary/10 text-primary animate-pulse",
  generating_text: "bg-primary/10 text-primary animate-pulse",
  completing: "bg-secondary text-secondary-foreground",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-destructive/10 text-destructive",
};

export default function GenerationStatus({ jobId, contentType, onComplete }) {
  const [status, setStatus] = useState({
    status: "queued",
    stage: 0,
    totalStages: 3,
    progress: 0,
    message: STAGE_LABELS.queued,
  });
  const [variants, setVariants] = useState([]);
  const [error, setError] = useState(null);
  const [poller, setPoller] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    const handleUpdate = (newStatus) => {
      setStatus({
        status: newStatus.status || "processing",
        stage: newStatus.stage || 0,
        totalStages: newStatus.totalStages || 3,
        progress: newStatus.progress || 0,
        message: STAGE_LABELS[newStatus.status] || STAGE_LABELS.processing,
      });

      if (newStatus.variants && Array.isArray(newStatus.variants)) {
        setVariants(newStatus.variants);
      }
    };

    const handleComplete = (finalStatus) => {
      setStatus({
        status: finalStatus.status || "completed",
        stage: finalStatus.stage || 3,
        totalStages: 3,
        progress: finalStatus.status === "completed" ? 100 : 0,
        message: STAGE_LABELS[finalStatus.status] || STAGE_LABELS.completed,
      });

      if (finalStatus.variants && Array.isArray(finalStatus.variants)) {
        setVariants(finalStatus.variants);
      }

      if (finalStatus.status === "failed") {
        setError(finalStatus.error || "Generation failed");
      }

      if (onComplete) {
        onComplete(finalStatus);
      }
    };

    const newPoller = createGenerationPoller(jobId, contentType, handleUpdate, handleComplete, 3000);
    setPoller(newPoller);

    return () => {
      if (newPoller) newPoller.stop();
    };
  }, [jobId, onComplete]);

  const progressPercentage = status.progress || (status.status === "completed" ? 100 : 0);

  return (
    <Card className="rounded-3xl border-border/70 bg-card/95 p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)]">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {status.status === "completed" ? (
            <CheckCircle className="h-6 w-6 text-green-600" />
          ) : status.status === "failed" ? (
            <XCircle className="h-6 w-6 text-destructive" />
          ) : (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          )}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {status.message}
            </h3>
            <p className="text-sm text-muted-foreground">
              {contentType === "image" || contentType === "video"
                ? "Generating media content..."
                : "Creating content variants..."}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        {status.status !== "completed" && status.status !== "failed" && (
          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress: {progressPercentage}%</span>
              <span>
                Stage {status.stage} of {status.totalStages}
              </span>
            </div>
          </div>
        )}

        {/* Status Badge */}
        <Badge className={STAGE_COLORS[status.status] || STAGE_COLORS.queued}>
          {status.status === "completed" ? (
            <CheckCircle className="h-3 w-3 mr-1" />
          ) : status.status === "failed" ? (
            <XCircle className="h-3 w-3 mr-1" />
          ) : (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          )}
          {status.status.toUpperCase()}
        </Badge>

        {/* Real-time Preview */}
        {variants.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              Generated Content (Preview)
            </div>
            <div className="space-y-2">
              {variants.slice(0, 1).map((variant, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/50 bg-muted/30 p-4"
                >
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Variant {idx + 1}
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {variant.content || variant.title || "Content loading..."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4 inline mr-2" />
              Error
            </p>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        )}

        {/* Completion Action */}
        {status.status === "completed" && variants.length > 0 && (
          <div className="flex items-center gap-3 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>
              {variants.length} variant{variants.length > 1 ? "s" : ""} generated
              successfully!
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
