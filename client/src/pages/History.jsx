import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetchHistory, deleteHistoryEntry } from "@/services/aiService";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, Eye, Clock, Loader2, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import VariantExpandedModal from "@/components/generate/VariantExpandedModal";
import ExportDialog from "@/components/dialogs/ExportDialog";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { toast } from "@/components/ui/use-toast";
import { getPersonaById } from "@/lib/personas";
import { persistRefineSession } from "@/utils";

export default function History() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [expandedVariant, setExpandedVariant] = useState(null);
  const [exportVariant, setExportVariant] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const pageSize = 10;
  const loadMoreRef = useRef(null);

  const openRefineFromHistory = (entry, variant) => {
    const refineState = {
      activePersona: entry.persona,
      params: {
        topic: entry.topic,
        contentType: entry.content_type,
        tone: entry.tone,
        length: entry.length,
        keywords: entry.keywords,
        companyPersona: entry.company_persona_name
          ? {
              id: entry.company_persona_id,
              name: entry.company_persona_name,
              analysis: entry.company_persona_analysis,
              tagline: entry.company_tagline,
              logoUrl: entry.company_logo_url,
              notes: entry.company_persona_notes,
              visualStyleInstructions:
                entry.company_persona_visual_style_instructions,
              tuningPrompt: entry.company_persona_tuning_prompt,
              learningSummary: entry.company_persona_learning_summary,
            }
          : null,
      },
      generatedContent: variant,
      ragContext: entry.rag_context || "",
      originalPrompt: entry.original_prompt || "",
      messages:
        Array.isArray(entry.refinement_messages) &&
        entry.refinement_messages.length > 0
          ? entry.refinement_messages
          : [
              {
                role: "assistant",
                content: variant?.content || "",
                image_url: variant?.image_url || null,
                image_base64: variant?.image_base64 || null,
                image_prompt: variant?.image_prompt || null,
                image_revised_prompt: variant?.image_revised_prompt || null,
                title: variant?.title || null,
              },
            ],
    };

    persistRefineSession(refineState);
    navigate("/refine", { state: refineState });
  };

  const platforms = [
    "LinkedIn",
    "Instagram",
    "Facebook",
    "X / Twitter",
    "YouTube",
    "GitHub",
    "Threads",
  ];
  const contentTypes = [
    { label: "Text Only", value: "text-only" },
    { label: "Image", value: "image" },
    { label: "Video", value: "video" },
    { label: "Text + Image", value: "text-image" },
    { label: "Text + Video", value: "text-video" },
  ];

  const {
    data,
    error,
    isError,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["contentHistory"],
    initialPageParam: "",
    queryFn: ({ pageParam }) => fetchHistory(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
  });

  const history = useMemo(
    () =>
      (data?.pages || []).flatMap((page) =>
        (page?.items || []).map((entry) => ({
          ...entry,
          topic: String(entry?.topic || "").trim(),
          platform:
            entry?.platform || entry?.persona_label || entry?.persona || "",
          content_type: entry?.content_type || entry?.contentType || "",
          variants: Array.isArray(entry?.variants) ? entry.variants : [],
        })),
      ),
    [data],
  );

  useEffect(() => {
    if (
      selectedEntry &&
      !history.some((entry) => entry.id === selectedEntry.id)
    ) {
      setSelectedEntry(null);
    }
  }, [history, selectedEntry]);

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || !hasNextPage) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      {
        root: null,
        rootMargin: "0px 0px 240px 0px",
        threshold: 0,
      },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, history.length]);

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteHistoryEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contentHistory"] });
      toast({ title: "Entry deleted", duration: 1500 });
      setDeleteTarget(null);
    },
  });

  const filtered = history
    .filter((h) => h.status !== "deleted")
    .filter((h) =>
      search ? h.topic.toLowerCase().includes(search.toLowerCase()) : true,
    )
    .filter((h) => {
      if (platformFilter === "all") return true;
      const hPlatform = String(h.platform || "")
        .trim()
        .toLowerCase();
      const filterValue = String(platformFilter || "")
        .trim()
        .toLowerCase();
      return hPlatform === filterValue;
    })
    .filter((h) => {
      if (contentTypeFilter === "all") return true;
      const hContentType = String(h.content_type || "")
        .trim()
        .toLowerCase();
      const filterValue = String(contentTypeFilter || "")
        .trim()
        .toLowerCase();
      return hContentType === filterValue;
    })
    .filter((h) => {
      if (dateFilter === "all") return true;
      const rawDate =
        h.created_date ||
        h.created_at ||
        h.createdAt ||
        h.updated_at ||
        h.updatedAt;

      const entryDate = new Date(rawDate);

      if (!rawDate || Number.isNaN(entryDate.getTime())) {
        return false;
      }
      const now = new Date();

      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (dateFilter === "today") {
        return entryDate >= startOfToday;
      }

      if (dateFilter === "week") {
        return entryDate >= startOfWeek;
      }

      if (dateFilter === "month") {
        return entryDate >= startOfMonth;
      }

      return true;
    });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">
            Content History
          </h2>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} loaded entries
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics..."
            className="pl-9 bg-muted border-border text-sm"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Filters:
          </span>
        </div>

        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[140px] bg-muted border-border text-xs">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
          <SelectTrigger className="w-[140px] bg-muted border-border text-xs">
            <SelectValue placeholder="Content Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {contentTypes.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[140px] bg-muted border-border text-xs">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>

        {(platformFilter !== "all" ||
          contentTypeFilter !== "all" ||
          dateFilter !== "all") && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              setPlatformFilter("all");
              setContentTypeFilter("all");
              setDateFilter("all");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-foreground">
            Unable to load content history.
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {error?.message ||
              "The history request failed. Try again once the backend and session are available."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No content history yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const persona = getPersonaById(entry.persona) ||
              getPersonaById(String(entry.platform || "").toLowerCase()) || {
                color: "#64748b",
                label: entry.platform || "Unknown",
              };
            return (
              <div
                key={entry.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {entry.topic}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                        style={{
                          background: `${persona.color}1f`,
                          color: persona.color,
                          border: `1px solid ${persona.color}40`,
                        }}
                      >
                        {persona.label}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {entry.content_type}
                      </Badge>
                      {entry.company_persona_name && (
                        <Badge variant="outline" className="text-[10px]">
                          {entry.company_persona_name}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {entry.created_date
                          ? format(
                              new Date(entry.created_date),
                              "MMM d, yyyy · h:mm a",
                            )
                          : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setSelectedEntry(
                          selectedEntry?.id === entry.id ? null : entry,
                        )
                      }
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(entry)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded variants */}
                {selectedEntry?.id === entry.id && entry.variants && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {entry.variants.map((v, i) => (
                      <div
                        key={i}
                        className="bg-muted rounded-md p-3 cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() =>
                          setExpandedVariant({ ...v, fullEntry: entry })
                        }
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                          Variant {i + 1}
                          {v.title ? ` — ${v.title}` : ""}
                        </p>
                        <p className="text-xs text-secondary-foreground line-clamp-2">
                          {v.content}
                        </p>
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRefineFromHistory(entry, v);
                            }}
                          >
                            Regenerate
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-2">
              {isFetchingNextPage ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading 10 more chats...
                </div>
              ) : (
                <div className="h-6" aria-hidden="true" />
              )}
            </div>
          )}
        </div>
      )}

      <VariantExpandedModal
        variant={expandedVariant}
        fullEntry={expandedVariant?.fullEntry}
        open={!!expandedVariant}
        onClose={() => setExpandedVariant(null)}
        onExport={setExportVariant}
      />
      <ExportDialog
        variant={exportVariant}
        open={!!exportVariant}
        onClose={() => setExportVariant(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        title="Delete this entry?"
        description="This will soft-delete the content history entry."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
