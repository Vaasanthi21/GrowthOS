import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Expand,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  fetchImageGenerationStatus,
  fetchKnowledgeSource,
  fetchRagContext,
  generateContent,
  ingestKnowledgeSourceFromFile,
  saveToHistory,
  startImageGeneration,
} from "@/services/aiService";
import { platforms } from "@/lib/personas";
import {
  buildConversationKey,
  persistRefineSession,
  REFINE_SESSION_STORAGE_KEY,
  restoreRefineSession,
} from "@/utils";
import ExportDialog from "@/components/dialogs/ExportDialog";

const toneToLabel = (value) => {
  if (value < 30) return "formal";
  if (value < 70) return "balanced";
  return "casual";
};

const lengthToLabel = (value) => {
  if (value < 30) return "short (100-150 words)";
  if (value < 70) return "medium (200-300 words)";
  return "extended (400-600 words)";
};

const buildAttachmentContext = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  return attachments
    .map((attachment, index) => {
      const excerpt = String(attachment.content || "")
        .slice(0, 4000)
        .trim();
      return `Attachment ${index + 1}: ${attachment.title} (${attachment.sourceType})\n${excerpt}`;
    })
    .join("\n\n");
};

const buildRefinementPrompt = ({
  platform,
  params,
  personaContext,
  topic,
  currentContent,
  enhancementPrompt,
  ragContext,
  conversation,
  attachmentContext,
}) => `You are refining a social media post through an iterative editing conversation.

Platform: ${platform.label}
Audience style: ${platform.description}
Platform optimization goal: ${platform.optimization}
Content format: ${params.contentType}
${personaContext?.company ? `Company name: ${personaContext.company}` : ""}
${personaContext?.analysis ? `Brand style analysis: ${personaContext.analysis}` : ""}
${personaContext?.tagline ? `Brand tagline: ${personaContext.tagline}` : ""}
${personaContext?.tuningPrompt ? `Persistent style instructions: ${personaContext.tuningPrompt}` : ""}
${personaContext?.learningSummary ? `Cross-platform brand writing memory: ${personaContext.learningSummary}` : ""}
${ragContext ? `Retrieved grounding context:\n${ragContext}` : ""}
${attachmentContext ? `Uploaded attachment context:\n${attachmentContext}` : ""}

Original topic:
"${topic}"

Current post:
"""
${currentContent}
"""

Conversation so far:
${conversation.map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`).join("\n")}

Latest enhancement request:
"${enhancementPrompt}"

Tone: ${toneToLabel(params.tone)}
Target length: ${lengthToLabel(params.length)}
${params.keywords ? `Keywords: ${params.keywords}` : ""}

Rules:
- Preserve persona alignment and optimize specifically for ${platform.label}.
- Use retrieved grounding context as the factual source of truth.
- Use uploaded attachment context when it adds relevant facts, copy, or reference material.
- Do not invent unsupported facts. If the source context is missing a fact, avoid claiming it.
- Improve the post directly instead of explaining what you changed.
- Return one improved version only.

Respond in JSON format:
{
  "variants": [
    { "title": "", "content": "", "word_count": 0 }
  ]
}`;

const contentTypeNeedsImage = (contentType) =>
  String(contentType || "").includes("image");
const contentTypeNeedsVideo = (contentType) =>
  String(contentType || "").includes("video");
const isImageOnlyContentType = (contentType) => {
  const normalized = String(contentType || "")
    .trim()
    .toLowerCase();
  return normalized === "image" || normalized === "image-only";
};

const normalizeImageOnlyContent = (content, contentType) => {
  if (!isImageOnlyContentType(contentType) || !content) {
    return content;
  }

  return {
    ...content,
    content: "",
  };
};

const normalizeImageOnlyMessages = (messages, contentType) => {
  if (!isImageOnlyContentType(contentType) || !Array.isArray(messages)) {
    return Array.isArray(messages) ? messages.filter(Boolean) : [];
  }

  return messages.filter(Boolean).map((message) => {
    if (message?.role !== "assistant") {
      return message;
    }

    return {
      ...message,
      content: message.image_url || message.image_base64 ? "" : message.content,
    };
  });
};

const formatDuration = (value) => {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const buildRetrievalQuery = ({
  params,
  topic,
  currentContent,
  enhancementRequest,
  conversation,
  attachments,
}) => {
  return [
    topic,
    params?.keywords,
    params?.contentType,
    params?.companyPersona?.company,
    params?.companyPersona?.tagline,
    currentContent,
    enhancementRequest,
    conversation.map((item) => item.content).join(" "),
    Array.isArray(attachments)
      ? attachments
          .map((attachment) => `${attachment.title} ${attachment.content}`)
          .join(" ")
      : "",
    contentTypeNeedsVideo(params?.contentType)
      ? "video script storyboard shot list motion visual claims"
      : "",
    contentTypeNeedsImage(params?.contentType)
      ? "image visual composition product details brand assets"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const loadImageElement = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load ${file.name}`));
    };
    image.src = objectUrl;
  });

const canvasToBlob = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to compress image"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

const buildPreviewUrl = (file) => {
  if (!file.type?.startsWith("image/")) {
    return null;
  }

  return URL.createObjectURL(file);
};

const getAttachmentTypeLabel = (file) => {
  const fileName = String(file?.name || '').toLowerCase();

  if (file?.type?.startsWith('image/')) {
    return 'image';
  }

  if (fileName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (fileName.endsWith('.docx')) {
    return 'docx';
  }

  if (fileName.endsWith('.doc')) {
    return 'doc';
  }

  if (fileName.endsWith('.txt')) {
    return 'txt';
  }

  return 'text';
};

const prepareAttachmentFile = async (file) => {
  if (!file.type?.startsWith("image/")) {
    return file;
  }

  const image = await loadImageElement(file);
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to process image upload");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let blob = await canvasToBlob(canvas, 0.82);
  if (blob.size > 7 * 1024 * 1024) {
    blob = await canvasToBlob(canvas, 0.68);
  }

  if (blob.size > 7 * 1024 * 1024) {
    throw new Error(
      "Image is too large even after compression. Please upload a smaller image.",
    );
  }

  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`,
    { type: "image/jpeg" },
  );
};

const createAttachmentDraft = (file) => ({
  localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
  id: null,
  title: file.name,
  sourceType: getAttachmentTypeLabel(file),
  content: "",
  fileName: file.name,
  previewUrl: buildPreviewUrl(file),
  status: "queued",
  progress: 0,
  error: "",
});

const attachmentStatusLabel = {
  queued: "Queued",
  preparing: "Preparing",
  uploading: "Uploading",
  processing: "OCR",
  ready: "Ready",
  empty: "No text found",
  error: "Failed",
};

const mapAttachmentStatusFromSource = (source) => {
  const ocrStatus = String(source?.ocr_status || "")
    .trim()
    .toLowerCase();

  if (ocrStatus === "failed") {
    return "error";
  }

  if (ocrStatus === "empty") {
    return "empty";
  }

  if (ocrStatus === "processing") {
    return "processing";
  }

  return "ready";
};

const mapAttachmentProgressFromSource = (source) => {
  const status = mapAttachmentStatusFromSource(source);

  if (status === "processing") {
    return 96;
  }

  if (status === "error") {
    return 0;
  }

  return 100;
};

const buildInitialMessages = (initialState) => {
  const contentType = initialState?.params?.contentType;
  return normalizeImageOnlyMessages(initialState?.messages, contentType);
};

const isMeaningfulMessage = (message) => {
  if (!message) {
    return false;
  }

  const hasText = Boolean(String(message.content || "").trim());
  const hasImage = Boolean(message.image_url || message.image_base64);
  return hasText || hasImage;
};

export default function RefineContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = useMemo(() => {
    if (location.state) {
      return location.state;
    }

    return restoreRefineSession();
  }, [location.state]);
  const [messages, setMessages] = useState(() =>
    buildInitialMessages(initialState),
  );
  const [currentContent, setCurrentContent] = useState(() =>
    normalizeImageOnlyContent(
      initialState?.generatedContent || null,
      initialState?.params?.contentType,
    ),
  );
  const [promptInput, setPromptInput] = useState("");
  const [ragContext, setRagContext] = useState(initialState?.ragContext || "");
  const [attachments, setAttachments] = useState([]);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const [exportVariant, setExportVariant] = useState(null);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isImageGenerationPending, setIsImageGenerationPending] =
    useState(false);
  const [imageGenerationStatus, setImageGenerationStatus] = useState(null);
  const latestRefineHistoryIdRef = useRef(null);
  const sessionRootHistoryIdRef = useRef(
    initialState?.sessionRootHistoryId || initialState?.historyId || null,
  );
  const fileInputRef = useRef(null);
  const imageStatusPollerRef = useRef(null);

  const updateAttachment = useCallback((localId, updater) => {
    setAttachments((current) =>
      current.map((attachment) => {
        if (attachment.localId !== localId) {
          return attachment;
        }

        const nextPatch =
          typeof updater === "function" ? updater(attachment) : updater;
        return nextPatch ? { ...attachment, ...nextPatch } : attachment;
      }),
    );
  }, []);

  const applyGeneratedImageToConversation = useCallback(
    (conversation, content, image) => {
      const nextContent = {
        ...content,
        image_url: image.image_url || null,
        image_base64: image.image_base64 || null,
        image_prompt: image.prompt || null,
        image_revised_prompt: image.revised_prompt || null,
      };

      const nextConversation = [...conversation];
      for (let index = nextConversation.length - 1; index >= 0; index -= 1) {
        if (nextConversation[index]?.role === "assistant") {
          nextConversation[index] = {
            ...nextConversation[index],
            image_url: nextContent.image_url,
            image_base64: nextContent.image_base64,
            image_prompt: nextContent.image_prompt,
            image_revised_prompt: nextContent.image_revised_prompt,
          };
          break;
        }
      }

      return { nextContent, nextConversation };
    },
    [],
  );

  const params = initialState?.params || null;
  const platform = useMemo(
    () =>
      platforms.find((item) => item.id === initialState?.activePersona) ||
      platforms[0],
    [initialState?.activePersona],
  );

  useEffect(() => {
    if (!params) {
      return;
    }

    if (!isImageOnlyContentType(params.contentType)) {
      return;
    }

    setCurrentContent((current) =>
      normalizeImageOnlyContent(current, params.contentType),
    );
    setMessages((current) =>
      normalizeImageOnlyMessages(current, params.contentType),
    );
  }, [params]);

  const buildHistoryPayload = useCallback(
    (content, conversation, retrievalContext) => ({
      conversation_key: buildConversationKey([
        initialState?.historyId,
        sessionRootHistoryIdRef.current,
        params?.topic,
        initialState?.activePersona,
        params?.contentType,
      ]),
      topic: params?.topic,
      persona: initialState?.activePersona,
      persona_label: platform.label,
      company_persona_id: params?.companyPersona?.id ?? null,
      company_persona_name: params?.companyPersona?.name ?? null,
      company_persona_analysis: params?.companyPersona?.analysis ?? null,
      company_tagline: params?.companyPersona?.tagline ?? null,
      company_logo_url: params?.companyPersona?.logoUrl ?? null,
      company_persona_notes: params?.companyPersona?.notes ?? null,
      company_persona_visual_style_instructions:
        params?.companyPersona?.visualStyleInstructions ??
        params?.companyPersona?.visual_style_instructions ??
        null,
      company_persona_tuning_prompt:
        params?.companyPersona?.tuningPrompt ?? null,
      company_persona_learning_summary:
        params?.companyPersona?.learningSummary ?? null,
      content_type: params?.contentType,
      tone: params?.tone,
      length: params?.length,
      keywords: params?.keywords,
      variants: [content],
      refinement_messages: conversation,
      session_root_history_id: sessionRootHistoryIdRef.current,
      original_prompt: initialState?.originalPrompt ?? null,
      rag_context: retrievalContext || "",
      status: "completed",
    }),
    [
      initialState?.activePersona,
      initialState?.originalPrompt,
      params,
      platform.label,
    ],
  );

  const persistRefineState = useCallback(
    (content, conversation, retrievalContext) => {
      if (!initialState || !content) {
        return;
      }

      persistRefineSession({
        ...initialState,
        generatedContent: content,
        messages: conversation,
        sessionRootHistoryId: sessionRootHistoryIdRef.current,
        ragContext: retrievalContext || "",
      });
    },
    [initialState],
  );

  const attachmentUploadMutation = useMutation({
    mutationFn: async (queuedItems) => {
      const results = [];

      for (const queuedItem of queuedItems) {
        const draft = queuedItem?.draft;
        const originalFile = queuedItem?.file;

        if (!draft || !originalFile) {
          results.push({
            status: "error",
            error: "Invalid attachment payload",
          });
          continue;
        }

        updateAttachment(draft.localId, {
          status: "preparing",
          progress: 10,
          error: "",
        });

        try {
          const preparedFile = await prepareAttachmentFile(originalFile);

          updateAttachment(draft.localId, {
            status: "uploading",
            progress: 25,
          });

          const source = await ingestKnowledgeSourceFromFile({
            title: originalFile.name,
            fileName: preparedFile.name,
            file: preparedFile,
            source_type: originalFile.type?.startsWith("image/")
              ? "image"
              : "text",
            tags: ["refine-chat", "attachment"],
            onUploadProgress: ({ percent }) => {
              updateAttachment(draft.localId, {
                status: "uploading",
                progress: Math.max(25, Math.min(percent, 90)),
              });
            },
          });

          if (source.ocr_status === "processing") {
            updateAttachment(draft.localId, {
              id: source.id,
              title: source.title || originalFile.name,
              sourceType: getAttachmentTypeLabel(originalFile),
              content: source.content || "",
              fileName: originalFile.name,
              status: mapAttachmentStatusFromSource(source),
              progress: mapAttachmentProgressFromSource(source),
              error: "",
            });

            let resolvedSource = source;
            for (let attempt = 0; attempt < 20; attempt += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 1000));
              resolvedSource = await fetchKnowledgeSource(source.id);
              if (resolvedSource.ocr_status !== "processing") {
                break;
              }
            }

            if (resolvedSource.ocr_status === "failed") {
              throw new Error(resolvedSource.ocr_error || "OCR failed");
            }

            if (resolvedSource.ocr_status === "processing") {
              throw new Error(
                "OCR is still processing. Please try again in a moment.",
              );
            }

            updateAttachment(draft.localId, {
              id: resolvedSource.id,
              title: resolvedSource.title || originalFile.name,
              sourceType: getAttachmentTypeLabel(originalFile),
              content: resolvedSource.content || "",
              fileName: originalFile.name,
              status: mapAttachmentStatusFromSource(resolvedSource),
              progress: mapAttachmentProgressFromSource(resolvedSource),
              error:
                resolvedSource.ocr_status === "empty"
                  ? "No readable text was detected in this image."
                  : "",
            });
            results.push({
              localId: draft.localId,
              status: mapAttachmentStatusFromSource(resolvedSource),
            });
            continue;
          }

          updateAttachment(draft.localId, {
            id: source.id,
            title: source.title || originalFile.name,
            sourceType: getAttachmentTypeLabel(originalFile),
            content: source.content || "",
            fileName: originalFile.name,
            status: mapAttachmentStatusFromSource(source),
            progress: mapAttachmentProgressFromSource(source),
            error: "",
          });
          results.push({
            localId: draft.localId,
            status: mapAttachmentStatusFromSource(source),
          });
        } catch (error) {
          updateAttachment(draft.localId, {
            status: "error",
            progress: 0,
            error: error.message || "Upload failed",
          });
          results.push({
            localId: draft.localId,
            status: "error",
            error: error.message || "Upload failed",
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const readyCount = results.filter(
        (result) => result.status === "ready",
      ).length;
      const emptyCount = results.filter(
        (result) => result.status === "empty",
      ).length;
      const failedCount = results.filter(
        (result) => result.status === "error",
      ).length;

      if (readyCount > 0) {
        toast({
          title: "Files attached",
          description: `${readyCount} file(s) added to refinement context.`,
          duration: 2000,
        });
      }

      if (emptyCount > 0) {
        toast({
          title: "Image processed",
          description: `${emptyCount} image file(s) uploaded, but no readable text was detected.`,
          duration: 2500,
        });
      }

      if (failedCount > 0) {
        toast({
          title: "Some files failed",
          description: `${failedCount} file(s) could not be processed.`,
          variant: "destructive",
          duration: 3000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Attachment upload failed",
        description: error.message || "Unable to process the selected file.",
        variant: "destructive",
        duration: 3000,
      });
    },
  });

  useEffect(
    () => () => {
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (!initialState || !currentContent) {
      return;
    }

    const persistedState = {
      ...initialState,
      generatedContent: currentContent,
      messages,
      ragContext,
    };

    persistRefineSession(persistedState);
  }, [currentContent, initialState, messages, ragContext]);

  const stopImageStatusPolling = useCallback(() => {
    if (imageStatusPollerRef.current) {
      window.clearInterval(imageStatusPollerRef.current);
      imageStatusPollerRef.current = null;
    }
  }, []);

  const pollImageGenerationStatus = useCallback(
    (jobId, context) => {
      stopImageStatusPolling();

      const runPoll = async () => {
        try {
          const status = await fetchImageGenerationStatus(jobId);
          setImageGenerationStatus(status);

          if (status.status === "completed" && status.result) {
            stopImageStatusPolling();
            const updated = applyGeneratedImageToConversation(
              context.refinedConversation,
              context.refinedContent,
              status.result,
            );
            setCurrentContent(updated.nextContent);
            setMessages(updated.nextConversation);
            persistRefineState(
              updated.nextContent,
              updated.nextConversation,
              context.retrievalContext,
            );

            const finalizedHistory = await saveToHistory({
              ...buildHistoryPayload(
                updated.nextContent,
                updated.nextConversation,
                context.retrievalContext,
              ),
              refinement_parent_history_id: latestRefineHistoryIdRef.current,
              refinement_stage: "image-finalized",
            });
            if (!sessionRootHistoryIdRef.current) {
              sessionRootHistoryIdRef.current = finalizedHistory?.id || null;
            }
            latestRefineHistoryIdRef.current =
              finalizedHistory?.id || latestRefineHistoryIdRef.current;
            setIsImageGenerationPending(false);
            toast({ title: "Image ready", duration: 2000 });
            return;
          }

          if (status.status === "failed") {
            stopImageStatusPolling();
            setIsImageGenerationPending(false);
            toast({
              title: "Image generation failed",
              description:
                status.error || "Unable to generate image right now.",
              variant: "destructive",
              duration: 3000,
            });
          }
        } catch (error) {
          stopImageStatusPolling();
          setIsImageGenerationPending(false);
          toast({
            title: "Image status failed",
            description:
              error.message || "Unable to fetch image generation status.",
            variant: "destructive",
            duration: 3000,
          });
        }
      };

      void runPoll();
      imageStatusPollerRef.current = window.setInterval(() => {
        void runPoll();
      }, 2000);
    },
    [
      applyGeneratedImageToConversation,
      buildHistoryPayload,
      persistRefineState,
      stopImageStatusPolling,
    ],
  );

  const generateRefinedImageInBackground = useCallback(
    async ({ retrievalContext, refinedContent, refinedConversation }) => {
      if (!params || !contentTypeNeedsImage(params.contentType)) {
        return;
      }

      setIsImageGenerationPending(true);
      setImageGenerationStatus({
        status: "queued",
        phase: "Preparing image generation",
        progress: 5,
        elapsedMs: 0,
        estimatedRemainingMs: 120000,
        estimatedTotalMs: 120000,
      });

      try {
        const latestRefinementRequest = String(promptInput || "").trim();
        const imageVariantContext = [
          latestRefinementRequest
            ? `Latest user image change request: ${latestRefinementRequest}`
            : "",
          refinedContent.content || "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const job = await startImageGeneration({
          platform,
          topic: params.topic,
          contentType: params.contentType,
          companyPersona: params.companyPersona,
          ragContext: retrievalContext || "",
          keywords: params.keywords,
          variantTitle: refinedContent.title || "",
          variantContent: imageVariantContext,
        });
        if (!job?.jobId) {
          throw new Error("Image generation job did not start correctly.");
        }

        if (job.status) {
          setImageGenerationStatus(job.status);
        }

        pollImageGenerationStatus(job.jobId, {
          retrievalContext,
          refinedContent,
          refinedConversation,
        });
      } catch (error) {
        toast({
          title: "Image generation failed",
          description: error.message || "Unable to generate image right now.",
          variant: "destructive",
          duration: 3000,
        });
        setImageGenerationStatus(null);
      } finally {
      }
    },
    [params, platform, pollImageGenerationStatus, promptInput],
  );

  useEffect(
    () => () => {
      stopImageStatusPolling();
    },
    [stopImageStatusPolling],
  );

  const refineMutation = useMutation({
    mutationFn: async ({ nextConversation, promptText, activeAttachments }) => {
      if (!params || !currentContent || !String(promptText || "").trim()) {
        throw new Error("Refinement context is incomplete");
      }

      const imageOnlyRefinement = isImageOnlyContentType(params.contentType);
      const retrieval = await fetchRagContext(
        buildRetrievalQuery({
          params,
          topic: params.topic,
          currentContent: currentContent.content,
          enhancementRequest: promptText,
          conversation: nextConversation,
          attachments: activeAttachments,
        }),
      );

      let nextContent = null;
      if (imageOnlyRefinement) {
        nextContent = {
          ...currentContent,
          content: "",
          title: currentContent?.title || params.topic || "Generated visual",
          image_url: null,
          image_base64: null,
          image_prompt: promptText,
          image_revised_prompt: promptText,
        };
      } else {
        const prompt = buildRefinementPrompt({
          platform,
          params,
          personaContext: params.companyPersona,
          topic: params.topic,
          currentContent: currentContent.content,
          enhancementPrompt: promptText,
          ragContext: retrieval?.context || "",
          conversation: nextConversation,
          attachmentContext: buildAttachmentContext(activeAttachments),
        });

        const result = await generateContent({ prompt });
        nextContent = result?.[0] || null;

        if (!nextContent) {
          throw new Error("No refined content returned");
        }
      }

      const assistantMessage = {
        role: "assistant",
        content: imageOnlyRefinement ? "" : nextContent.content || "",
        image_url: nextContent.image_url || null,
        image_base64: nextContent.image_base64 || null,
        image_prompt: nextContent.image_prompt || null,
        image_revised_prompt: nextContent.image_revised_prompt || null,
        title: nextContent.title || null,
      };
      const fullConversation = [...nextConversation, assistantMessage];

      const historyEntry = await saveToHistory({
        ...buildHistoryPayload(
          nextContent,
          fullConversation,
          retrieval?.context || "",
        ),
        refinement_parent_history_id: latestRefineHistoryIdRef.current,
        refinement_stage: contentTypeNeedsImage(params.contentType)
          ? "text-ready"
          : "completed",
      });

      return {
        nextContent,
        nextConversation: fullConversation,
        ragContext: retrieval?.context || "",
        shouldGenerateImage: contentTypeNeedsImage(params.contentType),
        historyId: historyEntry?.id || null,
      };
    },
    onSuccess: (data) => {
      setMessages(data.nextConversation);
      setCurrentContent(data.nextContent);
      setRagContext(data.ragContext || "");
      setPendingUserMessage(null);
      if (!sessionRootHistoryIdRef.current) {
        sessionRootHistoryIdRef.current = data.historyId || null;
      }
      latestRefineHistoryIdRef.current = data.historyId || null;
      persistRefineState(
        data.nextContent,
        data.nextConversation,
        data.ragContext || "",
      );
      toast({ title: "Content refined", duration: 2000 });

      if (data.shouldGenerateImage) {
        void generateRefinedImageInBackground({
          retrievalContext: data.ragContext || "",
          refinedContent: data.nextContent,
          refinedConversation: data.nextConversation,
        });
      }
    },
    onError: (error) => {
      setPendingUserMessage(null);
      setIsImageGenerationPending(false);
      toast({
        title: "Refinement failed",
        description: error.message || "Unknown error",
        variant: "destructive",
        duration: 3000,
      });
    },
  });

  if (!initialState || !params || !currentContent) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              No refinement context found.
            </p>
            <Button onClick={() => navigate("/")}>Back to Generate</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const enqueueFiles = async (files) => {
    if (files.length === 0) {
      return;
    }

    const drafts = files.map((file) => ({
      file,
      draft: createAttachmentDraft(file),
    }));
    setAttachments((current) => [
      ...current,
      ...drafts.map((item) => item.draft),
    ]);
    await attachmentUploadMutation.mutateAsync(drafts);
  };

  const handleFileSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    await enqueueFiles(files);
    event.target.value = "";
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragActive(false);

    if (refineMutation.isPending || attachmentUploadMutation.isPending) {
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    await enqueueFiles(files);
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((current) => {
      const target = current.find(
        (attachment) =>
          attachment.id === attachmentId || attachment.localId === attachmentId,
      );
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter(
        (attachment) =>
          attachment.id !== attachmentId && attachment.localId !== attachmentId,
      );
    });
  };

  const handleCopyMessage = async (content, index) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      toast({ title: "Copied to clipboard", duration: 1500 });
      window.setTimeout(() => {
        setCopiedMessageIndex((current) =>
          current === index ? null : current,
        );
      }, 1500);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again.",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  const handleShareMessage = async (content) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Creative Studio OS response",
          text: content,
        });
        return;
      }

      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied for sharing",
        description:
          "Native share is unavailable here, so the response was copied instead.",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Share failed",
        description: "Unable to share this response right now.",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  const handleDownloadCurrentImage = async () => {
    const imageSource =
      currentContent?.image_url ||
      (currentContent?.image_base64
        ? `data:image/png;base64,${currentContent.image_base64}`
        : null);
    if (!imageSource) {
      return;
    }

    const filename = `${(currentContent?.title || "generated_visual").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_image.png`;

    try {
      const response = await fetch(imageSource);

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
        description: "Unable to download this image.",
        variant: "destructive",
      });
    }
  };

  const handleShareCurrentImage = async () => {
    const imageSource =
      currentContent?.image_url ||
      (currentContent?.image_base64
        ? `data:image/png;base64,${currentContent.image_base64}`
        : null);
    if (!imageSource) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: currentContent?.title || "Generated image",
          text:
            currentContent?.image_revised_prompt ||
            currentContent?.image_prompt ||
            currentContent?.title ||
            "Generated image",
          url: currentContent?.image_url || undefined,
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

  const getMessageImageSource = (message) =>
    message?.image_url ||
    (message?.image_base64
      ? `data:image/png;base64,${message.image_base64}`
      : null);

  const handleDownloadMessageImage = async (message) => {
    const imageSource = getMessageImageSource(message);
    if (!imageSource) {
      return;
    }

    const filename = `${(message?.title || currentContent?.title || "generated_visual").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_image.png`;

    try {
      const response = await fetch(imageSource);

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
        description: "Unable to download this image.",
        variant: "destructive",
      });
    }
  };

  const handleShareMessageImage = async (message) => {
    const imageSource = getMessageImageSource(message);
    if (!imageSource) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: message?.title || currentContent?.title || "Generated image",
          text:
            message?.image_revised_prompt ||
            message?.image_prompt ||
            message?.content ||
            "Generated image",
          url: message?.image_url || undefined,
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

  const handleSendRefinement = () => {
    const promptText = promptInput.trim();
    if (
      !promptText ||
      refineMutation.isPending ||
      attachmentUploadMutation.isPending
    ) {
      return;
    }

    const activeAttachments = attachments.filter(
      (attachment) => attachment.status === "ready",
    );
    const attachmentSummary = activeAttachments.length
      ? `\n\nAttached references:\n${activeAttachments.map((attachment) => `- ${attachment.title} (${attachment.sourceType})`).join("\n")}`
      : "";
    const nextUserMessage = {
      role: "user",
      content: `${promptText}${attachmentSummary}`,
    };
    const nextConversation = [...messages, nextUserMessage];

    setPendingUserMessage(nextUserMessage);
    setPromptInput("");
    setAttachments((current) =>
      current.filter((attachment) => attachment.status !== "ready"),
    );
    refineMutation.mutate({ nextConversation, promptText, activeAttachments });
  };

  const displayedMessages = (
    pendingUserMessage ? [...messages, pendingUserMessage] : messages
  ).filter(isMeaningfulMessage);

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
      <div className="mb-6 border-b border-border/70 pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Refinement Workspace
              </div>
              <h2 className="mt-2 text-2xl font-display font-bold tracking-tight text-foreground md:text-3xl">
                Shape the post through conversation
              </h2>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(-1)}
              className="gap-2 shrink-0 rounded-full px-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              {platform.label}
            </div>
            <div className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              {params.contentType}
            </div>
            {params.companyPersona?.name ? (
              <div className="rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
                {params.companyPersona.name}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Dialog open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen}>
          <DialogContent className="max-w-5xl overflow-hidden border-border/70 bg-background/98 p-0">
            <DialogHeader className="border-b border-border/70 px-6 py-4">
              <DialogTitle className="font-display text-lg">
                {currentContent?.title || "Generated visual"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex max-h-[80vh] items-center justify-center bg-muted/20 p-4 md:p-6">
              {currentContent?.image_url || currentContent?.image_base64 ? (
                <img
                  src={
                    currentContent.image_url ||
                    `data:image/png;base64,${currentContent.image_base64}`
                  }
                  alt={currentContent.title || "Generated visual"}
                  className="max-h-[72vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
                />
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleShareCurrentImage}
              >
                <Share2 className="h-4 w-4" />
                Share image
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleDownloadCurrentImage}
              >
                <Download className="h-4 w-4" />
                Download image
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="overflow-hidden border-border/70 bg-card/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <CardContent className="p-0">
            <div className="border-b border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground md:px-5">
              Ask for sharper hooks, stronger CTAs, tighter structure, better
              platform fit, or a different tone.
            </div>

            <div className="space-y-4 bg-gradient-to-b from-background via-background to-muted/20 px-4 py-5 md:px-5">
              {displayedMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" &&
                  getMessageImageSource(message) &&
                  !String(message.content || "").trim() ? (
                    <div className="max-w-[88%] overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm">
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => {
                          setCurrentContent((current) => ({
                            ...(current || {}),
                            ...message,
                          }));
                          setIsImageViewerOpen(true);
                        }}
                      >
                        <img
                          src={getMessageImageSource(message)}
                          alt={message.title || "Generated visual"}
                          className="max-h-[420px] w-full object-cover"
                        />
                      </button>
                      <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-card/80 px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleShareMessageImage(message)}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          Share image
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleDownloadMessageImage(message)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download image
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setCurrentContent((current) => ({
                              ...(current || {}),
                              ...message,
                            }));
                            setIsImageViewerOpen(true);
                          }}
                        >
                          <Expand className="h-3.5 w-3.5" />
                          View full image
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
                        message.role === "user"
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-tl-md border border-border/70 bg-card text-card-foreground"
                      }`}
                    >
                      {getMessageImageSource(message) ? (
                        <div className="mb-3 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => {
                              setCurrentContent((current) => ({
                                ...(current || {}),
                                ...message,
                              }));
                              setIsImageViewerOpen(true);
                            }}
                          >
                            <img
                              src={getMessageImageSource(message)}
                              alt={message.title || "Generated visual"}
                              className="max-h-[420px] w-full object-cover"
                            />
                          </button>
                          <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-card/80 px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleShareMessageImage(message)}
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              Share image
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                handleDownloadMessageImage(message)
                              }
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download image
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setCurrentContent((current) => ({
                                  ...(current || {}),
                                  ...message,
                                }));
                                setIsImageViewerOpen(true);
                              }}
                            >
                              <Expand className="h-3.5 w-3.5" />
                              View full image
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {String(message.content || "").trim() ? (
                        <div className="whitespace-pre-wrap">
                          {message.content}
                        </div>
                      ) : null}
                      {message.role === "assistant" &&
                      String(message.content || "").trim() ? (
                        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setExportVariant({
                                title:
                                  message.title ||
                                  currentContent?.title ||
                                  "Refined content",
                                content: message.content,
                                word_count: String(message.content || "")
                                  .split(/\s+/)
                                  .filter(Boolean).length,
                              })
                            }
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Export
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {refineMutation.isPending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Generating the next reply...
                  </div>
                </div>
              ) : null}

              {!refineMutation.isPending && isImageGenerationPending ? (
                <div className="flex justify-start">
                  <div className="w-full max-w-md rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>
                        {imageGenerationStatus?.phase ||
                          "Generating image in the background..."}
                      </span>
                    </div>
                    <Progress
                      value={imageGenerationStatus?.progress || 0}
                      className="mb-2 h-2"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground/90">
                      <span>
                        {Math.round(imageGenerationStatus?.progress || 0)}%
                        complete
                      </span>
                      <span>
                        Elapsed{" "}
                        {formatDuration(imageGenerationStatus?.elapsedMs || 0)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground/90">
                      Estimated remaining:{" "}
                      {formatDuration(
                        imageGenerationStatus?.estimatedRemainingMs || 0,
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`border-border/70 bg-card/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition ${isDragActive ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (
              !refineMutation.isPending &&
              !attachmentUploadMutation.isPending
            ) {
              setIsDragActive(true);
            }
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            const nextTarget = event.relatedTarget;
            if (nextTarget && event.currentTarget.contains(nextTarget)) {
              return;
            }
            setIsDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <CardContent className="p-4 md:p-5">
            <div
              className={`mb-4 rounded-3xl border border-dashed px-4 py-4 transition ${isDragActive ? "border-primary bg-primary/5" : "border-border/70 bg-muted/20"}`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border/70 pb-4">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <label>
                    <Paperclip className="h-4 w-4" />
                    Attach files
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.csv,.json,.pdf,.docx,image/*"
                      className="hidden"
                      onChange={handleFileSelection}
                      disabled={
                        attachmentUploadMutation.isPending ||
                        refineMutation.isPending
                      }
                    />
                  </label>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Add text, PDF, DOCX, or image files to ground this refinement.
                  Drop files anywhere in this composer. Image OCR is
                  auto-detected and runs in the background after upload.
                </p>
              </div>

              {attachments.length > 0 ? (
                <div className="mb-4 flex flex-wrap gap-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id || attachment.localId}
                      className="flex min-w-[240px] items-center gap-3 rounded-2xl border border-border/70 bg-muted/30 px-3 py-2"
                    >
                      {attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.title}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card text-muted-foreground">
                          {attachment.sourceType === "image" ? (
                            <ImageIcon className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="max-w-[180px] truncate text-xs font-medium text-foreground">
                          {attachment.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="rounded-full px-2 py-0 text-[10px] uppercase tracking-wide"
                          >
                            {attachment.sourceType}
                          </Badge>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {attachmentStatusLabel[attachment.status] ||
                              attachment.status}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80">
                            {Math.round(attachment.progress || 0)}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/70">
                          <div
                            className={`h-full rounded-full transition-all ${attachment.status === "error" ? "bg-destructive" : "bg-primary"}`}
                            style={{ width: `${attachment.progress || 0}%` }}
                          />
                        </div>
                        {attachment.error ? (
                          <p className="mt-1 text-[11px] text-destructive">
                            {attachment.error}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          removeAttachment(attachment.id || attachment.localId)
                        }
                        className="rounded-full text-muted-foreground transition hover:text-foreground"
                        aria-label={`Remove ${attachment.title}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Textarea
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              placeholder="Tell the assistant exactly what to improve..."
              className="min-h-28 resize-none border-0 bg-transparent px-0 text-sm leading-7 shadow-none focus-visible:ring-0"
            />
            <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-muted-foreground">
                Be explicit about tone, length, hook, CTA, clarity, platform
                optimization, or what to use from the attached files.
              </p>
              <Button
                onClick={handleSendRefinement}
                disabled={
                  refineMutation.isPending ||
                  attachmentUploadMutation.isPending ||
                  !promptInput.trim()
                }
                className="gap-2 rounded-full px-5"
              >
                {refineMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {refineMutation.isPending ? "Refining" : "Send refinement"}
              </Button>
            </div>
          </CardContent>
        </Card>
            </div>

      <ExportDialog
        variant={exportVariant}
        open={!!exportVariant}
        onClose={() => setExportVariant(null)}
      />
    </div>
  );
}
    
  

