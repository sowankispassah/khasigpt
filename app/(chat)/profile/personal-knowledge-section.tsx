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
  LoaderIcon,
  PencilEditIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RagEntryStatus } from "@/lib/db/schema";
import {
  deletePersonalKnowledgeAction,
  savePersonalKnowledgeAction,
} from "./actions";

type StructuredField = {
  key: string;
  label: string;
  placeholder?: string;
  format?: (value: string) => string;
};

const STRUCTURED_FIELDS: StructuredField[] = [
  {
    key: "fullName",
    label: "Full Name",
    placeholder: "e.g. Jane Doe",
    format: (value) => `My name is ${value}`,
  },
  {
    key: "gender",
    label: "Gender",
    placeholder: "enter your gender or type Prefer not to say",
    format: (value) => `My gender is ${value}`,
  },
];

export type SerializedPersonalKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  approvalStatus: "pending" | "approved" | "rejected";
  status: RagEntryStatus;
  createdAt: string;
  updatedAt: string;
};

type DraftEntry = {
  id: string | null;
  mainText: string;
  structured: Record<string, string>;
};

const createEmptyStructured = () => {
  const result: Record<string, string> = {};
  for (const field of STRUCTURED_FIELDS) {
    result[field.key] = "";
  }
  return result;
};

export function PersonalKnowledgeSection({
  entries,
}: {
  entries: SerializedPersonalKnowledgeEntry[];
}) {
  const [items, setItems] = useState(entries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEntry>({
    id: null,
    mainText: "",
    structured: createEmptyStructured(),
  });
  const [isPending, startTransition] = useTransition();
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [items]
  );

  const resetDraft = useCallback(() => {
    setDraft({
      id: null,
      mainText: "",
      structured: createEmptyStructured(),
    });
  }, []);

  const beginProgress = useCallback(() => {
    for (const timerId of timers.current) {
      clearTimeout(timerId);
    }
    setProgressVisible(true);
    setProgress(12);
    timers.current = [
      setTimeout(() => setProgress(42), 140),
      setTimeout(() => setProgress(72), 300),
      setTimeout(() => setProgress(90), 520),
    ];
  }, []);

  const finishProgress = useCallback(() => {
    for (const timerId of timers.current) {
      clearTimeout(timerId);
    }
    timers.current = [];
    setProgress(100);
    setTimeout(() => {
      setProgressVisible(false);
      setProgress(0);
    }, 240);
  }, []);

  useEffect(() => {
    return () => {
      for (const timerId of timers.current) {
        clearTimeout(timerId);
      }
    };
  }, []);

  const openCreate = () => {
    resetDraft();
    setDialogOpen(true);
  };

  const openEdit = (entry: SerializedPersonalKnowledgeEntry) => {
    setDraft((prev) => ({
      ...prev,
      id: entry.id,
      mainText: entry.content,
      structured: createEmptyStructured(),
    }));
    setDialogOpen(true);
  };

  const handleSave = () => {
    for (const field of STRUCTURED_FIELDS) {
      const value = draft.structured[field.key]?.trim() ?? "";
      if (!value) {
        toast.error(`${field.label} is required.`);
        return;
      }
    }
    const mainText = draft.mainText.trim();
    if (!mainText) {
      toast.error("Please add what people should know about you.");
      return;
    }

    const structuredSentences = STRUCTURED_FIELDS.map((field) => {
      const value = draft.structured[field.key]?.trim() ?? "";
      return field.format ? field.format(value) : `${field.label}: ${value}`;
    }).filter(Boolean);

    const combinedContent =
      `${structuredSentences.join(". ")}. ${mainText}`.trim();
    const titleFromName = draft.structured.fullName?.trim() ?? "";
    const computedTitle = titleFromName
      ? `${titleFromName} - Personal knowledge`
      : "Personal knowledge entry";

    beginProgress();
    startTransition(() => {
      savePersonalKnowledgeAction({
        id: draft.id,
        title: computedTitle,
        content: combinedContent,
      })
        .then((result) => {
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setItems((prev) => {
            const next = prev.filter((item) => item.id !== result.entry.id);
            return [
              {
                ...result.entry,
                createdAt:
                  result.entry.createdAt instanceof Date
                    ? result.entry.createdAt.toISOString()
                    : result.entry.createdAt,
                updatedAt:
                  result.entry.updatedAt instanceof Date
                    ? result.entry.updatedAt.toISOString()
                    : result.entry.updatedAt,
              },
              ...next,
            ];
          });
          toast.success(
            draft.id ? "Entry updated" : "Entry submitted for review"
          );
          setDialogOpen(false);
          resetDraft();
        })
        .catch(() =>
          toast.error("Unable to save your entry. Please try again.")
        )
        .finally(() => finishProgress());
    });
  };

  const handleDelete = (id: string) => {
    beginProgress();
    startTransition(() => {
      deletePersonalKnowledgeAction({ entryId: id })
        .then((result) => {
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setItems((prev) => prev.filter((item) => item.id !== id));
          toast.success("Entry deleted");
        })
        .catch(() => toast.error("Unable to delete entry. Please try again."))
        .finally(() => finishProgress());
    });
  };

  const statusBadge = (
    status: SerializedPersonalKnowledgeEntry["approvalStatus"]
  ) => {
    const variants: Record<
      SerializedPersonalKnowledgeEntry["approvalStatus"],
      { label: string; className: string }
    > = {
      approved: {
        label: "Approved",
        className: "bg-emerald-100 text-emerald-700",
      },
      pending: {
        label: "Pending approval",
        className: "bg-amber-100 text-amber-800",
      },
      rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
    };
    const variant = variants[status];
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${variant.className}`}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        {variant.label}
      </span>
    );
  };

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      {progressVisible ? (
        <div className="fixed inset-x-0 top-0 z-40 h-1 bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg">Personal knowledge</h2>
          <p className="text-muted-foreground text-sm">
            This information will be used to generate responses when users on
            the platform ask or search about you.
          </p>
          <p className="text-muted-foreground text-xs">
            New or edited entries stay pending until an admin approves them.
          </p>
        </div>
        <Button onClick={openCreate} type="button">
          <PlusIcon />
          <span>Add knowledge</span>
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {sortedItems.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
            No personal knowledge added yet.
          </div>
        ) : (
          sortedItems.map((entry) => (
            <div
              className="rounded-lg border bg-background/60 p-4 shadow-sm"
              key={entry.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-base">{entry.title}</h3>
                    {statusBadge(entry.approvalStatus)}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Updated {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={isPending}
                    onClick={() => openEdit(entry)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <PencilEditIcon />
                    <span>Edit</span>
                  </Button>
                  <Button
                    disabled={isPending}
                    onClick={() => handleDelete(entry.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <TrashIcon />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
              <p className="line-clamp-3 text-foreground/90 text-sm leading-relaxed">
                {entry.content}
              </p>
            </div>
          ))
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            resetDraft();
          }
        }}
        open={dialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit entry" : "Add entry"}</DialogTitle>
            <DialogDescription>
              Keep details concise and focused on information you want the
              platform to surface about you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {STRUCTURED_FIELDS.map((field) => (
                <div className="space-y-1" key={field.key}>
                  <Label htmlFor={`pk-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`pk-${field.key}`}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        structured: {
                          ...prev.structured,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                    placeholder={field.placeholder ?? ""}
                    required
                    value={draft.structured[field.key] ?? ""}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pk-content">Main text</Label>
              <Textarea
                className="min-h-[160px] resize-y"
                id="pk-content"
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    mainText: event.target.value,
                  }))
                }
                placeholder="Write what people should know about you when they search or ask about you. Your story, your profession, your achievements or anything that you do that people can know about"
                required
                value={draft.mainText}
              />
            </div>
          </div>
          <DialogFooter className="mt-4 flex items-center gap-2">
            <Button disabled={isPending} onClick={handleSave} type="button">
              {isPending ? (
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon />
                </span>
              ) : null}
              <span>{draft.id ? "Save changes" : "Submit for approval"}</span>
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false);
                resetDraft();
              }}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
