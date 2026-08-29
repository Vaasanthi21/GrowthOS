import React from "react";
import { Loader2, CheckCircle2, Clock, ShieldCheck, Film, Cloud, Sparkles, AlertCircle } from "lucide-react";

const PIPELINE_STEPS = [
  {
    id: 1,
    key: "planning",
    title: "1. Storyboard & Scene Budgeting",
    icon: Sparkles,
    minProgress: 5,
    description: "Creative Director dividing total video duration into modular 10s scene cards.",
  },
  {
    id: 2,
    key: "sora_generation",
    title: "2. Sora 2 Scene Clip Generation",
    icon: Film,
    minProgress: 20,
    description: "Multi-provider router submitting independent clips (≤12s) to Sora 2 engine.",
  },
  {
    id: 3,
    key: "asset_validation",
    title: "3. Clip Inspection & Checksums",
    icon: ShieldCheck,
    minProgress: 50,
    description: "FFprobe verifying clip duration, 720x1280 resolution, and SHA256 integrity.",
  },
  {
    id: 4,
    key: "composition",
    title: "4. HyperFrames Timeline Engine",
    icon: Clock,
    minProgress: 75,
    description: "Assembling timeline offsets, text typography, lower-thirds, and brand watermarks.",
  },
  {
    id: 5,
    key: "s3_upload",
    title: "5. Cloud S3 & Final Duration Check",
    icon: Cloud,
    minProgress: 100,
    description: "Uploading MP4 & PNG to AWS S3; validating target duration match (≤0.5s variance).",
  },
];

export default function RealtimeVideoPipelineTracker({ status, phase, progress = 0, error = null }) {
  const currentProgress = Number(progress) || (status === "completed" ? 100 : 0);

  const getStepState = (step) => {
    if (status === "failed") {
      if (currentProgress >= step.minProgress) return "failed";
      return "upcoming";
    }
    if (status === "completed" || currentProgress >= (step.id === 5 ? 100 : PIPELINE_STEPS[step.id]?.minProgress || 100)) {
      return "completed";
    }
    if (currentProgress >= step.minProgress) {
      return "active";
    }
    return "upcoming";
  };

  return (
    <div className="rounded-3xl border border-primary/20 bg-card/95 p-6 shadow-2xl space-y-6">
      {/* Tracker Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {status === "completed" ? (
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            ) : status === "failed" ? (
              <AlertCircle className="h-6 w-6 text-destructive" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Realtime Video Generation Pipeline
            </h3>
            <p className="text-xs text-muted-foreground">
              {phase || (status === "completed" ? "Generation complete" : "Orchestrating video pipeline...")}
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            {currentProgress}% COMPLETE
          </span>
        </div>
      </div>

      {/* 5-Step Pipeline Steps */}
      <div className="space-y-3 relative">
        {PIPELINE_STEPS.map((step, idx) => {
          const stepState = getStepState(step);
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`flex items-start gap-4 p-3.5 rounded-2xl border transition-all duration-300 ${
                stepState === "completed"
                  ? "border-green-500/30 bg-green-500/5"
                  : stepState === "active"
                  ? "border-primary/50 bg-primary/10 shadow-md ring-1 ring-primary/30 animate-pulse"
                  : stepState === "failed"
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-border/40 bg-muted/20 opacity-60"
              }`}
            >
              {/* Step Status Icon */}
              <div className="mt-0.5 shrink-0">
                {stepState === "completed" ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white font-bold text-xs">
                    ✓
                  </div>
                ) : stepState === "active" ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs animate-spin">
                    <Loader2 className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
                    {step.id}
                  </div>
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {step.title}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      stepState === "completed"
                        ? "bg-green-500/20 text-green-600"
                        : stepState === "active"
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stepState}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          <strong>Pipeline Failed:</strong> {error}
        </div>
      )}
    </div>
  );
}
