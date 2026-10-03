"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TranslationEditorTarget = {
  defaultText: string;
  description?: string;
  key: string;
};

type TranslationEditContextValue = {
  enabled: boolean;
  isAdmin: boolean;
  openEditor: (target: TranslationEditorTarget) => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
};

const TranslationEditContext = createContext<TranslationEditContextValue>({
  enabled: false,
  isAdmin: false,
  openEditor: () => {
    // default noop
  },
  setEnabled: () => {
    // default noop
  },
  toggleEnabled: () => {
    // default noop
  },
});

const STORAGE_KEY = "khasigpt:translation-edit-mode";

export function TranslationEditProvider({
  children,
  isAdmin,
}: PropsWithChildren<{ isAdmin: boolean }>) {
  const {
    activeLanguage,
    translate,
    upsertLocalTranslation,
  } = useTranslation();
  const [enabled, setEnabledState] = useState(false);
  const [target, setTarget] = useState<TranslationEditorTarget | null>(null);
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") {
      return;
    }
    setEnabledState(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, [isAdmin]);

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      if (!isAdmin) {
        setEnabledState(false);
        return;
      }
      setEnabledState(nextEnabled);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, nextEnabled ? "1" : "0");
      }
    },
    [isAdmin]
  );

  const toggleEnabled = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  const openEditor = useCallback(
    (nextTarget: TranslationEditorTarget) => {
      if (!isAdmin || !enabled) {
        return;
      }
      setTarget(nextTarget);
      setValue(translate(nextTarget.key, nextTarget.defaultText));
    },
    [enabled, isAdmin, translate]
  );

  const closeEditor = useCallback(() => {
    if (isSaving) {
      return;
    }
    setTarget(null);
    setValue("");
  }, [isSaving]);

  const saveTranslation = useCallback(
    async (nextValue: string) => {
      if (!target) {
        return;
      }
      if (activeLanguage.isDefault) {
        toast.error(
          translate(
            "translation_edit.default_language_locked",
            "Inline edit saves translated values only. Edit English source text from Admin Translations."
          )
        );
        return;
      }

      setIsSaving(true);
      try {
        const response = await fetch("/api/admin/translations/inline", {
          body: JSON.stringify({
            defaultText: target.defaultText,
            description: target.description,
            key: target.key,
            languageCode: activeLanguage.code,
            source: "web",
            value: nextValue,
          }),
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "PATCH",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              key?: string;
              ok?: boolean;
              text?: string;
              value?: string;
            }
          | null;

        if (!response.ok || !payload?.ok || !payload.key) {
          throw new Error(payload?.error ?? "Unable to save translation.");
        }

        upsertLocalTranslation(payload.key, payload.text ?? target.defaultText);
        toast.success(
          nextValue.trim()
            ? translate("translation_edit.saved", "Translation saved")
            : translate("translation_edit.cleared", "Translation cleared")
        );
        setTarget(null);
        setValue("");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate("translation_edit.save_failed", "Unable to save translation.")
        );
      } finally {
        setIsSaving(false);
      }
    },
    [activeLanguage, target, translate, upsertLocalTranslation]
  );

  const contextValue = useMemo<TranslationEditContextValue>(
    () => ({
      enabled: isAdmin && enabled,
      isAdmin,
      openEditor,
      setEnabled,
      toggleEnabled,
    }),
    [enabled, isAdmin, openEditor, setEnabled, toggleEnabled]
  );

  return (
    <TranslationEditContext.Provider value={contextValue}>
      {children}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeEditor();
          }
        }}
        open={Boolean(target)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {translate("translation_edit.modal.title", "Edit translation")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "translation_edit.modal.description",
                "Save translated UI text for the selected language."
              )}
            </DialogDescription>
          </DialogHeader>
          {target ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="font-medium text-foreground">{target.key}</div>
                <div className="mt-2 text-muted-foreground">
                  {translate("translation_edit.source_label", "English source")}
                </div>
                <div className="mt-1 text-foreground">{target.defaultText}</div>
                <div className="mt-2 text-muted-foreground">
                  {translate("translation_edit.language_label", "Language")}:{" "}
                  {activeLanguage.name}
                </div>
              </div>
              <Textarea
                aria-label={translate(
                  "translation_edit.value_label",
                  "Translated value"
                )}
                disabled={isSaving || activeLanguage.isDefault}
                onChange={(event) => setValue(event.target.value)}
                value={value}
              />
              {activeLanguage.isDefault ? (
                <p className="text-muted-foreground text-xs">
                  {translate(
                    "translation_edit.default_language_locked",
                    "Inline edit saves translated values only. Edit English source text from Admin Translations."
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              disabled={isSaving}
              onClick={closeEditor}
              type="button"
              variant="outline"
            >
              {translate("common.cancel", "Cancel")}
            </Button>
            <Button
              disabled={isSaving || activeLanguage.isDefault}
              onClick={() => saveTranslation("")}
              type="button"
              variant="outline"
            >
              {translate("common.clear", "Clear")}
            </Button>
            <Button
              disabled={isSaving || activeLanguage.isDefault}
              onClick={() => saveTranslation(value)}
              type="button"
            >
              {isSaving
                ? translate("translation_edit.saving", "Saving...")
                : translate("translation_edit.save", "Save translation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TranslationEditContext.Provider>
  );
}

export function useTranslationEdit() {
  return useContext(TranslationEditContext);
}

type EditableTranslationProps = {
  asChild?: false;
  className?: string;
  defaultText: string;
  description?: string;
  translationKey: string;
  values?: Record<string, string | number>;
};

function interpolateTranslation(
  template: string,
  values?: Record<string, string | number>
) {
  if (!values) {
    return template;
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.hasOwn(values, key)
      ? String(values[key])
      : match
  );
}

export function EditableTranslation({
  className,
  defaultText,
  description,
  translationKey,
  values,
}: EditableTranslationProps) {
  const { translate } = useTranslation();
  const { enabled, isAdmin, openEditor } = useTranslationEdit();
  const text = interpolateTranslation(
    translate(translationKey, defaultText),
    values
  );

  if (!isAdmin || !enabled) {
    return <>{text}</>;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Editable text may be rendered inside buttons/links, so it cannot always be a native button.
    <span
      className={cn(
        "cursor-pointer rounded-sm outline outline-1 outline-dashed outline-amber-500/70 outline-offset-2 hover:bg-amber-100/40",
        className
      )}
      data-translation-key={translationKey}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor({ defaultText, description, key: translationKey });
      }}
      role="button"
      tabIndex={0}
      title={translationKey}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openEditor({ defaultText, description, key: translationKey });
        }
      }}
    >
      {text}
    </span>
  );
}

export function useEditableTranslation(
  translationKey: string,
  defaultText: string,
  description?: string
) {
  const { translate } = useTranslation();
  const { enabled, isAdmin, openEditor } = useTranslationEdit();
  const text = translate(translationKey, defaultText);

  return {
    editButton:
      isAdmin && enabled ? (
        <button
          className="ml-2 cursor-pointer rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] text-amber-700"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openEditor({ defaultText, description, key: translationKey });
          }}
          type="button"
        >
          {translate("translation_edit.edit_short", "Edit")}
        </button>
      ) : null,
    text,
  };
}
