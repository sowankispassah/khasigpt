"use client";

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
import type { CharacterRefImage } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const MAX_REFS = 3;

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

type EditableRefImage = CharacterRefImage & {
  localId: string;
};

type CharacterFormState = {
  canonicalName: string;
  aliasesText: string;
  lockedPrompt: string;
  negativePrompt: string;
  gender: string;
  height: string;
  weight: string;
  complexion: string;
  priority: string;
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
  complexion: "",
  priority: "0",
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

function formatDate(value: string) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function buildEditableRefImages(refImages: CharacterRefImage[]) {
  return refImages.map((ref) => ({
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
}: {
  characters: SerializedCharacter[];
}) {
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
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryCharacter, setGalleryCharacter] =
    useState<SerializedCharacter | null>(null);

  useEffect(() => {
    setCharactersState(characters.map(serializeCharacter));
  }, [characters]);

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
      setTimeout(() => setProgress(38), 140),
      setTimeout(() => setProgress(62), 320),
      setTimeout(() => setProgress(86), 620),
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

  const openCreateSheet = useCallback(() => {
    setEditingCharacter(null);
    setFormState(DEFAULT_FORM);
    setRefImages([]);
    setUrlInput("");
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
      complexion: character.complexion ?? "",
      priority: character.priority.toString(),
      enabled: character.enabled,
    });
    setRefImages(buildEditableRefImages(character.refImages ?? []));
    setUrlInput("");
    setSheetOpen(true);
  }, []);

  const updateRefImage = useCallback(
    (id: string, patch: Partial<EditableRefImage>) => {
      setRefImages((prev) =>
        prev.map((ref) => (ref.localId === id ? { ...ref, ...patch } : ref))
      );
    },
    []
  );

  const removeRefImage = useCallback((id: string) => {
    setRefImages((prev) => prev.filter((ref) => ref.localId !== id));
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
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
        setRefImages((prev) => [
          ...prev,
          {
            localId: crypto.randomUUID(),
            url,
            mimeType: file.type || data.contentType || "image/png",
            role: "",
            isPrimary: false,
            updatedAt: now,
          },
        ]);
        toast.success("Reference image added");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        finishProgress();
        setIsUploading(false);
      }
    },
    [beginProgress, finishProgress]
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? [];
      if (file) {
        void handleUpload(file);
      }
      if (event.target) {
        event.target.value = "";
      }
    },
    [handleUpload]
  );

  const handleAddUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error("Paste an image URL first");
      return;
    }

    setRefImages((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        url: trimmed,
        mimeType: "image/png",
        role: "",
        isPrimary: false,
        updatedAt: new Date().toISOString(),
      },
    ]);
    setUrlInput("");
  }, [urlInput]);

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
      const complexion = formState.complexion.trim() || null;
      const priority = Number(formState.priority || 0);
      const enabled = formState.enabled;

      const refPayload = refImages.map((ref) => ({
        imageId: ref.imageId ?? null,
        storageKey: ref.storageKey ?? null,
        url: ref.url ?? null,
        mimeType: ref.mimeType,
        role: ref.role ?? null,
        isPrimary: Boolean(ref.isPrimary),
        updatedAt: ref.updatedAt ?? new Date().toISOString(),
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
              complexion,
              priority,
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
              complexion,
              priority,
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
      startTransition,
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
    [beginProgress, finishProgress, startTransition]
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
          <h1 className="font-semibold text-2xl">Characters</h1>
          <p className="text-muted-foreground text-sm">
            Manage aliases and reference images for character injection.
          </p>
        </div>
        <Button
          className="cursor-pointer"
          onClick={openCreateSheet}
          type="button"
        >
          New character
        </Button>
      </header>

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name or alias"
            value={searchTerm}
          />
          <span className="text-muted-foreground text-xs">
            Attach up to {MAX_REFS} primary reference images per character.
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Character</th>
                <th className="px-3 py-3 text-left font-medium">Aliases</th>
                <th className="px-3 py-3 text-left font-medium">Refs</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Updated</th>
                <th className="px-3 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCharacters.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No characters yet.
                  </td>
                </tr>
              ) : (
                filteredCharacters.map((character) => (
                  <tr
                    className="border-b last:border-b-0"
                    key={character.id}
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {character.canonicalName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Priority {character.priority}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {character.aliases.length > 0
                        ? character.aliases.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {character.refImages.length > 0 ? (
                        <Button
                          className="cursor-pointer"
                          onClick={() => openGallery(character)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {character.refImages.length}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={character.enabled ? "default" : "outline"}>
                        {character.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {formatDate(character.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="cursor-pointer"
                          onClick={() => openEditSheet(character)}
                          size="sm"
                          variant="outline"
                        >
                          Edit
                        </Button>
                        <Button
                          className="cursor-pointer"
                          onClick={() => handleDelete(character.id)}
                          size="sm"
                          variant="destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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

              <div className="rounded-lg border bg-muted/20 p-4">
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
                    <Label htmlFor="complexion">Skin tone / complexion</Label>
                    <Input
                      id="complexion"
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          complexion: event.target.value,
                        }))
                      }
                      placeholder="fair, medium brown, dark"
                      value={formState.complexion}
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Input
                    id="priority"
                    inputMode="numeric"
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        priority: event.target.value,
                      }))
                    }
                    type="number"
                    value={formState.priority}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
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
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-medium">Reference images</h3>
                  <p className="text-muted-foreground text-xs">
                    Only primary images are injected; selection caps at {MAX_REFS}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleFileSelect}
                    ref={fileInputRef}
                    type="file"
                  />
                  <Button
                    className="cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isUploading ? "Uploading..." : "Upload image"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[240px]"
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="Paste existing image URL"
                  value={urlInput}
                />
                <Button
                  className="cursor-pointer"
                  onClick={handleAddUrl}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Add URL
                </Button>
              </div>

              <div className="mt-4 grid gap-4">
                {refImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No reference images yet.
                  </p>
                ) : (
                  refImages.map((ref) => (
                    <div
                      className={cn(
                        "flex flex-col gap-3 rounded-lg border bg-background p-3",
                        ref.isPrimary ? "border-primary/50" : "border-border"
                      )}
                      key={ref.localId}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {ref.url ? (
                            isOptimizedPreviewUrl(ref.url) ? (
                              <Image
                                alt={ref.role || "Reference image"}
                                className="rounded-md border"
                                height={64}
                                src={ref.url}
                                width={64}
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-md border text-[10px] text-muted-foreground">
                                <span className="text-center leading-tight">
                                  External preview blocked
                                </span>
                              </div>
                            )
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-md border text-xs text-muted-foreground">
                              No preview
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            <div>{ref.mimeType}</div>
                            <div className="line-clamp-2 max-w-xs">
                              {ref.url ?? ref.storageKey ?? ref.imageId ?? ""}
                            </div>
                          </div>
                        </div>
                        <Button
                          className="cursor-pointer"
                          onClick={() => removeRefImage(ref.localId)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="grid gap-1">
                          <Label className="text-xs">Role</Label>
                          <Input
                            onChange={(event) =>
                              updateRefImage(ref.localId, {
                                role: event.target.value,
                              })
                            }
                            placeholder="face"
                            value={ref.role ?? ""}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Mime type</Label>
                          <Input readOnly value={ref.mimeType || "image/png"} />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={Boolean(ref.isPrimary)}
                            className="cursor-pointer"
                            onChange={(event) =>
                              updateRefImage(ref.localId, {
                                isPrimary: event.target.checked,
                              })
                            }
                            type="checkbox"
                          />
                          Primary reference
                        </label>
                      </div>
                    </div>
                  ))
                )}
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
                disabled={isPending}
                type="submit"
              >
                {editingCharacter ? "Save changes" : "Create character"}
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
            {(galleryCharacter?.refImages ?? []).map((ref, index) => (
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
                  <div>{ref.role || "no role"}</div>
                  <div>{ref.mimeType || "image/png"}</div>
                  {ref.isPrimary ? (
                    <Badge className="mt-2" variant="default">
                      Primary
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
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
