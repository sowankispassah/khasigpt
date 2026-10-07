"use client";

import { BookUser } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AccountSection } from "@/components/account/account-ui";
import {
  LoaderIcon,
  PencilEditIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
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
import { doneGlobalProgress, startGlobalProgress } from "@/lib/ui/global-progress";
import {
  deletePersonalKnowledgeAction,
  savePersonalKnowledgeAction,
} from "./actions";
import { formatProfileDateTime, ProfilePill } from "./profile-ui";

type StructuredField = {
  key: string;
  label: string;
  labelKey: string;
  placeholder?: string;
  placeholderKey?: string;
  format?: (value: string) => string;
};

// The formatted sentences are stored as entry content, so they stay English.
const STRUCTURED_FIELDS: StructuredField[] = [
  {
    key: "fullName",
    label: "Full Name",
    labelKey: "profile.knowledge.field.full_name",
    placeholder: "e.g. Jane Doe",
    placeholderKey: "profile.knowledge.field.full_name_placeholder",
    format: (value) => `My name is ${value}`,
  },
  {
    key: "gender",
    label: "Gender",
    labelKey: "profile.knowledge.field.gender",
    placeholder: "enter your gender or type Prefer not to say",
    placeholderKey: "profile.knowledge.field.gender_placeholder",
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

const STATUS_VARIANTS = {
  approved: {
    defaultText: "Approved",
    key: "profile.knowledge.status.approved",
    tone: "success",
  },
  pending: {
    defaultText: "Pending approval",
    key: "profile.knowledge.status.pending",
    tone: "warning",
  },
  rejected: {
    defaultText: "Rejected",
    key: "profile.knowledge.status.rejected",
    tone: "danger",
  },
} as const;

function StatusBadge({
  status,
}: {
  status: SerializedPersonalKnowledgeEntry["approvalStatus"];
}) {
  const variant = STATUS_VARIANTS[status];
  return (
    <ProfilePill tone={variant.tone}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      <EditableTranslation
        defaultText={variant.defaultText}
        description="Approval status of a personal knowledge entry on the profile page."
        translationKey={variant.key}
      />
    </ProfilePill>
  );
}

export function PersonalKnowledgeSection({
  entries,
  id,
}: {
  entries: SerializedPersonalKnowledgeEntry[];
  /** Anchor for the in-page section index. */
  id?: string;
}) {
  const { translate } = useTranslation();
  const [items, setItems] = useState(entries);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEntry>({
    id: null,
    mainText: "",
    structured: createEmptyStructured(),
  });
  const [isPending, startTransition] = useTransition();

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
        toast.error(
          translate("profile.knowledge.toast.required", "{field} is required.").replace(
            "{field}",
            translate(field.labelKey, field.label)
          )
        );
        return;
      }
    }
    const mainText = draft.mainText.trim();
    if (!mainText) {
      toast.error(
        translate(
          "profile.knowledge.toast.main_required",
          "Please add what people should know about you."
        )
      );
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

    startGlobalProgress();
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
            draft.id
              ? translate("profile.knowledge.toast.updated", "Entry updated")
              : translate(
                  "profile.knowledge.toast.submitted",
                  "Entry submitted for review"
                )
          );
          setDialogOpen(false);
          resetDraft();
        })
        .catch(() =>
          toast.error(
            translate(
              "profile.knowledge.toast.save_error",
              "Unable to save your entry. Please try again."
            )
          )
        )
        .finally(() => doneGlobalProgress());
    });
  };

  const handleDelete = (entryId: string) => {
    startGlobalProgress();
    startTransition(() => {
      deletePersonalKnowledgeAction({ entryId })
        .then((result) => {
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setItems((prev) => prev.filter((item) => item.id !== entryId));
          toast.success(
            translate("profile.knowledge.toast.deleted", "Entry deleted")
          );
        })
        .catch(() =>
          toast.error(
            translate(
              "profile.knowledge.toast.delete_error",
              "Unable to delete entry. Please try again."
            )
          )
        )
        .finally(() => doneGlobalProgress());
    });
  };

  const addButton = (
    <Button
      className="h-10 w-full cursor-pointer rounded-lg sm:w-auto"
      disabled={isPending}
      onClick={openCreate}
      type="button"
    >
      <PlusIcon />
      <span>
        <EditableTranslation
          defaultText="Add knowledge"
          description="Button that opens the dialog to add a personal knowledge entry."
          translationKey="profile.knowledge.add"
        />
      </span>
    </Button>
  );

  return (
    <AccountSection
      action={addButton}
      description={
        <EditableTranslation
          defaultText="This information will be used to generate responses when users on the platform ask or search about you."
          description="Description of the personal knowledge section on the profile page."
          translationKey="profile.knowledge.description"
        />
      }
      icon={BookUser}
      id={id}
      title={
        <EditableTranslation
          defaultText="Personal knowledge"
          description="Title of the personal knowledge section on the profile page."
          translationKey="profile.knowledge.title"
        />
      }
    >
      <p className="mb-4 text-muted-foreground text-xs">
        <EditableTranslation
          defaultText="New or edited entries stay pending until an admin approves them."
          description="Explains that personal knowledge entries need admin approval."
          translationKey="profile.knowledge.review_note"
        />
      </p>

      {sortedItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BookUser aria-hidden="true" className="size-5" />
          </span>
          <p className="text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="No personal knowledge added yet."
              description="Empty state of the personal knowledge section."
              translationKey="profile.knowledge.empty"
            />
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedItems.map((entry) => (
            <li className="rounded-xl border bg-background p-4" key={entry.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-medium text-sm">{entry.title}</h3>
                    <StatusBadge status={entry.approvalStatus} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    <EditableTranslation
                      defaultText="Updated {date}"
                      description="When a personal knowledge entry was last updated."
                      translationKey="profile.knowledge.updated"
                      values={{
                        date: formatProfileDateTime(entry.updatedAt) ?? "—",
                      }}
                    />
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    className="h-9 cursor-pointer rounded-lg"
                    disabled={isPending}
                    onClick={() => openEdit(entry)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PencilEditIcon />
                    <span>
                      <EditableTranslation
                        defaultText="Edit"
                        description="Edit a personal knowledge entry."
                        translationKey="profile.knowledge.edit"
                      />
                    </span>
                  </Button>
                  <Button
                    className="h-9 cursor-pointer rounded-lg text-rose-700 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
                    disabled={isPending}
                    onClick={() => handleDelete(entry.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <TrashIcon />
                    <span>
                      <EditableTranslation
                        defaultText="Delete"
                        description="Delete a personal knowledge entry."
                        translationKey="profile.knowledge.delete"
                      />
                    </span>
                  </Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-foreground/90 text-sm leading-relaxed">
                {entry.content}
              </p>
            </li>
          ))}
        </ul>
      )}

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
            <DialogTitle>
              {draft.id ? (
                <EditableTranslation
                  defaultText="Edit entry"
                  description="Title of the dialog for editing a personal knowledge entry."
                  translationKey="profile.knowledge.dialog.edit_title"
                />
              ) : (
                <EditableTranslation
                  defaultText="Add entry"
                  description="Title of the dialog for adding a personal knowledge entry."
                  translationKey="profile.knowledge.dialog.add_title"
                />
              )}
            </DialogTitle>
            <DialogDescription>
              <EditableTranslation
                defaultText="Keep details concise and focused on information you want the platform to surface about you."
                description="Guidance in the personal knowledge entry dialog."
                translationKey="profile.knowledge.dialog.description"
              />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              {STRUCTURED_FIELDS.map((field) => (
                <div className="space-y-1" key={field.key}>
                  <Label htmlFor={`pk-${field.key}`}>
                    <EditableTranslation
                      defaultText={field.label}
                      description="Field label in the personal knowledge entry dialog."
                      translationKey={field.labelKey}
                    />
                  </Label>
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
                    placeholder={
                      field.placeholder && field.placeholderKey
                        ? translate(field.placeholderKey, field.placeholder)
                        : ""
                    }
                    required
                    value={draft.structured[field.key] ?? ""}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pk-content">
                <EditableTranslation
                  defaultText="Main text"
                  description="Label of the main text field in the personal knowledge entry dialog."
                  translationKey="profile.knowledge.field.main_text"
                />
              </Label>
              <Textarea
                className="min-h-[160px] resize-y"
                id="pk-content"
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    mainText: event.target.value,
                  }))
                }
                placeholder={translate(
                  "profile.knowledge.field.main_text_placeholder",
                  "Write what people should know about you when they search or ask about you. Your story, your profession, your achievements or anything that you do that people can know about"
                )}
                required
                value={draft.mainText}
              />
            </div>
          </div>
          <DialogFooter className="mt-4 flex items-center gap-2">
            <Button
              className="cursor-pointer"
              disabled={isPending}
              onClick={handleSave}
              type="button"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon />
                </span>
              ) : null}
              <span>
                {draft.id ? (
                  <EditableTranslation
                    defaultText="Save changes"
                    description="Save an edited personal knowledge entry."
                    translationKey="profile.knowledge.save_changes"
                  />
                ) : (
                  <EditableTranslation
                    defaultText="Submit for approval"
                    description="Submit a new personal knowledge entry for admin approval."
                    translationKey="profile.knowledge.submit"
                  />
                )}
              </span>
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => {
                setDialogOpen(false);
                resetDraft();
              }}
              type="button"
              variant="ghost"
            >
              <EditableTranslation
                defaultText="Cancel"
                description="Close the personal knowledge entry dialog without saving."
                translationKey="profile.knowledge.cancel"
              />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountSection>
  );
}
