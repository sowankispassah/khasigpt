"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  IconPromptBehavior,
  IconPromptItem,
} from "@/lib/icon-prompts";
import type { LanguageOption } from "@/lib/i18n/languages";

type IconPromptSettingsFormProps = {
  initialItems: IconPromptItem[];
  languages: LanguageOption[];
  onSubmit: (formData: FormData) => Promise<
    | {
        success: true;
        count: number;
      }
    | undefined
  >;
};

type EditableItem = {
  id: string;
  label: string;
  prompt: string;
  iconUrl: string | null;
  isActive: boolean;
  behavior: IconPromptBehavior;
  selectImageMode: boolean;
  showSuggestions: boolean;
  suggestions: string[];
  suggestionPrompts: string[];
  suggestionEditable: boolean[];
  labelByLanguage: Record<string, string>;
  promptByLanguage: Record<string, string>;
  suggestionsByLanguage: Record<string, string[]>;
  suggestionPromptsByLanguage: Record<string, string[]>;
  suggestionEditableByLanguage: Record<string, boolean[]>;
};

const DEFAULT_BEHAVIOR: IconPromptBehavior = "replace";

function createEmptyItem(defaultLabel = "", defaultPrompt = ""): EditableItem {
  return {
    id: crypto.randomUUID(),
    label: defaultLabel,
    prompt: defaultPrompt,
    iconUrl: null,
    isActive: true,
    behavior: DEFAULT_BEHAVIOR,
    selectImageMode: false,
    showSuggestions: false,
    suggestions: [],
    suggestionPrompts: [],
    suggestionEditable: [],
    labelByLanguage: {},
    promptByLanguage: {},
    suggestionsByLanguage: {},
    suggestionPromptsByLanguage: {},
    suggestionEditableByLanguage: {},
  };
}

function normalizeItems(items: IconPromptItem[]): EditableItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    prompt: item.prompt,
    iconUrl: item.iconUrl ?? null,
    isActive: item.isActive,
    behavior: item.behavior,
    selectImageMode: item.selectImageMode,
    showSuggestions: item.showSuggestions,
    suggestions: item.suggestions ?? [],
    suggestionPrompts: item.suggestionPrompts ?? [],
    suggestionEditable: item.suggestionEditable ?? [],
    labelByLanguage: item.labelByLanguage ?? {},
    promptByLanguage: item.promptByLanguage ?? {},
    suggestionsByLanguage: item.suggestionsByLanguage ?? {},
    suggestionPromptsByLanguage: item.suggestionPromptsByLanguage ?? {},
    suggestionEditableByLanguage: item.suggestionEditableByLanguage ?? {},
  }));
}

function isValidIconUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function IconPromptSettingsForm({
  initialItems,
  languages,
  onSubmit,
}: IconPromptSettingsFormProps) {
  const router = useRouter();
  const [items, setItems] = useState<EditableItem[]>(
    normalizeItems(initialItems)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const defaultLanguage =
    languages.find((language) => language.isDefault) ?? languages[0] ?? null;
  const localizedLanguages = languages.filter((language) => !language.isDefault);

  const payload = useMemo(() => {
    const sanitizeSuggestionPairs = (
      suggestions: string[],
      hidden: string[],
      editable: boolean[]
    ) => {
      const pairs = suggestions.map((label, index) => ({
        label: label.trim(),
        hidden: (hidden[index] ?? "").trim(),
        editable: Boolean(editable[index]),
      }));
      const filtered = pairs.filter((pair) => pair.label.length > 0);
      return {
        suggestions: filtered.map((pair) => pair.label),
        suggestionPrompts: filtered.map((pair) => pair.hidden),
        suggestionEditable: filtered.map((pair) => pair.editable),
      };
    };

    return JSON.stringify({
      items: items.map((item) => {
        const sanitized = sanitizeSuggestionPairs(
          item.suggestions,
          item.suggestionPrompts,
          item.suggestionEditable
        );
        const suggestionPayloadByLanguage: Record<string, string[]> = {};
        const hiddenPayloadByLanguage: Record<string, string[]> = {};
        const editablePayloadByLanguage: Record<string, boolean[]> = {};

        for (const [code, values] of Object.entries(
          item.suggestionsByLanguage
        )) {
          const hidden = item.suggestionPromptsByLanguage[code] ?? [];
          const editable = item.suggestionEditableByLanguage[code] ?? [];
          const localized = sanitizeSuggestionPairs(values, hidden, editable);
          if (localized.suggestions.length > 0) {
            suggestionPayloadByLanguage[code] = localized.suggestions;
            hiddenPayloadByLanguage[code] = localized.suggestionPrompts;
            editablePayloadByLanguage[code] = localized.suggestionEditable;
          }
        }

        return {
          id: item.id,
          label: item.label,
          prompt: item.prompt,
          iconUrl: item.iconUrl,
          isActive: item.isActive,
          behavior: item.behavior,
          selectImageMode: item.selectImageMode,
          showSuggestions: item.showSuggestions,
          suggestions: sanitized.suggestions,
          suggestionPrompts: sanitized.suggestionPrompts,
          suggestionEditable: sanitized.suggestionEditable,
          labelByLanguage: item.labelByLanguage,
          promptByLanguage: item.promptByLanguage,
          suggestionsByLanguage: suggestionPayloadByLanguage,
          suggestionPromptsByLanguage: hiddenPayloadByLanguage,
          suggestionEditableByLanguage: editablePayloadByLanguage,
        };
      }),
    });
  }, [items]);

  const updateItem = (id: string, patch: Partial<EditableItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateSuggestionLine = (
    id: string,
    index: number,
    patch: { label?: string; hidden?: string; editable?: boolean }
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextSuggestions = [...item.suggestions];
        const nextHidden = [...item.suggestionPrompts];
        const nextEditable = [...item.suggestionEditable];
        while (nextSuggestions.length <= index) {
          nextSuggestions.push("");
        }
        while (nextHidden.length <= index) {
          nextHidden.push("");
        }
        while (nextEditable.length <= index) {
          nextEditable.push(false);
        }
        if (patch.label !== undefined) {
          nextSuggestions[index] = patch.label;
        }
        if (patch.hidden !== undefined) {
          nextHidden[index] = patch.hidden;
        }
        if (patch.editable !== undefined) {
          nextEditable[index] = patch.editable;
        }
        return {
          ...item,
          suggestions: nextSuggestions,
          suggestionPrompts: nextHidden,
          suggestionEditable: nextEditable,
        };
      })
    );
  };

  const addSuggestionLine = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              suggestions: [...item.suggestions, ""],
              suggestionPrompts: [...item.suggestionPrompts, ""],
              suggestionEditable: [...item.suggestionEditable, false],
            }
          : item
      )
    );
  };

  const removeSuggestionLine = (id: string, index: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return {
          ...item,
          suggestions: item.suggestions.filter((_, i) => i !== index),
          suggestionPrompts: item.suggestionPrompts.filter((_, i) => i !== index),
          suggestionEditable: item.suggestionEditable.filter((_, i) => i !== index),
        };
      })
    );
  };

  const updateLocalizedSuggestionLine = (
    id: string,
    languageCode: string,
    index: number,
    patch: { label?: string; hidden?: string; editable?: boolean }
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextSuggestions = [
          ...(item.suggestionsByLanguage[languageCode] ?? []),
        ];
        const nextHidden = [
          ...(item.suggestionPromptsByLanguage[languageCode] ?? []),
        ];
        const nextEditable = [
          ...(item.suggestionEditableByLanguage[languageCode] ?? []),
        ];
        while (nextSuggestions.length <= index) {
          nextSuggestions.push("");
        }
        while (nextHidden.length <= index) {
          nextHidden.push("");
        }
        while (nextEditable.length <= index) {
          nextEditable.push(false);
        }
        if (patch.label !== undefined) {
          nextSuggestions[index] = patch.label;
        }
        if (patch.hidden !== undefined) {
          nextHidden[index] = patch.hidden;
        }
        if (patch.editable !== undefined) {
          nextEditable[index] = patch.editable;
        }
        return {
          ...item,
          suggestionsByLanguage: {
            ...item.suggestionsByLanguage,
            [languageCode]: nextSuggestions,
          },
          suggestionPromptsByLanguage: {
            ...item.suggestionPromptsByLanguage,
            [languageCode]: nextHidden,
          },
          suggestionEditableByLanguage: {
            ...item.suggestionEditableByLanguage,
            [languageCode]: nextEditable,
          },
        };
      })
    );
  };

  const addLocalizedSuggestionLine = (id: string, languageCode: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextSuggestions = [
          ...(item.suggestionsByLanguage[languageCode] ?? []),
          "",
        ];
        const nextHidden = [
          ...(item.suggestionPromptsByLanguage[languageCode] ?? []),
          "",
        ];
        const nextEditable = [
          ...(item.suggestionEditableByLanguage[languageCode] ?? []),
          false,
        ];
        return {
          ...item,
          suggestionsByLanguage: {
            ...item.suggestionsByLanguage,
            [languageCode]: nextSuggestions,
          },
          suggestionPromptsByLanguage: {
            ...item.suggestionPromptsByLanguage,
            [languageCode]: nextHidden,
          },
          suggestionEditableByLanguage: {
            ...item.suggestionEditableByLanguage,
            [languageCode]: nextEditable,
          },
        };
      })
    );
  };

  const removeLocalizedSuggestionLine = (
    id: string,
    languageCode: string,
    index: number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const nextSuggestions = (
          item.suggestionsByLanguage[languageCode] ?? []
        ).filter((_, i) => i !== index);
        const nextHidden = (
          item.suggestionPromptsByLanguage[languageCode] ?? []
        ).filter((_, i) => i !== index);
        const nextEditable = (
          item.suggestionEditableByLanguage[languageCode] ?? []
        ).filter((_, i) => i !== index);
        return {
          ...item,
          suggestionsByLanguage: {
            ...item.suggestionsByLanguage,
            [languageCode]: nextSuggestions,
          },
          suggestionPromptsByLanguage: {
            ...item.suggestionPromptsByLanguage,
            [languageCode]: nextHidden,
          },
          suggestionEditableByLanguage: {
            ...item.suggestionEditableByLanguage,
            [languageCode]: nextEditable,
          },
        };
      })
    );
  };

  const handleUpload = async (file: File, id: string) => {
    setUploadingId(id);
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
      };

      const url = data.url ?? data.downloadUrl ?? data.pathname;
      if (!url) {
        throw new Error("Upload did not return a URL");
      }

      updateItem(id, { iconUrl: url });
      toast({
        type: "success",
        description: "Icon uploaded.",
      });
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setUploadingId(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    (async () => {
      try {
        const formData = new FormData();
        formData.set("payload", payload);
        const result = await onSubmit(formData);
        if (result?.success) {
          toast({
            type: "success",
            description: `Saved ${result.count} icon prompt${
              result.count === 1 ? "" : "s"
            }.`,
          });
        }
        router.refresh();
      } catch (error) {
        console.error("Failed to save icon prompts", error);
        toast({
          type: "error",
          description: "Failed to save icon prompts.",
        });
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Configure icon prompts for the home screen. Icons must be JPEG or PNG.
        </div>
        <Button
          className="cursor-pointer"
          onClick={() => setItems((prev) => [...prev, createEmptyItem()])}
          type="button"
          variant="outline"
        >
          Add icon prompt
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
          No icon prompts configured yet. Add one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item, index) => (
            <div
              className="rounded-lg border bg-background p-4"
              key={item.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-sm">
                  Icon prompt {index + 1}
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      checked={item.isActive}
                      className="cursor-pointer"
                      onChange={(event) =>
                        updateItem(item.id, { isActive: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      checked={item.selectImageMode}
                      className="cursor-pointer"
                      onChange={(event) =>
                        updateItem(item.id, {
                          selectImageMode: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    Select image mode
                  </label>
                  <Button
                    className="cursor-pointer"
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter((entry) => entry.id !== item.id)
                      )
                    }
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="font-medium text-sm">Default label</label>
                  <Input
                    onChange={(event) =>
                      updateItem(item.id, { label: event.target.value })
                    }
                    placeholder="Create image"
                    value={item.label}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-medium text-sm">
                    Default prompt (optional)
                  </label>
                  <Textarea
                    className="min-h-[96px]"
                    onChange={(event) =>
                      updateItem(item.id, { prompt: event.target.value })
                    }
                    placeholder="Describe a prompt to insert"
                    value={item.prompt}
                  />
                  <p className="text-muted-foreground text-xs">
                    Used when suggestions are disabled or empty.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="font-medium text-sm">Icon</label>
                  <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/30">
                      {isValidIconUrl(item.iconUrl) ? (
                        <Image
                          alt=""
                          height={24}
                          src={item.iconUrl}
                          width={24}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer">
                        <input
                          accept="image/png,image/jpeg"
                          className="hidden"
                          disabled={uploadingId === item.id}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleUpload(file, item.id);
                            }
                            event.target.value = "";
                          }}
                          type="file"
                        />
                        <span className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs transition hover:bg-muted">
                          {uploadingId === item.id ? "Uploading..." : "Upload"}
                        </span>
                      </label>
                      {item.iconUrl ? (
                        <Button
                          className="cursor-pointer"
                          onClick={() => updateItem(item.id, { iconUrl: null })}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-medium text-sm">Insert behavior</label>
                  <select
                    className="w-full cursor-pointer rounded-md border bg-background px-3 py-2 text-sm"
                    onChange={(event) =>
                      updateItem(item.id, {
                        behavior: event.target.value as IconPromptBehavior,
                      })
                    }
                    value={item.behavior}
                  >
                    <option value="replace">Replace input</option>
                    <option value="append">Append to input</option>
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Choose whether this prompt replaces the current input or
                    appends to it.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    checked={item.showSuggestions}
                    className="cursor-pointer"
                    onChange={(event) =>
                      updateItem(item.id, {
                        showSuggestions: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Show suggestions list
                </label>
                {item.showSuggestions ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Visible suggestions
                      </label>
                      <div className="grid gap-2">
                        {item.suggestions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No suggestions added yet.
                          </p>
                        ) : null}
                        {item.suggestions.map((suggestion, index) => (
                          <div
                            className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                            key={`suggestion-${item.id}-${index}`}
                          >
                            <Input
                              onChange={(event) =>
                                updateSuggestionLine(item.id, index, {
                                  label: event.target.value,
                                })
                              }
                              placeholder={`Suggestion ${index + 1}`}
                              value={suggestion}
                            />
                            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                              <input
                                checked={item.suggestionEditable[index] ?? false}
                                className="cursor-pointer"
                                onChange={(event) =>
                                  updateSuggestionLine(item.id, index, {
                                    editable: event.target.checked,
                                  })
                                }
                                type="checkbox"
                              />
                              Editable
                            </label>
                            <Button
                              className="cursor-pointer"
                              onClick={() =>
                                removeSuggestionLine(item.id, index)
                              }
                              type="button"
                              variant="ghost"
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        <Button
                          className="cursor-pointer"
                          onClick={() => addSuggestionLine(item.id)}
                          type="button"
                          variant="outline"
                        >
                          Add suggestion
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Hidden prompts (optional)
                      </label>
                      <div className="grid gap-2">
                        {item.suggestions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Hidden prompts will appear once suggestions are
                            added.
                          </p>
                        ) : null}
                        {item.suggestions.map((_, index) => (
                          <div
                            className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
                            key={`hidden-${item.id}-${index}`}
                          >
                            <Input
                              onChange={(event) =>
                                updateSuggestionLine(item.id, index, {
                                  hidden: event.target.value,
                                })
                              }
                              placeholder={`Hidden prompt ${index + 1}`}
                              value={item.suggestionPrompts[index] ?? ""}
                            />
                            <span className="text-xs text-muted-foreground">
                              {index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-muted-foreground text-xs md:col-span-2">
                      Hidden prompts map line-by-line to visible suggestions and
                      fall back to the visible text when left blank.
                    </p>
                  </div>
                ) : null}
              </div>

              {localizedLanguages.length > 0 ? (
                <div className="mt-5 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Localized prompts
                  </div>
                  <div className="grid gap-4">
                    {localizedLanguages.map((language) => (
                      <div
                        className="rounded-md border border-muted-foreground/20 bg-muted/20 p-3"
                        key={language.id}
                      >
                        <div className="mb-3 text-xs font-semibold text-muted-foreground">
                          {language.name}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-medium">
                              Label ({language.code})
                            </label>
                            <Input
                              onChange={(event) =>
                                updateItem(item.id, {
                                  labelByLanguage: {
                                    ...item.labelByLanguage,
                                    [language.code]: event.target.value,
                                  },
                                })
                              }
                              placeholder={`Localized label for ${language.name}`}
                              value={item.labelByLanguage[language.code] ?? ""}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium">
                              Prompt ({language.code})
                            </label>
                            <Textarea
                              className="min-h-[80px]"
                              onChange={(event) =>
                                updateItem(item.id, {
                                  promptByLanguage: {
                                    ...item.promptByLanguage,
                                    [language.code]: event.target.value,
                                  },
                                })
                              }
                              placeholder={`Localized prompt for ${language.name}`}
                              value={item.promptByLanguage[language.code] ?? ""}
                            />
                          </div>
                        </div>
                        {item.showSuggestions ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs font-medium">
                                Suggestions ({language.code})
                              </label>
                              <div className="grid gap-2">
                                {(item.suggestionsByLanguage[language.code] ??
                                  []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No suggestions added yet.
                                  </p>
                                ) : null}
                                {(item.suggestionsByLanguage[language.code] ??
                                  []).map((suggestion, index) => (
                                  <div
                                    className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                                    key={`suggestion-${item.id}-${language.code}-${index}`}
                                  >
                                    <Input
                                      onChange={(event) =>
                                        updateLocalizedSuggestionLine(
                                          item.id,
                                          language.code,
                                          index,
                                          { label: event.target.value }
                                        )
                                      }
                                      placeholder={`Suggestion ${index + 1}`}
                                      value={suggestion}
                                    />
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                                      <input
                                        checked={
                                          item.suggestionEditableByLanguage[
                                            language.code
                                          ]?.[index] ?? false
                                        }
                                        className="cursor-pointer"
                                        onChange={(event) =>
                                          updateLocalizedSuggestionLine(
                                            item.id,
                                            language.code,
                                            index,
                                            { editable: event.target.checked }
                                          )
                                        }
                                        type="checkbox"
                                      />
                                      Editable
                                    </label>
                                    <Button
                                      className="cursor-pointer"
                                      onClick={() =>
                                        removeLocalizedSuggestionLine(
                                          item.id,
                                          language.code,
                                          index
                                        )
                                      }
                                      type="button"
                                      variant="ghost"
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  className="cursor-pointer"
                                  onClick={() =>
                                    addLocalizedSuggestionLine(
                                      item.id,
                                      language.code
                                    )
                                  }
                                  type="button"
                                  variant="outline"
                                >
                                  Add suggestion
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium">
                                Hidden prompts ({language.code})
                              </label>
                              <div className="grid gap-2">
                                {(item.suggestionsByLanguage[language.code] ??
                                  []).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Hidden prompts will appear once suggestions
                                    are added.
                                  </p>
                                ) : null}
                                {(item.suggestionsByLanguage[language.code] ??
                                  []).map((_, index) => (
                                  <div
                                    className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
                                    key={`hidden-${item.id}-${language.code}-${index}`}
                                  >
                                    <Input
                                      onChange={(event) =>
                                        updateLocalizedSuggestionLine(
                                          item.id,
                                          language.code,
                                          index,
                                          { hidden: event.target.value }
                                        )
                                      }
                                      placeholder={`Hidden prompt ${index + 1}`}
                                      value={
                                        item.suggestionPromptsByLanguage[
                                          language.code
                                        ]?.[index] ?? ""
                                      }
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {index + 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {defaultLanguage ? (
                    <p className="text-muted-foreground text-xs">
                      If a localized prompt is empty, {defaultLanguage.name} is
                      used as the fallback.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          className="cursor-pointer"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save icon prompts"}
        </Button>
      </div>
    </form>
  );
}
