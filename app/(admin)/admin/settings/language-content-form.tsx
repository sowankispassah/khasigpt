"use client";

import { useEffect, useState } from "react";

import type { LanguageOption } from "@/lib/i18n/languages";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";

type LanguageContentFormProps = {
  language: LanguageOption;
  initialContent: string;
  onSubmit: (formData: FormData) => Promise<
    | {
        success: true;
        languageCode: string;
      }
    | void
  >;
  contentLabel?: string;
  placeholders?: {
    default?: string;
    localized?: string;
  };
  helperText?: {
    default?: string;
    localized?: string;
  };
  buttonLabel?: string;
  successMessage?: string;
  toastMessage?: string;
  savingLabel?: string;
};

export function LanguageContentForm({
  language,
  initialContent,
  onSubmit,
  contentLabel = "content",
  placeholders,
  helperText,
  buttonLabel,
  successMessage,
  toastMessage,
  savingLabel,
}: LanguageContentFormProps) {
  const [value, setValue] = useState(initialContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const defaultPlaceholder =
    placeholders?.default ?? `Enter ${contentLabel}`;
  const localizedPlaceholder =
    placeholders?.localized ?? `Provide localized ${contentLabel}`;
  const helperDefault =
    helperText?.default ?? "Shown to visitors when no localized version is available.";
  const helperLocalized =
    helperText?.localized ??
    `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`;
  const saveButtonLabel =
    buttonLabel ?? `Save ${language.name} ${contentLabel}`;
  const savingText = savingLabel ?? "Saving…";
  const successStatus =
    successMessage ?? `Saved ${language.name} ${contentLabel}`;
  const successToast =
    toastMessage ?? successStatus;
  const failureText = `Failed to save ${language.name} ${contentLabel}`;

  useEffect(() => {
    setValue(initialContent);
  }, [initialContent]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData();
    formData.set("languageCode", language.code);
    formData.set("content", value);

    setIsSubmitting(true);
    setStatusMessage(savingText);

    void (async () => {
      try {
        const result = await onSubmit(formData);
        if (result && result.success) {
          toast({
            type: "success",
            description: successToast,
          });
          setStatusMessage(successStatus);
        }
      } catch (error) {
        console.error(`Failed to save ${contentLabel}`, error);
        toast({
          type: "error",
          description: failureText,
        });
        setStatusMessage(failureText);
      } finally {
        setIsSubmitting(false);
        setTimeout(() => {
          setStatusMessage(null);
        }, 2000);
      }
    })();
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-background p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold" htmlFor={`content-${language.code}`}>
          {language.name}
        </label>
        <Textarea
          className="min-h-[16rem]"
          id={`content-${language.code}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            language.isDefault
              ? defaultPlaceholder
              : localizedPlaceholder
          }
          disabled={isSubmitting}
          required
        />
        <p className="text-muted-foreground text-xs">
          {language.isDefault ? helperDefault : helperLocalized}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-xs" aria-live="polite">
          {statusMessage}
        </div>
        <Button disabled={isSubmitting} type="submit" variant="default">
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>{savingText}</span>
            </span>
          ) : (
            <>{saveButtonLabel}</>
          )}
        </Button>
      </div>
    </form>
  );
}
