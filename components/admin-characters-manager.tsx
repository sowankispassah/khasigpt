"use client";

import {
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import Image from "next/image";
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
  createCharacterAction,
  deleteCharacterAction,
  updateCharacterAction,
} from "@/app/(admin)/actions";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { useTranslation } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  type CharacterReferenceCategory,
  type CharacterReferenceImage,
  type CharacterReferenceType,
  hasFrontReference,
  normalizeCharacterReferences,
} from "@/lib/ai/character-reference-types";
import type { CharacterRefImage } from "@/lib/db/schema";
import { doneGlobalProgress, startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

const IDENTITY_REFERENCE_SLOTS: Array<{
  type: Extract<CharacterReferenceType, "front" | "left" | "right">;
  label: string;
  helper: string;
  required?: boolean;
}> = [
  {
    type: "front",
    label: "Front Face",
    helper: "Required identity anchor",
    required: true,
  },
  {
    type: "left",
    label: "Left Side / 3/4 Face",
    helper: "Optional angle reference",
  },
  {
    type: "right",
    label: "Right Side / 3/4 Face",
    helper: "Optional angle reference",
  },
];

const EXPRESSION_REFERENCE_SLOTS: Array<{
  type: Extract<
    CharacterReferenceType,
    "smile" | "laugh" | "sad" | "shock" | "angry" | "neutral" | "other"
  >;
  label: string;
}> = [
  { type: "smile", label: "Smiling" },
  { type: "laugh", label: "Laughing" },
  { type: "sad", label: "Sad / Crying" },
  { type: "shock", label: "Shocked / Surprised" },
  { type: "angry", label: "Angry" },
  { type: "neutral", label: "Neutral / Serious" },
  { type: "other", label: "Other" },
];

const ADDITIONAL_REFERENCE_TYPES: CharacterReferenceType[] = [
  "front",
  "left",
  "right",
  "smile",
  "laugh",
  "sad",
  "shock",
  "angry",
  "neutral",
  "other",
];

export type SerializedCharacter = {
  id: string;
  canonicalName: string;
  aliases: string[];
  refImages: CharacterRefImage[];
  lockedPrompt: string | null;
  negativePrompt: string | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  complexion: string | null;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditableRefImage = CharacterReferenceImage & {
  localId: string;
};

type UploadTarget = {
  category: CharacterReferenceCategory;
  type: CharacterReferenceType;
  label?: string | null;
};

type CharacterFormState = {
  canonicalName: string;
  aliasesText: string;
  lockedPrompt: string;
  negativePrompt: string;
  gender: string;
  height: string;
  weight: string;
  enabled: boolean;
};

const DEFAULT_FORM: CharacterFormState = {
  canonicalName: "",
  aliasesText: "",
  lockedPrompt: "",
  negativePrompt: "",
  gender: "",
  height: "",
  weight: "",
  enabled: true,
};

function serializeCharacter(input: SerializedCharacter) {
  const createdAt = new Date(input.createdAt);
  const updatedAt = new Date(input.updatedAt);

  return {
    ...input,
    createdAt: Number.isNaN(createdAt.getTime())
      ? input.createdAt
      : createdAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime())
      ? input.updatedAt
      : updatedAt.toISOString(),
  };
}

function normalizeAliases(value: string) {
  return value
    .split(/[\n,]/g)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

const updatedFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return updatedFormatter.format(parsed);
}

function frontReferenceUrl(refImages: CharacterRefImage[]) {
  const front = normalizeCharacterReferences(refImages).find(
    (ref) => ref.category === "identity" && ref.type === "front"
  );
  return front?.url && isOptimizedPreviewUrl(front.url) ? front.url : null;
}

function CharacterAvatar({ character }: { character: SerializedCharacter }) {
  const url = frontReferenceUrl(character.refImages ?? []);
  if (url) {
    return (
      <Image
        alt=""
        className="size-9 shrink-0 rounded-full border object-cover"
        height={36}
        src={url}
        width={36}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs uppercase"
    >
      {character.canonicalName.slice(0, 1)}
    </span>
  );
}

function CharacterStatusPill({ enabled }: { enabled: boolean }) {
  return (
    <AdminStatusPill tone={enabled ? "success" : "neutral"}>
      {enabled ? "Enabled" : "Disabled"}
    </AdminStatusPill>
  );
}

function buildEditableRefImages(refImages: CharacterRefImage[]) {
  return normalizeCharacterReferences(refImages).map((ref) => ({
    ...ref,
    isPrimary: Boolean(ref.isPrimary),
    mimeType: ref.mimeType || "image/png",
    localId: crypto.randomUUID(),
  }));
}

function isOptimizedPreviewUrl(url: string) {
  return url.includes("vercel-storage.com");
}

export function AdminCharactersManager({
  characters,
  charactersConfirmed,
}: {
  characters: SerializedCharacter[];
  charactersConfirmed: boolean;
}) {
  const { translate } = useTranslation();
  const [charactersState, setCharactersState] = useState(() =>
    characters.map(serializeCharacter)
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] =
    useState<SerializedCharacter | null>(null);
  const [formState, setFormState] = useState<CharacterFormState>(DEFAULT_FORM);
  const [refImages, setRefImages] = useState<EditableRefImage[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlType, setUrlType] = useState<CharacterReferenceType>("other");
  const [urlLabel, setUrlLabel] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<UploadTarget | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryCharacter, setGalleryCharacter] =
    useState<SerializedCharacter | null>(null);

  useEffect(() => {
    setCharactersState(characters.map(serializeCharacter));
  }, [characters]);

  // Reuse the app-wide top progress bar for uploads and saves.
  const beginProgress = useCallback(() => startGlobalProgress(), []);
  const finishProgress = useCallback(() => doneGlobalProgress(), []);

  const filteredCharacters = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      return charactersState;
    }
    return charactersState.filter((character) => {
      if (character.canonicalName.toLowerCase().includes(normalized)) {
        return true;
      }
      return character.aliases.some((alias) =>
        alias.toLowerCase().includes(normalized)
      );
    });
  }, [charactersState, searchTerm]);

  const stats = useMemo(
    () => ({
      enabled: charactersState.filter((character) => character.enabled).length,
      missingFront: charactersState.filter(
        (character) => !hasFrontReference(character.refImages)
      ).length,
      total: charactersState.length,
    }),
    [charactersState]
  );

  const openCreateSheet = useCallback(() => {
    setEditingCharacter(null);
    setFormState(DEFAULT_FORM);
    setRefImages([]);
    setUrlInput("");
    setUrlType("other");
    setUrlLabel("");
    setSheetOpen(true);
  }, []);

  const openEditSheet = useCallback((character: SerializedCharacter) => {
    setEditingCharacter(character);
    setFormState({
      canonicalName: character.canonicalName,
      aliasesText: character.aliases.join(", "),
      lockedPrompt: character.lockedPrompt ?? "",
      negativePrompt: character.negativePrompt ?? "",
      gender: character.gender ?? "",
      height: character.height ?? "",
      weight: character.weight ?? "",
      enabled: character.enabled,
    });
    setRefImages(buildEditableRefImages(character.refImages ?? []));
    setUrlInput("");
    setUrlType("other");
    setUrlLabel("");
    setSheetOpen(true);
  }, []);

  const removeRefImage = useCallback((id: string) => {
    setRefImages((prev) => prev.filter((ref) => ref.localId !== id));
  }, []);

  const handleUpload = useCallback(
    async (file: File, target: UploadTarget) => {
      beginProgress();
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload.error ?? "Upload failed");
        }

        const data = (await response.json()) as {
          url?: string;
          downloadUrl?: string;
          pathname?: string;
          contentType?: string;
        };

        const url = data.url ?? data.downloadUrl ?? data.pathname;
        if (!url) {
          throw new Error("Upload did not return a URL");
        }

        const now = new Date().toISOString();
        const nextRef: EditableRefImage = {
          localId: crypto.randomUUID(),
          url,
          mimeType: file.type || data.contentType || "image/png",
          role: target.type,
          category: target.category,
          type: target.type,
          label: target.label ?? null,
          isPrimary: target.type === "front",
          updatedAt: now,
        };
        setRefImages((prev) => {
          if (target.category === "additional") {
            return [...prev, nextRef];
          }
          const existingIndex = prev.findIndex(
            (ref) =>
              ref.category === target.category && ref.type === target.type
          );
          if (existingIndex === -1) {
            return [...prev, nextRef];
          }
          return prev.map((ref, index) =>
            index === existingIndex ? nextRef : ref
          );
        });
        toast.success(
          translate("admin.characters.references.added", "Reference image added")
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate("admin.characters.references.upload_failed", "Upload failed")
        );
      } finally {
        finishProgress();
        setIsUploading(false);
      }
    },
    [beginProgress, finishProgress, translate]
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];
      const target = uploadTargetRef.current;
      if (file && target) {
        void handleUpload(file, target);
      }
      uploadTargetRef.current = null;
      if (event.target) {
        event.target.value = "";
      }
    },
    [handleUpload]
  );

  const chooseUpload = useCallback((target: UploadTarget) => {
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  }, []);

  const handleAddUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error(
        translate("admin.characters.references.url_required", "Paste an image URL first")
      );
      return;
    }

    const category: CharacterReferenceCategory = "additional";
    const nextRef: EditableRefImage = {
      localId: crypto.randomUUID(),
      url: trimmed,
      mimeType: "image/png",
      role: urlType,
      category,
      type: urlType,
      label: urlLabel.trim() || null,
      isPrimary: false,
      updatedAt: new Date().toISOString(),
    };
    setRefImages((prev) => {
      if (category === "additional") {
        return [...prev, nextRef];
      }
      const existingIndex = prev.findIndex(
        (ref) => ref.category === category && ref.type === urlType
      );
      if (existingIndex === -1) {
        return [...prev, nextRef];
      }
      return prev.map((ref, index) => (index === existingIndex ? nextRef : ref));
    });
    setUrlInput("");
    setUrlLabel("");
  }, [translate, urlInput, urlLabel, urlType]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const canonicalName = formState.canonicalName.trim();
      if (!canonicalName) {
        toast.error("Canonical name is required");
        return;
      }

      const aliases = normalizeAliases(formState.aliasesText);
      const lockedPrompt = formState.lockedPrompt.trim() || null;
      const negativePrompt = formState.negativePrompt.trim() || null;
      const gender = formState.gender.trim() || null;
      const height = formState.height.trim() || null;
      const weight = formState.weight.trim() || null;
      const enabled = formState.enabled;

      if (!hasFrontReference(refImages)) {
        toast.error(
          translate(
            "admin.characters.references.front_required",
            "A front-facing reference image is required before this person can be used for image generation."
          )
        );
        return;
      }

      const refPayload = refImages.map((ref) => ({
        imageId: ref.imageId ?? null,
        storageKey: ref.storageKey ?? null,
        url: ref.url ?? null,
        mimeType: ref.mimeType,
        role: ref.role ?? null,
        isPrimary: Boolean(ref.isPrimary),
        updatedAt: ref.updatedAt ?? new Date().toISOString(),
        category: ref.category ?? null,
        type: ref.type ?? null,
        label: ref.label ?? null,
      }));

      beginProgress();
      startTransition(() => {
        const action = editingCharacter
          ? updateCharacterAction({
              id: editingCharacter.id,
              canonicalName,
              aliases,
              refImages: refPayload,
              lockedPrompt,
              negativePrompt,
              gender,
              height,
              weight,
              enabled,
            })
          : createCharacterAction({
              canonicalName,
              aliases,
              refImages: refPayload,
              lockedPrompt,
              negativePrompt,
              gender,
              height,
              weight,
              enabled,
            });

        action
          .then((result) => {
            if (!result) {
              throw new Error("Character was not saved");
            }

            const serialized = serializeCharacter({
              ...result,
              createdAt:
                result.createdAt instanceof Date
                  ? result.createdAt.toISOString()
                  : String(result.createdAt),
              updatedAt:
                result.updatedAt instanceof Date
                  ? result.updatedAt.toISOString()
                  : String(result.updatedAt),
            });

            setCharactersState((prev) => {
              if (editingCharacter) {
                return prev.map((item) =>
                  item.id === editingCharacter.id ? serialized : item
                );
              }
              return [serialized, ...prev];
            });

            toast.success(
              editingCharacter ? "Character updated" : "Character created"
            );
            setSheetOpen(false);
          })
          .catch((error) => {
            toast.error(
              error instanceof Error ? error.message : "Unable to save character"
            );
          })
          .finally(() => finishProgress());
      });
    },
    [
      beginProgress,
      editingCharacter,
      finishProgress,
      formState,
      refImages,
      translate,
    ]
  );

  const handleDelete = useCallback(
    (characterId: string) => {
      if (!confirm("Delete this character? This cannot be undone.")) {
        return;
      }

      beginProgress();
      startTransition(() => {
        deleteCharacterAction({ id: characterId })
          .then(() => {
            setCharactersState((prev) =>
              prev.filter((item) => item.id !== characterId)
            );
            toast.success("Character deleted");
          })
          .catch((error) => {
            toast.error(
              error instanceof Error ? error.message : "Unable to delete"
            );
          })
          .finally(() => finishProgress());
      });
    },
    [beginProgress, finishProgress]
  );

  const openGallery = useCallback((character: SerializedCharacter) => {
    setGalleryCharacter(character);
    setGalleryOpen(true);
  }, []);

  const closeGallery = useCallback(() => {
    setGalleryOpen(false);
    setGalleryCharacter(null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        actions={
          <Button
            className="cursor-pointer"
            onClick={openCreateSheet}
            type="button"
          >
            <Plus className="size-4" />
            New character
          </Button>
        }
        description="Manage the people image generation can draw: names, aliases and reference photos."
        navHref="/admin/characters"
        title="Characters"
      />

      {charactersConfirmed ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <AdminStatCard
            hint="In the character library"
            icon={UserRound}
            label="Characters"
            value={stats.total.toLocaleString("en-IN")}
          />
          <AdminStatCard
            hint="Available to image generation"
            icon={UserRoundCheck}
            label="Enabled"
            value={stats.enabled.toLocaleString("en-IN")}
          />
          <AdminStatCard
            hint="Need a front face before use"
            icon={TriangleAlert}
            label="Missing front face"
            value={stats.missingFront.toLocaleString("en-IN")}
          />
        </section>
      ) : (
        <AdminNotice>
          Character rows could not be confirmed. The list is hidden instead of
          showing an empty fallback; refresh this section to retry.
        </AdminNotice>
      )}

      <AdminPanel
        description="Reference images are selected automatically from the stored set for each prompt."
        title="Character library"
      >
        <div className="flex flex-col gap-2 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search characters"
              className="pl-9"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name or alias"
              value={searchTerm}
            />
          </div>
          {charactersConfirmed ? (
            <span className="text-muted-foreground text-xs">
              {filteredCharacters.length.toLocaleString("en-IN")} of{" "}
              {charactersState.length.toLocaleString("en-IN")} characters
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium" scope="col">
                  Character
                </th>
                <th
                  className="hidden px-4 py-2.5 text-left font-medium md:table-cell"
                  scope="col"
                >
                  Aliases
                </th>
                <th
                  className="hidden px-4 py-2.5 text-left font-medium sm:table-cell"
                  scope="col"
                >
                  References
                </th>
                <th
                  className="hidden px-4 py-2.5 text-left font-medium sm:table-cell"
                  scope="col"
                >
                  Status
                </th>
                <th
                  className="hidden px-4 py-2.5 text-left font-medium lg:table-cell"
                  scope="col"
                >
                  Updated
                </th>
                <th className="px-4 py-2.5 text-right font-medium" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {!charactersConfirmed ? (
                <tr>
                  <td colSpan={6}>
                    <AdminEmptyState
                      description="Refresh this section to retry."
                      title="Unable to load characters"
                    />
                  </td>
                </tr>
              ) : filteredCharacters.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <AdminEmptyState
                      description={
                        searchTerm.trim()
                          ? "Try a different name or alias."
                          : "Add the first character to use it in image generation."
                      }
                      title={
                        searchTerm.trim()
                          ? "No characters match your search"
                          : "No characters yet"
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredCharacters.map((character) => {
                  const aliases =
                    character.aliases.length > 0
                      ? character.aliases.join(", ")
                      : null;
                  const missingFront = !hasFrontReference(character.refImages);
                  return (
                    <tr
                      className="align-middle transition hover:bg-muted/30"
                      key={character.id}
                    >
                      <td className="w-full max-w-0 px-4 py-3 sm:w-auto sm:max-w-[18rem]">
                        <div className="flex min-w-0 items-center gap-3">
                          <CharacterAvatar character={character} />
                          <div className="min-w-0">
                            <div className="break-words font-medium sm:truncate">
                              {character.canonicalName}
                            </div>
                            <div className="truncate text-muted-foreground text-xs md:hidden">
                              {aliases ?? "No aliases"}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs sm:hidden">
                              <CharacterStatusPill enabled={character.enabled} />
                              {character.refImages.length > 0 ? (
                                <button
                                  className="inline-flex cursor-pointer items-center gap-1 hover:text-primary hover:underline"
                                  onClick={() => openGallery(character)}
                                  type="button"
                                >
                                  <ImageIcon aria-hidden="true" className="size-3.5" />
                                  {character.refImages.length} refs
                                </button>
                              ) : (
                                <span>No refs</span>
                              )}
                              {missingFront ? (
                                <AdminStatusPill tone="warning">
                                  No front face
                                </AdminStatusPill>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden max-w-[22rem] px-4 py-3 md:table-cell">
                        <p className="line-clamp-2 text-muted-foreground text-xs">
                          {aliases ?? "—"}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <div className="flex flex-col items-start gap-1">
                          {character.refImages.length > 0 ? (
                            <button
                              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md text-sm hover:text-primary hover:underline"
                              onClick={() => openGallery(character)}
                              type="button"
                            >
                              <ImageIcon
                                aria-hidden="true"
                                className="size-4 text-muted-foreground"
                              />
                              {character.refImages.length}
                              <span className="sr-only">
                                reference images for {character.canonicalName}
                              </span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              None
                            </span>
                          )}
                          {missingFront ? (
                            <AdminStatusPill tone="warning">
                              No front face
                            </AdminStatusPill>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <CharacterStatusPill enabled={character.enabled} />
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground text-xs lg:table-cell">
                        <time dateTime={character.updatedAt} suppressHydrationWarning>
                          {formatDate(character.updatedAt)}
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            aria-label={`Edit ${character.canonicalName}`}
                            className="cursor-pointer"
                            onClick={() => openEditSheet(character)}
                            size="icon"
                            title="Edit"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            aria-label={`Delete ${character.canonicalName}`}
                            className="cursor-pointer text-destructive hover:text-destructive"
                            disabled={isPending}
                            onClick={() => handleDelete(character.id)}
                            size="icon"
                            title="Delete"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <Sheet onOpenChange={setSheetOpen} open={sheetOpen}>
        <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {editingCharacter ? "Edit character" : "New character"}
            </SheetTitle>
            <SheetDescription>
              Store aliases and reference images for injection when users request
              this character.
            </SheetDescription>
          </SheetHeader>

          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="canonicalName">Canonical name</Label>
                <Input
                  id="canonicalName"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      canonicalName: event.target.value,
                    }))
                  }
                  value={formState.canonicalName}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="aliases">Aliases</Label>
                <Textarea
                  id="aliases"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      aliasesText: event.target.value,
                    }))
                  }
                  placeholder="tirot sing, u tirot sing, tirot"
                  rows={3}
                  value={formState.aliasesText}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lockedPrompt">Locked prompt</Label>
                <Textarea
                  id="lockedPrompt"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      lockedPrompt: event.target.value,
                    }))
                  }
                  placeholder="historically accurate, avoid fantasy"
                  rows={3}
                  value={formState.lockedPrompt}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="negativePrompt">Negative prompt</Label>
                <Textarea
                  id="negativePrompt"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      negativePrompt: event.target.value,
                    }))
                  }
                  placeholder="no sci-fi armor, no guns"
                  rows={3}
                  value={formState.negativePrompt}
                />
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="font-medium text-sm">Physical traits</h3>
                <p className="text-muted-foreground text-xs">
                  These fields are injected into the prompt for more accurate
                  appearance.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Input
                      id="gender"
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          gender: event.target.value,
                        }))
                      }
                      placeholder="male, female, non-binary"
                      value={formState.gender}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          height: event.target.value,
                        }))
                      }
                      placeholder={"180 cm or 5'11\""}
                      value={formState.height}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="weight">Weight</Label>
                    <Input
                      id="weight"
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          weight: event.target.value,
                        }))
                      }
                      placeholder="75 kg"
                      value={formState.weight}
                    />
                  </div>
                </div>
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={formState.enabled}
                  className="cursor-pointer"
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      enabled: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Enabled
              </label>
            </div>

            <div className="border-t pt-6">
              <input
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleFileSelect}
                ref={fileInputRef}
                type="file"
              />
              <div>
                <h3 className="font-medium">
                  {translate("admin.characters.references.title", "Reference images")}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {translate(
                    "admin.characters.references.description",
                    "Add a front face first. Side angles and expressions improve matching when the prompt asks for them."
                  )}
                </p>
              </div>

              <div className="mt-4 grid gap-3">
                <h4 className="font-medium text-sm">
                  {translate(
                    "admin.characters.references.identity.title",
                    "Identity references"
                  )}
                </h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  {IDENTITY_REFERENCE_SLOTS.map((slot) => {
                    const ref = refImages.find(
                      (item) =>
                        item.category === "identity" && item.type === slot.type
                    );
                    return (
                      <div className="grid gap-2 rounded-lg border bg-background p-3" key={slot.type}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm">
                              {translate(
                                `admin.characters.references.type.${slot.type}`,
                                slot.label
                              )}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {translate(
                                `admin.characters.references.type.${slot.type}.helper`,
                                slot.helper
                              )}
                            </div>
                          </div>
                          <Badge variant={slot.required ? "default" : "outline"}>
                            {slot.required
                              ? translate(
                                  "admin.characters.references.required",
                                  "Required"
                                )
                              : translate(
                                  "admin.characters.references.optional",
                                  "Optional"
                                )}
                          </Badge>
                        </div>
                        {ref?.url && isOptimizedPreviewUrl(ref.url) ? (
                          <Image
                            alt={translate(
                              `admin.characters.references.type.${slot.type}`,
                              slot.label
                            )}
                            className="h-32 w-full rounded-md border object-cover"
                            height={128}
                            src={ref.url}
                            width={180}
                          />
                        ) : (
                          <div className="flex h-32 items-center justify-center rounded-md border text-xs text-muted-foreground">
                            {ref ? "External preview" : "No image selected"}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            className="cursor-pointer flex-1"
                            disabled={isUploading}
                            onClick={() =>
                              chooseUpload({
                                category: "identity",
                                type: slot.type,
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {ref
                              ? translate(
                                  "admin.characters.references.replace",
                                  "Replace"
                                )
                              : translate(
                                  "admin.characters.references.upload",
                                  "Upload"
                                )}
                          </Button>
                          {ref ? (
                            <Button
                              className="cursor-pointer"
                              onClick={() => removeRefImage(ref.localId)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {translate("admin.characters.references.delete", "Delete")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div>
                  <h4 className="font-medium text-sm">
                    {translate(
                      "admin.characters.references.expressions.title",
                      "Expression references"
                    )}
                  </h4>
                  <p className="text-muted-foreground text-xs">
                    {translate(
                      "admin.characters.references.expressions.description",
                      "Optional. Matching expressions are selected automatically when requested in the prompt."
                    )}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {EXPRESSION_REFERENCE_SLOTS.map((slot) => {
                    const ref = refImages.find(
                      (item) =>
                        item.category === "expression" && item.type === slot.type
                    );
                    return (
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-background p-3" key={slot.type}>
                        <div className="flex min-w-0 items-center gap-2">
                          {ref?.url && isOptimizedPreviewUrl(ref.url) ? (
                            <Image
                            alt={translate(
                              `admin.characters.references.type.${slot.type}`,
                              slot.label
                            )}
                              className="h-12 w-12 rounded-md border object-cover"
                              height={48}
                              src={ref.url}
                              width={48}
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-md border" />
                          )}
                          <span className="truncate text-sm">
                            {translate(
                              `admin.characters.references.type.${slot.type}`,
                              slot.label
                            )}
                          </span>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            className="cursor-pointer"
                            disabled={isUploading}
                            onClick={() =>
                              chooseUpload({
                                category: "expression",
                                type: slot.type,
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {ref
                              ? translate(
                                  "admin.characters.references.replace",
                                  "Replace"
                                )
                              : translate("admin.characters.references.add", "Add")}
                          </Button>
                          {ref ? (
                            <Button
                              className="cursor-pointer"
                              onClick={() => removeRefImage(ref.localId)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {translate("admin.characters.references.delete", "Delete")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div>
                  <h4 className="font-medium text-sm">
                    {translate(
                      "admin.characters.references.additional.title",
                      "Additional references"
                    )}
                  </h4>
                  <p className="text-muted-foreground text-xs">
                    {translate(
                      "admin.characters.references.additional.description",
                      "Store any extra view, outfit, lighting, or expression image. These are kept for future prompt-aware selection."
                    )}
                  </p>
                </div>
                <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_180px_1fr_auto]">
                  <Input
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder="Paste existing image URL"
                    value={urlInput}
                  />
                  <select
                    aria-label="Reference type"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    onChange={(event) =>
                      setUrlType(event.target.value as CharacterReferenceType)
                    }
                    value={urlType}
                  >
                    {ADDITIONAL_REFERENCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {translate(
                          `admin.characters.references.type.${type}`,
                          type
                        )}
                      </option>
                    ))}
                  </select>
                  <Input
                    onChange={(event) => setUrlLabel(event.target.value)}
                    placeholder="Optional label"
                    value={urlLabel}
                  />
                  <Button
                    className="cursor-pointer"
                    onClick={handleAddUrl}
                    type="button"
                    variant="secondary"
                  >
                    {translate("admin.characters.references.add_url", "Add URL")}
                  </Button>
                </div>
                <Button
                  className="w-fit cursor-pointer"
                  disabled={isUploading}
                  onClick={() =>
                    chooseUpload({ category: "additional", type: "other" })
                  }
                  type="button"
                  variant="outline"
                >
                  {isUploading
                    ? translate(
                        "admin.characters.references.uploading",
                        "Uploading..."
                      )
                    : translate(
                        "admin.characters.references.add_image",
                        "Add reference image"
                      )}
                </Button>
                {refImages.filter((ref) => ref.category === "additional").length > 0 ? (
                  <div className="grid gap-2">
                    {refImages
                      .filter((ref) => ref.category === "additional")
                      .map((ref) => (
                        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2" key={ref.localId}>
                          <div className="flex min-w-0 items-center gap-2">
                            {ref.url && isOptimizedPreviewUrl(ref.url) ? (
                              <Image
                                alt={ref.label || "Additional reference"}
                                className="h-12 w-12 rounded-md border object-cover"
                                height={48}
                                src={ref.url}
                                width={48}
                              />
                            ) : null}
                            <div className="min-w-0 text-xs">
                              <div className="font-medium">
                                {ref.label || ref.type || "Additional reference"}
                              </div>
                              <div className="truncate text-muted-foreground">
                                {ref.mimeType || "image/png"}
                              </div>
                            </div>
                          </div>
                          <Button
                            className="cursor-pointer"
                            onClick={() => removeRefImage(ref.localId)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {translate("admin.characters.references.delete", "Delete")}
                          </Button>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                className="cursor-pointer"
                onClick={() => setSheetOpen(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isPending || isUploading}
                type="submit"
              >
                {isPending
                  ? "Saving..."
                  : editingCharacter
                    ? "Save changes"
                    : "Create character"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog onOpenChange={(open) => (open ? null : closeGallery())} open={galleryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Reference gallery</DialogTitle>
            <DialogDescription>
              {galleryCharacter
                ? `Reference images for ${galleryCharacter.canonicalName}`
                : "Reference images"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {normalizeCharacterReferences(galleryCharacter?.refImages ?? []).map(
              (ref, index) => (
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-muted/10 p-3",
                  ref.isPrimary ? "border-primary/50" : "border-border"
                )}
                key={`${galleryCharacter?.id ?? "ref"}-${index}`}
              >
                {ref.url ? (
                  isOptimizedPreviewUrl(ref.url) ? (
                    <Image
                      alt={ref.role || "Reference image"}
                      className="h-40 w-full rounded-md border object-cover"
                      height={160}
                      src={ref.url}
                      width={240}
                    />
                  ) : (
                    <a
                      className="flex h-40 w-full items-center justify-center rounded-md border text-xs text-muted-foreground underline"
                      href={ref.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open external image
                    </a>
                  )
                ) : (
                  <div className="flex h-40 w-full items-center justify-center rounded-md border text-xs text-muted-foreground">
                    No preview available
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                    <div>{ref.label || ref.type || ref.role || "additional"}</div>
                  <div>{ref.mimeType || "image/png"}</div>
                  {ref.isPrimary ? (
                    <Badge className="mt-2" variant="default">
                      Primary
                    </Badge>
                  ) : null}
                </div>
              </div>
              )
            )}
            {galleryCharacter && galleryCharacter.refImages.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No reference images uploaded.
              </div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <DialogClose className="cursor-pointer" type="button">
              Close
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
