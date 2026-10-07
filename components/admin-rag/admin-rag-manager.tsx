"use client";

import { Search } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  bulkUpdateRagEntryStatusAction,
  createRagEntryAction,
  deleteRagEntriesAction,
  restoreRagEntryAction,
  restoreRagVersionAction,
  updateRagEntryAction,
} from "@/app/(admin)/actions";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import {
  LoaderIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { RagEntryStatus } from "@/lib/db/schema";
import {
  getRagChatScope,
  RAG_CHAT_SCOPE_OPTIONS,
  type RagChatScope,
} from "@/lib/rag/chat-scope";
import type {
  AdminRagEntry,
  RagAnalyticsSummary,
  SanitizedRagEntry,
} from "@/lib/rag/types";
import { cn } from "@/lib/utils";

export type SerializedAdminRagEntry = {
  entry: {
    id: string;
    title: string;
    content: string;
    type: string;
    status: RagEntryStatus;
    tags: string[];
    models: string[];
    chatScope: RagChatScope | null;
    sourceUrl: string | null;
    embeddingStatus: SanitizedRagEntry["embeddingStatus"];
    createdAt: string;
    updatedAt: string;
  };
  creator: AdminRagEntry["creator"];
};

type AdminRagManagerProps = {
  analytics: RagAnalyticsSummary;
  currentUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  entries: SerializedAdminRagEntry[];
  modelOptions: Array<{ id: string; label: string; provider: string }>;
  tagOptions: string[];
  degradedSections?: string[];
};

type RagVersion = {
  id: string;
  version: number;
  title: string;
  status: RagEntryStatus;
  createdAt: string;
  editorName: string | null;
  changeSummary: string | null;
};

const RAG_TYPES = [
  "text",
  "document",
  "image",
  "audio",
  "video",
  "link",
  "data",
] as const;
const STATUS_OPTIONS: RagEntryStatus[] = ["active", "inactive", "archived"];
const INITIAL_VISIBLE_RAG_ENTRIES = 10;
// A fixed locale and zone keep server-rendered and hydrated dates identical.
const RAG_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const FILTER_SELECT_CLASS =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto";
const ADMIN_RAG_ACTION_TIMEOUT_MS = 25_000;

type PendingAction =
  | "archive"
  | "bulk-active"
  | "bulk-inactive"
  | "restore"
  | "restore-version"
  | "submit";

type RagScopeFilter = RagChatScope | "all" | "legacy";

type RagFormState = {
  title: string;
  content: string;
  type: (typeof RAG_TYPES)[number];
  status: RagEntryStatus;
  tags: string[];
  models: string[];
  chatScope: RagChatScope | "";
  sourceUrl: string;
};

const DEFAULT_FORM: RagFormState = {
  title: "",
  content: "",
  type: "text" as (typeof RAG_TYPES)[number],
  status: "active" as RagEntryStatus,
  tags: [] as string[],
  models: [] as string[],
  chatScope: "default" as RagChatScope,
  sourceUrl: "",
};

const CHAT_SCOPE_LABELS: Record<RagChatScope, string> = {
  default: "General chat knowledge",
  study: "Study knowledge",
  identity: "User/company identity",
  jobs: "Jobs knowledge",
  shared: "Shared across modes",
};

const CHAT_SCOPE_DESCRIPTIONS: Record<RagChatScope, string> = {
  default: "Used by normal chat only. This is the default for custom RAG.",
  study: "Used by Study mode only. Use this for exam, lesson, or study help.",
  identity:
    "Used by normal chat for user, company, product, or app identity context.",
  jobs: "Used by Jobs mode only. Job imports remain managed from Jobs admin.",
  shared: "Available to general chat, Study mode, and Jobs mode.",
};

const QUICK_CREATE_SCOPES: Array<{
  scope: RagChatScope;
  label: string;
  description: string;
}> = [
  {
    scope: "default",
    label: "New general",
    description: "General chat",
  },
  {
    scope: "study",
    label: "New study",
    description: "Study mode",
  },
  {
    scope: "identity",
    label: "New identity",
    description: "User/company context",
  },
];

function withClientTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(
        new Error(`${label} timed out. Please retry; the page is still usable.`)
      );
    }, ADMIN_RAG_ACTION_TIMEOUT_MS);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function AdminRagManager({
  analytics,
  currentUser,
  entries,
  modelOptions,
  tagOptions,
  degradedSections = [],
}: AdminRagManagerProps) {
  const [entriesState, setEntriesState] = useState(entries);
  const [availableTags, setAvailableTags] = useState(tagOptions);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<RagEntryStatus | "all">(
    "all"
  );
  const [typeFilter, setTypeFilter] = useState<
    (typeof RAG_TYPES)[number] | "all"
  >("all");
  const [scopeFilter, setScopeFilter] = useState<RagScopeFilter>("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] =
    useState<SerializedAdminRagEntry | null>(null);
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [versions, setVersions] = useState<RagVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const titlePlaceholder = useEditableTranslation(
    "admin.rag.form.title_placeholder",
    "A short, specific title",
    "Placeholder for the custom knowledge title field.",
  );
  const { translate } = useTranslation();
  const contentPlaceholder = useEditableTranslation(
    "admin.rag.form.content_placeholder",
    "Write the fact or guidance exactly as KhasiGPT should understand it.",
    "Placeholder for the custom knowledge content field.",
  );

  useEffect(() => {
    setEntriesState(entries);
  }, [entries]);

  useEffect(() => {
    setAvailableTags(tagOptions);
  }, [tagOptions]);

  const clearProgressTimers = useCallback(() => {
    for (const timer of progressTimers.current) {
      clearTimeout(timer);
    }
    progressTimers.current = [];
  }, []);

  const beginProgress = useCallback(() => {
    clearProgressTimers();
    setProgressVisible(true);
    setProgress(12);
    progressTimers.current = [
      setTimeout(() => setProgress(40), 140),
      setTimeout(() => setProgress(68), 320),
      setTimeout(() => setProgress(88), 620),
    ];
  }, [clearProgressTimers]);

  const finishProgress = useCallback(() => {
    clearProgressTimers();
    setProgress(100);
    setTimeout(() => {
      setProgressVisible(false);
      setProgress(0);
    }, 260);
  }, [clearProgressTimers]);

  useEffect(() => () => clearProgressTimers(), [clearProgressTimers]);
  const isActionPending = pendingAction !== null;

  const runAction = useCallback(
    async <T,>(
      action: PendingAction,
      label: string,
      task: () => Promise<T>
    ): Promise<T> => {
      if (pendingAction) {
        throw new Error("Another RAG action is already running.");
      }

      setPendingAction(action);
      beginProgress();
      try {
        return await withClientTimeout(task(), label);
      } finally {
        finishProgress();
        setPendingAction(null);
      }
    },
    [beginProgress, finishProgress, pendingAction]
  );

  const filteredEntries = useMemo(() => {
    const query = deferredSearchTerm.trim().toLowerCase();
    return entriesState.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ? true : row.entry.status === statusFilter;
      const matchesType =
        typeFilter === "all" ? true : row.entry.type === typeFilter;
      const matchesScope =
        scopeFilter === "all"
          ? true
          : scopeFilter === "legacy"
            ? row.entry.chatScope === null
            : row.entry.chatScope === scopeFilter;
      const matchesModel =
        modelFilter === "all"
          ? true
          : row.entry.models.length === 0 ||
            row.entry.models.includes(modelFilter);
      const matchesTag =
        tagFilter === "all" ? true : row.entry.tags.includes(tagFilter);
      const matchesQuery = query
        ? row.entry.title.toLowerCase().includes(query) ||
          row.entry.content.toLowerCase().includes(query)
        : true;
      return (
        matchesStatus &&
        matchesType &&
        matchesScope &&
        matchesModel &&
        matchesTag &&
        matchesQuery
      );
    });
  }, [
    entriesState,
    statusFilter,
    typeFilter,
    scopeFilter,
    modelFilter,
    tagFilter,
    deferredSearchTerm,
  ]);

  const allSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((entry) => selectedIds.includes(entry.entry.id));
  const visibleEntries = showAllEntries
    ? filteredEntries
    : filteredEntries.slice(0, INITIAL_VISIBLE_RAG_ENTRIES);
  const hiddenEntryCount = Math.max(
    filteredEntries.length - visibleEntries.length,
    0
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) =>
        prev.filter(
          (id) => !filteredEntries.some((entry) => entry.entry.id === id)
        )
      );
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const entry of filteredEntries) {
        next.add(entry.entry.id);
      }
      return Array.from(next);
    });
  };

  const serializeEntry = useCallback(
    (entry: SanitizedRagEntry, source?: SerializedAdminRagEntry | null) => {
      const fallbackCreator = source?.creator ?? {
        id: currentUser.id,
        name: currentUser.name ?? currentUser.email ?? "Unknown",
        email: currentUser.email,
      };
      return {
        entry: {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          type: entry.type,
          status: entry.status,
          tags: entry.tags,
          models: entry.models,
          chatScope: getRagChatScope(entry.metadata),
          sourceUrl: entry.sourceUrl ?? null,
          embeddingStatus: entry.embeddingStatus,
          createdAt: new Date(entry.createdAt).toISOString(),
          updatedAt: new Date(entry.updatedAt).toISOString(),
        },
        creator: fallbackCreator,
      };
    },
    [currentUser]
  );

  const resetForm = useCallback(() => {
    setFormState(DEFAULT_FORM);
    setEditingEntry(null);
    setVersions([]);
  }, []);

  const openCreateSheet = (scope: RagChatScope = "default") => {
    resetForm();
    setFormState((prev) => ({
      ...prev,
      chatScope: scope,
    }));
    setSheetOpen(true);
  };

  const openEditor = (entry: SerializedAdminRagEntry) => {
    setEditingEntry(entry);
    setFormState({
      title: entry.entry.title,
      content: entry.entry.content,
      type: entry.entry.type as (typeof RAG_TYPES)[number],
      status: entry.entry.status,
      tags: entry.entry.tags,
      models: entry.entry.models,
      chatScope: entry.entry.chatScope ?? "default",
      sourceUrl: entry.entry.sourceUrl ?? "",
    });
    setSheetOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      title: formState.title.trim(),
      content: formState.content.trim(),
      type: formState.type,
      status: formState.status,
      tags: formState.tags,
      models: formState.models,
      metadata: { chatScope: formState.chatScope || null },
      sourceUrl: formState.sourceUrl.trim() || null,
    };

    if (!payload.title || !payload.content) {
      toast.error("Title and content are required");
      return;
    }

    void runAction("submit", "Saving RAG entry", () =>
      editingEntry
        ? updateRagEntryAction({ id: editingEntry.entry.id, input: payload })
        : createRagEntryAction(payload)
    )
      .then((entry) => {
        setEntriesState((prev) => {
          if (editingEntry) {
            return prev.map((item) =>
              item.entry.id === editingEntry.entry.id
                ? serializeEntry(entry, item)
                : item
            );
          }
          return [serializeEntry(entry, null), ...prev];
        });
        setAvailableTags((prev) => {
          const next = new Set(prev);
          for (const tag of entry.tags) {
            next.add(tag);
          }
          return Array.from(next);
        });
        if (entry.embeddingStatus === "failed") {
          toast.error(
            "Entry saved, but indexing failed. Check its index status and rebuild.",
          );
        } else {
          toast.success(editingEntry ? "Entry updated" : "Entry created");
        }
        setSheetOpen(false);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Unable to save entry"
        );
      });
  };

  useEffect(() => {
    if (!sheetOpen || !editingEntry) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    fetch(`/api/admin/rag/versions?entryId=${editingEntry.entry.id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load versions");
        }
        return res.json() as Promise<RagVersion[]>;
      })
      .then((data) => setVersions(data))
      .catch(() => toast.error("Unable to load version history"))
      .finally(() => setVersionsLoading(false));
  }, [sheetOpen, editingEntry]);

  const handleBulkStatus = (status: RagEntryStatus) => {
    if (!selectedIds.length) {
      toast.error("Select entries first");
      return;
    }
    void runAction(
      status === "active" ? "bulk-active" : "bulk-inactive",
      `Changing selected entries to ${status}`,
      () => bulkUpdateRagEntryStatusAction({ ids: selectedIds, status })
    )
      .then((updated) => {
          setEntriesState((prev) =>
            prev.map((item) => {
              const match = updated.find((entry) => entry.id === item.entry.id);
              return match ? serializeEntry(match, item) : item;
            })
          );
          toast.success("Status updated");
          setSelectedIds([]);
        })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to update status"
        )
      );
  };

  const handleArchiveSelected = () => {
    if (!selectedIds.length) {
      toast.error("Select entries first");
      return;
    }
    void runAction("archive", "Archiving selected entries", () =>
      deleteRagEntriesAction({ ids: selectedIds })
    )
        .then(() => {
          setEntriesState((prev) =>
            prev.map((item) =>
              selectedIds.includes(item.entry.id)
                ? {
                    ...item,
                    entry: {
                      ...item.entry,
                      status: "archived" as RagEntryStatus,
                    },
                  }
                : item
            )
          );
          toast.success("Entries archived");
          setSelectedIds([]);
        })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to archive entries"
        )
      );
  };

  const handleRestoreEntry = (id: string) => {
    void runAction("restore", "Restoring RAG entry", () =>
      restoreRagEntryAction({ id })
    )
        .then(() => {
          setEntriesState((prev) =>
            prev.map((item) =>
              item.entry.id === id
                ? {
                    ...item,
                    entry: {
                      ...item.entry,
                      status: "inactive" as RagEntryStatus,
                    },
                  }
                : item
            )
          );
          toast.success("Entry restored");
        })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to restore entry"
        )
      );
  };

  const handleRestoreVersion = (versionId: string) => {
    if (!editingEntry) {
      return;
    }
    void runAction("restore-version", "Restoring RAG version", () =>
      restoreRagVersionAction({ entryId: editingEntry.entry.id, versionId })
    )
        .then(() => {
          toast.success("Version restored");
          setSheetOpen(false);
        })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Unable to restore version"
        )
      );
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "—";
    }
    return RAG_DATE_FORMATTER.format(new Date(value));
  };

  const toggleModel = (id: string) => {
    setFormState((prev) => ({
      ...prev,
      models: prev.models.includes(id)
        ? prev.models.filter((model) => model !== id)
        : [...prev.models, id],
    }));
  };

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || formState.tags.includes(normalized)) {
      return;
    }
    setFormState((prev) => ({ ...prev, tags: [...prev.tags, normalized] }));
  };

  const removeTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      tags: prev.tags.filter((value) => value !== tag),
    }));
  };

  const renderRowActions = (item: SerializedAdminRagEntry) => (
    <div className="flex items-center gap-1.5 sm:justify-end">
      <Button
        className="h-8 cursor-pointer px-3 text-xs"
        onClick={() => openEditor(item)}
        size="sm"
        type="button"
        variant="outline"
      >
        Edit
      </Button>
      {item.entry.status === "archived" ? (
        <Button
          className="h-8 cursor-pointer px-3 text-xs"
          disabled={isActionPending}
          onClick={() => handleRestoreEntry(item.entry.id)}
          size="sm"
          type="button"
          variant="secondary"
        >
          {pendingAction === "restore" ? (
            <>
              <LoaderIcon className="animate-spin" />
              <span>Restoring...</span>
            </>
          ) : (
            "Restore"
          )}
        </Button>
      ) : null}
      <button
        aria-label="Mark for archive"
        aria-pressed={selectedIds.includes(item.entry.id)}
        className={cn(
          "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border text-muted-foreground transition hover:border-destructive/50 hover:text-destructive",
          selectedIds.includes(item.entry.id)
            ? "border-destructive/50 text-destructive"
            : ""
        )}
        onClick={() => toggleSelection(item.entry.id)}
        title="Mark for archive"
        type="button"
      >
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {progressVisible ? (
        <div className="fixed inset-x-0 top-0 z-30 h-1 bg-border/50">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {degradedSections.length > 0 ? (
        <AdminNotice>
          RAG data is partially unavailable. Failed sections:{" "}
          {degradedSections.join(", ")}. Existing database values were not
          confirmed, so fallback counts and empty lists are not authoritative.
        </AdminNotice>
      ) : null}

      <AnalyticsSummary
        analytics={analytics}
        isDegraded={degradedSections.includes("RAG analytics")}
      />

      <AdminPanel
        description="Curate general, study, and identity knowledge for retrieval-augmented conversations."
        title="RAG Knowledge Base"
      >
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_CREATE_SCOPES.map((item) => (
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                key={item.scope}
                onClick={() => openCreateSheet(item.scope)}
                size="sm"
                title={item.description}
                type="button"
                variant={item.scope === "default" ? "default" : "outline"}
              >
                <PlusIcon />
                <span>{item.label}</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                aria-label="Search title or content"
                className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setShowAllEntries(false);
                }}
                placeholder="Search title or content"
                type="search"
                value={searchTerm}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <select
                aria-label="Type"
                className={FILTER_SELECT_CLASS}
                onChange={(event) => {
                  setTypeFilter(event.target.value as (typeof RAG_TYPES)[number] | "all");
                  setShowAllEntries(false);
                }}
                value={typeFilter}
              >
                <option value="all">
                  {translate("admin.rag.filters.all_types", "All types")}
                </option>
                {RAG_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                aria-label="Scope"
                className={FILTER_SELECT_CLASS}
                onChange={(event) => {
                  setScopeFilter(event.target.value as RagScopeFilter);
                  setShowAllEntries(false);
                }}
                value={scopeFilter}
              >
                <option value="all">All scopes</option>
                {RAG_CHAT_SCOPE_OPTIONS.map((scope) => (
                  <option key={scope} value={scope}>
                    {CHAT_SCOPE_LABELS[scope]}
                  </option>
                ))}
                <option value="legacy">Legacy / unscoped</option>
              </select>
              <select
                aria-label="Tag"
                className={FILTER_SELECT_CLASS}
                onChange={(event) => {
                  setTagFilter(event.target.value);
                  setShowAllEntries(false);
                }}
                value={tagFilter}
              >
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <select
                aria-label="Advanced model filter"
                className={FILTER_SELECT_CLASS}
                onChange={(event) => {
                  setModelFilter(event.target.value);
                  setShowAllEntries(false);
                }}
                title="Advanced model filter"
                value={modelFilter}
              >
                <option value="all">All models</option>
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <FilterGroup
            label="Status"
            onChange={(value) => {
              setStatusFilter(value as RagEntryStatus | "all");
              setShowAllEntries(false);
            }}
            options={["all", ...STATUS_OPTIONS]}
            value={statusFilter}
          />
        </div>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/5 px-4 py-2.5">
            <p className="font-medium text-sm">{selectedIds.length} selected</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                onClick={() => handleBulkStatus("active")}
                size="sm"
                type="button"
                variant="outline"
              >
                {pendingAction === "bulk-active" ? (
                  <>
                    <LoaderIcon className="animate-spin" />
                    <span>Activating...</span>
                  </>
                ) : (
                  "Activate"
                )}
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                onClick={() => handleBulkStatus("inactive")}
                size="sm"
                type="button"
                variant="outline"
              >
                {pendingAction === "bulk-inactive" ? (
                  <>
                    <LoaderIcon className="animate-spin" />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  "Deactivate"
                )}
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                onClick={handleArchiveSelected}
                size="sm"
                type="button"
                variant="destructive"
              >
                {pendingAction === "archive" ? (
                  <>
                    <LoaderIcon className="animate-spin" />
                    <span>Archiving...</span>
                  </>
                ) : (
                  "Archive"
                )}
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                onClick={() => setSelectedIds([])}
                size="sm"
                type="button"
                variant="ghost"
              >
                <EditableTranslation
                  defaultText="Clear"
                  description="Clears the selected custom knowledge entries."
                  translationKey="admin.rag.selection.clear"
                />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="w-10 py-2.5 pr-0 pl-4 sm:px-4" scope="col">
                  <input
                    aria-label="Select all"
                    checked={allSelected}
                    className="cursor-pointer"
                    onChange={toggleSelectAll}
                    type="checkbox"
                  />
                </th>
                <th className="px-4 py-2.5 text-left font-medium" scope="col">Title</th>
                <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">Scope</th>
                <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell" scope="col">Status</th>
                <th className="hidden whitespace-nowrap px-4 py-2.5 text-left font-medium xl:table-cell" scope="col">Model restriction</th>
                <th className="hidden px-4 py-2.5 text-left font-medium lg:table-cell" scope="col">Tags</th>
                <th className="hidden px-4 py-2.5 text-left font-medium lg:table-cell" scope="col">Updated</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <AdminEmptyState
                      title={
                        degradedSections.includes("RAG entries")
                          ? "RAG entries could not be confirmed. Retry before treating this table as empty."
                          : "No entries match your filters."
                      }
                    />
                  </td>
                </tr>
              ) : (
                visibleEntries.map((item) => (
                  <tr className="align-top transition hover:bg-muted/30" key={item.entry.id}>
                    <td className="py-3 pr-0 pl-4 sm:px-4">
                      <input
                        aria-label={`Select ${item.entry.title}`}
                        checked={selectedIds.includes(item.entry.id)}
                        className="mt-0.5 cursor-pointer"
                        onChange={() => toggleSelection(item.entry.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[28rem]">
                      <p className="font-medium">{item.entry.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                        {item.entry.content}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs md:hidden">
                        <span className="sm:hidden">
                          <StatusBadge status={item.entry.status} />
                        </span>
                        <EmbeddingBadge status={item.entry.embeddingStatus} />
                        <span className="text-muted-foreground">
                          {item.entry.chatScope
                            ? CHAT_SCOPE_LABELS[item.entry.chatScope]
                            : "Legacy / unscoped"}
                        </span>
                      </div>
                      <div className="mt-3 sm:hidden">{renderRowActions(item)}</div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {item.entry.chatScope ? (
                        <Badge className="whitespace-nowrap" variant="outline">
                          {CHAT_SCOPE_LABELS[item.entry.chatScope]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Legacy / unscoped
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={item.entry.status} />
                        <span className="hidden md:inline">
                          <EmbeddingBadge status={item.entry.embeddingStatus} />
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {item.entry.models.length === 0 ? (
                          <Badge variant="outline">All models</Badge>
                        ) : (
                          item.entry.models.map((modelId) => {
                            const model = modelOptions.find(
                              (option) => option.id === modelId
                            );
                            return (
                              <Badge key={modelId} variant="outline">
                                {model?.label ?? "Model"}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {item.entry.tags.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.entry.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground text-xs lg:table-cell">
                      {formatDate(item.entry.updatedAt)}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {renderRowActions(item)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredEntries.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              <EditableTranslation
                defaultText="Showing {shown} of {total} entries"
                description="Count of visible custom knowledge entries under the admin list."
                translationKey="admin.rag.table.showing"
                values={{
                  shown: visibleEntries.length,
                  total: filteredEntries.length,
                }}
              />
            </span>
            {hiddenEntryCount > 0 ||
            (showAllEntries &&
              filteredEntries.length > INITIAL_VISIBLE_RAG_ENTRIES) ? (
              <Button
                className="cursor-pointer"
                onClick={() => setShowAllEntries((current) => !current)}
                size="sm"
                type="button"
                variant="outline"
              >
                {showAllEntries
                  ? "Show less"
                  : `Show more (${hiddenEntryCount})`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </AdminPanel>

      <Sheet
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            resetForm();
          }
        }}
        open={sheetOpen}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              <EditableTranslation
                defaultText={editingEntry ? "Update entry" : "Create entry"}
                description="Heading for the custom knowledge editor."
                translationKey={
                  editingEntry
                    ? "admin.rag.form.update_title"
                    : "admin.rag.form.create_title"
                }
              />
            </SheetTitle>
            <SheetDescription>
              <EditableTranslation
                defaultText="Add a clear title and the fact or guidance KhasiGPT should know."
                description="Short instructions shown above the custom knowledge form."
                translationKey="admin.rag.form.description"
              />
            </SheetDescription>
          </SheetHeader>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="rag-title">
                <EditableTranslation
                  defaultText="Title"
                  description="Label for the custom knowledge title."
                  translationKey="admin.rag.form.title"
                />
              </Label>
              <Input
                id="rag-title"
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder={titlePlaceholder.text}
                required
                value={formState.title}
              />
            </div>
            <div>
              <Label htmlFor="rag-content">
                <EditableTranslation
                  defaultText="Content"
                  description="Label for the custom knowledge content."
                  translationKey="admin.rag.form.content"
                />
              </Label>
              <Textarea
                className="h-56 resize-y"
                id="rag-content"
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    content: event.target.value,
                  }))
                }
                placeholder={contentPlaceholder.text}
                required
                value={formState.content}
              />
            </div>
            <div>
              <Label>
                <EditableTranslation
                  defaultText="Tags (optional)"
                  description="Label for optional custom knowledge tags."
                  translationKey="admin.rag.form.tags"
                />
              </Label>
              <TagInput
                onAdd={addTag}
                onRemove={removeTag}
                tags={formState.tags}
              />
            </div>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium text-sm">
                <EditableTranslation
                  defaultText="Advanced details (optional)"
                  description="Expandable heading for less commonly used custom knowledge settings."
                  translationKey="admin.rag.form.advanced"
                />
              </summary>
              <div className="mt-3 space-y-4">
                <div>
                  <Label htmlFor="rag-chat-scope">Knowledge scope</Label>
                  <select
                    className="mt-1 h-9 w-full cursor-pointer rounded-md border bg-background px-3 text-sm"
                    id="rag-chat-scope"
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        chatScope: event.target.value as RagChatScope,
                      }))
                    }
                    value={formState.chatScope || "default"}
                  >
                    {RAG_CHAT_SCOPE_OPTIONS.map((scope) => (
                      <option key={scope} value={scope}>
                        {CHAT_SCOPE_LABELS[scope]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {CHAT_SCOPE_DESCRIPTIONS[
                      formState.chatScope || "default"
                    ]}
                  </p>
                </div>
                <div>
                  <Label htmlFor="rag-source">Source URL (optional)</Label>
                  <Input
                    id="rag-source"
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        sourceUrl: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/policy"
                    value={formState.sourceUrl}
                  />
                </div>
                <div>
                  <Label htmlFor="rag-status">Status</Label>
                  <select
                    className="mt-1 h-9 w-full cursor-pointer rounded-md border bg-background px-3 text-sm"
                    id="rag-status"
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        status: event.target.value as RagEntryStatus,
                      }))
                    }
                    value={formState.status}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                {editingEntry && formState.type !== "text" ? (
                  <p className="text-muted-foreground text-xs">
                    Legacy content type: {formState.type}
                  </p>
                ) : null}
                <div>
                  <Label>Model restrictions</Label>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Leave empty for all models. Restrict only when this knowledge
                    is intentionally model-specific.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                {modelOptions.map((model) => {
                  const checked = formState.models.includes(model.id);
                  return (
                    <button
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1 font-medium text-xs transition",
                        checked
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted text-muted-foreground hover:border-primary/40"
                      )}
                      key={model.id}
                      onClick={(event) => {
                        event.preventDefault();
                        toggleModel(model.id);
                      }}
                      type="button"
                    >
                      {model.label}
                    </button>
                  );
                })}
                  </div>
                </div>
              </div>
            </details>
            {editingEntry ? (
              <VersionTimeline
                isLoading={versionsLoading}
                isRestoring={pendingAction === "restore-version"}
                onRestore={handleRestoreVersion}
                versions={versions}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <Button className="cursor-pointer" disabled={isActionPending} type="submit">
                {pendingAction === "submit" ? (
                  <>
                    <LoaderIcon className="animate-spin" />
                    <span>{editingEntry ? "Saving..." : "Creating..."}</span>
                  </>
                ) : (
                  <span>{editingEntry ? "Save changes" : "Create entry"}</span>
                )}
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isActionPending}
                onClick={() => {
                  setSheetOpen(false);
                  resetForm();
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AnalyticsSummary({
  analytics,
  isDegraded = false,
}: {
  analytics: RagAnalyticsSummary;
  isDegraded?: boolean;
}) {
  const topCreator = analytics.creatorStats[0];
  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <AdminStatCard
        hint={`${analytics.totalEntries.toLocaleString()} total`}
        label="Active entries"
        value={isDegraded ? null : analytics.activeEntries.toLocaleString()}
      />
      <AdminStatCard
        hint={`${analytics.archivedEntries.toLocaleString()} archived`}
        label="Inactive entries"
        value={isDegraded ? null : analytics.inactiveEntries.toLocaleString()}
      />
      <AdminStatCard
        hint="Needs syncing"
        label="Pending indexing"
        value={isDegraded ? null : analytics.pendingEmbeddings.toLocaleString()}
      />
      <AdminStatCard
        hint={topCreator ? `${topCreator.entryCount} entries` : "Invite teammates"}
        label="Top creator"
        value={
          isDegraded ? null : (
            <span className="block truncate text-lg sm:text-xl">
              {topCreator?.name ?? "—"}
            </span>
          )
        }
      />
    </section>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
        {options.map((option) => {
          const isActive = option === value;
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1 font-medium text-xs capitalize transition",
                isActive
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={option}
              onClick={() => onChange(option)}
              type="button"
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RagEntryStatus }) {
  const tones = {
    active: "success",
    archived: "neutral",
    inactive: "warning",
  } as const;

  return (
    <AdminStatusPill className="capitalize" tone={tones[status]}>
      {status}
    </AdminStatusPill>
  );
}

/** Only shown when the entry is not searchable yet or indexing failed. */
function EmbeddingBadge({
  status,
}: {
  status: SanitizedRagEntry["embeddingStatus"];
}) {
  if (status === "failed") {
    return (
      <AdminStatusPill tone="danger">
        <EditableTranslation
          defaultText="Index failed"
          description="Custom knowledge entry whose search index could not be built."
          translationKey="admin.rag.index.failed"
        />
      </AdminStatusPill>
    );
  }
  if (status === "pending" || status === "queued") {
    return (
      <AdminStatusPill tone="info">
        <EditableTranslation
          defaultText="Indexing"
          description="Custom knowledge entry whose search index is still being built."
          translationKey="admin.rag.index.pending"
        />
      </AdminStatusPill>
    );
  }
  return null;
}

function TagInput({
  tags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge className="gap-1" key={tag} variant="secondary">
            {tag}
            <button onClick={() => onRemove(tag)} type="button">
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onAdd(draft);
            setDraft("");
          }
        }}
        placeholder="Add tag and press Enter"
        value={draft}
      />
    </div>
  );
}

function VersionTimeline({
  versions,
  isLoading,
  isRestoring,
  onRestore,
}: {
  versions: RagVersion[];
  isLoading: boolean;
  isRestoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  const PAGE_SIZE = 3;
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, []);

  const totalPages = Math.max(1, Math.ceil(versions.length / PAGE_SIZE));
  const startIndex = page * PAGE_SIZE;
  const visibleVersions = versions.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2">
        <SparklesIcon />
        <span className="font-semibold">Version history</span>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <LoaderIcon /> Loading versions…
        </p>
      ) : versions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No versions recorded yet.
        </p>
      ) : (
        <>
          <ul className="space-y-2 pr-1">
            {visibleVersions.map((version) => (
              <li className="rounded-lg border p-2" key={version.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">
                      Version {version.version}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(version.createdAt).toLocaleString()} ·{" "}
                      {version.editorName ?? "System"}
                    </p>
                    {version.changeSummary ? (
                      <p className="text-muted-foreground text-xs">
                        {version.changeSummary}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    disabled={isRestoring}
                    onClick={() => onRestore(version.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isRestoring ? (
                      <>
                        <LoaderIcon className="animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      "Restore"
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {versions.length > PAGE_SIZE ? (
            <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
              <Button
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                size="sm"
                type="button"
                variant="ghost"
              >
                Previous
              </Button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <Button
                disabled={page >= totalPages - 1}
                onClick={() =>
                  setPage((current) => Math.min(totalPages - 1, current + 1))
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
