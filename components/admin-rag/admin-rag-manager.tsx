"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  bulkUpdateRagEntryStatusAction,
  createRagCategoryAction,
  createRagEntryAction,
  deleteRagEntriesAction,
  restoreRagEntryAction,
  restoreRagVersionAction,
  updateRagEntryAction,
} from "@/app/(admin)/actions";
import {
  LoaderIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    sourceUrl: string | null;
    categoryId: string | null;
    categoryName: string | null;
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
  categories: Array<{ id: string; name: string }>;
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

const DEFAULT_FORM = {
  title: "",
  content: "",
  type: "text" as (typeof RAG_TYPES)[number],
  status: "inactive" as RagEntryStatus,
  tags: [] as string[],
  models: [] as string[],
  sourceUrl: "",
  categoryId: "",
};

const sortCategories = (list: Array<{ id: string; name: string }>) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name));

export function AdminRagManager({
  analytics,
  currentUser,
  entries,
  modelOptions,
  tagOptions,
  categories,
}: AdminRagManagerProps) {
  const [entriesState, setEntriesState] = useState(entries);
  const [availableTags, setAvailableTags] = useState(tagOptions);
  const [categoryOptions, setCategoryOptions] = useState(
    sortCategories(categories)
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<RagEntryStatus | "all">(
    "all"
  );
  const [typeFilter, setTypeFilter] = useState<
    (typeof RAG_TYPES)[number] | "all"
  >("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] =
    useState<SerializedAdminRagEntry | null>(null);
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [versions, setVersions] = useState<RagVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isCreatingCategory, startCreateCategory] = useTransition();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setEntriesState(entries);
  }, [entries]);

  useEffect(() => {
    setAvailableTags(tagOptions);
  }, [tagOptions]);

  useEffect(() => {
    setCategoryOptions(sortCategories(categories));
  }, [categories]);

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

  const filteredEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return entriesState.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ? true : row.entry.status === statusFilter;
      const matchesType =
        typeFilter === "all" ? true : row.entry.type === typeFilter;
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
        matchesModel &&
        matchesTag &&
        matchesQuery
      );
    });
  }, [
    entriesState,
    statusFilter,
    typeFilter,
    modelFilter,
    tagFilter,
    searchTerm,
  ]);

  const allSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((entry) => selectedIds.includes(entry.entry.id));

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
          sourceUrl: entry.sourceUrl ?? null,
          categoryId: entry.categoryId ?? null,
          categoryName: entry.categoryName ?? null,
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

  const openCreateSheet = () => {
    resetForm();
    setSheetOpen(true);
  };

  const handleCreateCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCategoryError("Name is required");
      return;
    }
    setCategoryError("");
    startCreateCategory(() => {
      createRagCategoryAction(trimmed)
        .then((category) => {
          setCategoryOptions((prev) => sortCategories([...prev, category]));
          setFormState((prev) => ({
            ...prev,
            categoryId: category.id,
          }));
          toast.success(`Category "${category.name}" created.`);
          setNewCategoryName("");
          setCategoryError("");
          setCategoryDialogOpen(false);
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to create category";
          toast.error(message);
        });
    });
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
      sourceUrl: entry.entry.sourceUrl ?? "",
      categoryId: entry.entry.categoryId ?? "",
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
      sourceUrl: formState.sourceUrl.trim() || null,
      categoryId: formState.categoryId ? formState.categoryId : null,
    };

    if (!payload.title || !payload.content) {
      toast.error("Title and content are required");
      return;
    }

    beginProgress();
    startTransition(() => {
      const action = editingEntry
        ? updateRagEntryAction({ id: editingEntry.entry.id, input: payload })
        : createRagEntryAction(payload);

      action
        .then((entry) => {
          if (!entry) {
            return;
          }
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
          toast.success(editingEntry ? "Entry updated" : "Entry created");
          setSheetOpen(false);
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Unable to save entry"
          );
        })
        .finally(() => finishProgress());
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
    beginProgress();
    startTransition(() => {
      bulkUpdateRagEntryStatusAction({ ids: selectedIds, status })
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
        .catch(() => toast.error("Unable to update status"))
        .finally(() => finishProgress());
    });
  };

  const handleArchiveSelected = () => {
    if (!selectedIds.length) {
      toast.error("Select entries first");
      return;
    }
    beginProgress();
    startTransition(() => {
      deleteRagEntriesAction({ ids: selectedIds })
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
        .catch(() => toast.error("Unable to archive entries"))
        .finally(() => finishProgress());
    });
  };

  const handleRestoreEntry = (id: string) => {
    beginProgress();
    startTransition(() => {
      restoreRagEntryAction({ id })
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
        .catch(() => toast.error("Unable to restore entry"))
        .finally(() => finishProgress());
    });
  };

  const handleRestoreVersion = (versionId: string) => {
    if (!editingEntry) {
      return;
    }
    beginProgress();
    startTransition(() => {
      restoreRagVersionAction({ entryId: editingEntry.entry.id, versionId })
        .then(() => {
          toast.success("Version restored");
          setSheetOpen(false);
        })
        .catch(() => toast.error("Unable to restore version"))
        .finally(() => finishProgress());
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "—";
    }
    return new Date(value).toLocaleString();
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

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl">RAG Knowledge Base</h1>
          <p className="text-muted-foreground text-sm">
            Curate domain knowledge for retrieval-augmented conversations.
          </p>
        </div>
        <Button onClick={openCreateSheet} type="button">
          <PlusIcon />
          <span>New entry</span>
        </Button>
      </header>

      <AnalyticsSummary analytics={analytics} />

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search title or content"
            value={searchTerm}
          />
          <FilterGroup
            label="Status"
            onChange={(value) =>
              setStatusFilter(value as RagEntryStatus | "all")
            }
            options={["all", ...STATUS_OPTIONS]}
            value={statusFilter}
          />
          <FilterGroup
            label="Type"
            onChange={(value) =>
              setTypeFilter(value as (typeof RAG_TYPES)[number] | "all")
            }
            options={["all", ...RAG_TYPES]}
            value={typeFilter}
          />
          <select
            className="rounded-full border px-3 py-1 text-sm"
            onChange={(event) => setModelFilter(event.target.value)}
            value={modelFilter}
          >
            <option value="all">All models</option>
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-full border px-3 py-1 text-sm"
            onChange={(event) => setTagFilter(event.target.value)}
            value={tagFilter}
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={!selectedIds.length || isPending}
            onClick={() => handleBulkStatus("active")}
            size="sm"
            type="button"
            variant="outline"
          >
            Activate
          </Button>
          <Button
            disabled={!selectedIds.length || isPending}
            onClick={() => handleBulkStatus("inactive")}
            size="sm"
            type="button"
            variant="outline"
          >
            Deactivate
          </Button>
          <Button
            disabled={!selectedIds.length || isPending}
            onClick={handleArchiveSelected}
            size="sm"
            type="button"
            variant="destructive"
          >
            Archive
          </Button>
          <p className="text-muted-foreground text-sm">
            {selectedIds.length} selected
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="w-10 px-2 py-2">
                  <input
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    type="checkbox"
                  />
                </th>
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Models</th>
                <th className="px-2 py-2">Tags</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td
                    className="px-2 py-6 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    No entries match your filters.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((item) => (
                  <tr className="align-top" key={item.entry.id}>
                    <td className="px-2 py-3">
                      <input
                        checked={selectedIds.includes(item.entry.id)}
                        onChange={() => toggleSelection(item.entry.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-semibold">{item.entry.title}</div>
                      <p className="line-clamp-2 text-muted-foreground text-xs">
                        {item.entry.content}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      {item.entry.categoryName ? (
                        <Badge variant="secondary">
                          {item.entry.categoryName}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Uncategorized
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge status={item.entry.status} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.entry.models.length === 0 ? (
                          <Badge variant="outline">All</Badge>
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
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.entry.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground text-xs">
                      {formatDate(item.entry.updatedAt)}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={() => openEditor(item)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Edit
                        </Button>
                        {item.entry.status === "archived" ? (
                          <Button
                            onClick={() => handleRestoreEntry(item.entry.id)}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Restore
                          </Button>
                        ) : null}
                        <button
                          aria-label="Mark for archive"
                          className="rounded-full border p-1 text-muted-foreground transition hover:border-destructive hover:text-destructive"
                          onClick={() => toggleSelection(item.entry.id)}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
              {editingEntry ? "Update entry" : "Create entry"}
            </SheetTitle>
            <SheetDescription>
              Provide descriptive titles, clean content, and rich tags to
              improve match quality.
            </SheetDescription>
          </SheetHeader>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="rag-category">Category</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  id="rag-category"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      categoryId: event.target.value,
                    }))
                  }
                  value={formState.categoryId}
                >
                  <option value="">Uncategorized</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={isCreatingCategory}
                  onClick={() => {
                    setCategoryDialogOpen(true);
                    setCategoryError("");
                  }}
                  type="button"
                  variant="outline"
                >
                  Add category
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="rag-title">Title</Label>
              <Input
                id="rag-title"
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                required
                value={formState.title}
              />
            </div>
            <div>
              <Label htmlFor="rag-type">Content type</Label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                id="rag-type"
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    type: event.target.value as (typeof RAG_TYPES)[number],
                  }))
                }
                value={formState.type}
              >
                {RAG_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="rag-status">Status</Label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
                placeholder="https://example.com/policy.pdf"
                value={formState.sourceUrl}
              />
            </div>
            <div>
              <Label>Allowed models</Label>
              <p className="text-muted-foreground text-xs">
                Leave empty to allow every enabled chat model to retrieve this
                entry.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {modelOptions.map((model) => {
                  const checked = formState.models.includes(model.id);
                  return (
                    <button
                      className={cn(
                        "rounded-full border px-3 py-1 font-medium text-xs transition",
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
            <div>
              <Label>Tags</Label>
              <TagInput
                onAdd={addTag}
                onRemove={removeTag}
                tags={formState.tags}
              />
            </div>
            <div>
              <Label htmlFor="rag-content">Content</Label>
              <Textarea
                className="h-48 resize-y"
                id="rag-content"
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    content: event.target.value,
                  }))
                }
                required
                value={formState.content}
              />
            </div>
            {editingEntry ? (
              <VersionTimeline
                isLoading={versionsLoading}
                onRestore={handleRestoreVersion}
                versions={versions}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <Button disabled={isPending} type="submit">
                {isPending ? <LoaderIcon /> : null}
                <span>{editingEntry ? "Save changes" : "Create entry"}</span>
              </Button>
              <Button
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

      <AlertDialog
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) {
            setNewCategoryName("");
            setCategoryError("");
          }
        }}
        open={categoryDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create category</AlertDialogTitle>
            <AlertDialogDescription>
              Give this category a descriptive name. You can reuse it for future
              entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-category-name">Category name</Label>
            <Input
              autoFocus
              disabled={isCreatingCategory}
              id="new-category-name"
              onChange={(event) => {
                setNewCategoryName(event.target.value);
                setCategoryError("");
              }}
              placeholder="e.g. News, Study, FAQ"
              value={newCategoryName}
            />
            {categoryError ? (
              <p className="text-destructive text-xs">{categoryError}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreatingCategory}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isCreatingCategory}
              onClick={(event) => {
                event.preventDefault();
                handleCreateCategory();
              }}
            >
              {isCreatingCategory ? "Creating..." : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AnalyticsSummary({ analytics }: { analytics: RagAnalyticsSummary }) {
  const cards = [
    {
      label: "Active entries",
      value: analytics.activeEntries.toLocaleString(),
      description: `${analytics.totalEntries.toLocaleString()} total`,
    },
    {
      label: "Inactive entries",
      value: analytics.inactiveEntries.toLocaleString(),
      description: `${analytics.archivedEntries.toLocaleString()} archived`,
    },
    {
      label: "Pending indexing",
      value: analytics.pendingEmbeddings.toLocaleString(),
      description: "Needs syncing",
    },
    {
      label: "Top creator",
      value: analytics.creatorStats[0]?.name ?? "—",
      description: analytics.creatorStats[0]
        ? `${analytics.creatorStats[0].entryCount} entries`
        : "Invite teammates",
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <div
          className="rounded-2xl border bg-card/70 p-4 shadow-sm"
          key={card.label}
        >
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {card.label}
          </p>
          <p className="font-semibold text-2xl">{card.value}</p>
          <p className="text-muted-foreground text-xs">{card.description}</p>
        </div>
      ))}
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
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <div className="flex rounded-full border">
        {options.map((option) => {
          const isActive = option === value;
          return (
            <button
              className={cn(
                "px-3 py-1 font-medium text-xs transition",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary"
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
  const variants: Record<RagEntryStatus, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-amber-100 text-amber-700",
    archived: "bg-muted text-muted-foreground",
  };

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs", variants[status])}>
      {status}
    </span>
  );
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
  onRestore,
}: {
  versions: RagVersion[];
  isLoading: boolean;
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
                    onClick={() => onRestore(version.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Restore
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
