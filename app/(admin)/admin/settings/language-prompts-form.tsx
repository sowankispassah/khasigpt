"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LanguageOption } from "@/lib/i18n/languages";

type LanguagePromptsFormProps = {
  language: LanguageOption;
  initialPrompts: string[];
  onSubmit: (formData: FormData) => Promise<
    | {
        success: true;
        languageCode: string;
        count: number;
      }
    | undefined
  >;
};

export function LanguagePromptsForm({
  language,
  initialPrompts,
  onSubmit,
}: LanguagePromptsFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialPrompts.join("\n"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const savingMessage = useMemo(
    () => `Saving ${language.name} prompts…`,
    [language.name]
  );

  useEffect(() => {
    setValue(initialPrompts.join("\n"));
  }, [initialPrompts]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData();
    formData.set("languageCode", language.code);
    formData.set("prompts", value);

    setIsSubmitting(true);
    setStatusMessage(savingMessage);
    (async () => {
      try {
        const result = await onSubmit(formData);
        if (result?.success) {
          toast({
            type: "success",
            description: `Saved ${language.name} prompts`,
          });
          setStatusMessage(`Saved ${language.name} prompts`);
        }
        router.refresh();
      } catch (error) {
        console.error("Failed to save prompts", error);
        toast({
          type: "error",
          description: `Failed to save ${language.name} prompts`,
        });
        setStatusMessage(`Failed to save ${language.name} prompts`);
      } finally {
        setIsSubmitting(false);
        setTimeout(() => {
          setStatusMessage(null);
        }, 1500);
      }
    })();
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border bg-background p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2">
        <label
          className="font-semibold text-sm"
          htmlFor={`prompts-${language.code}`}
        >
          {language.name} prompts
        </label>
        <Textarea
          className="min-h-[12rem]"
          disabled={isSubmitting}
          id={`prompts-${language.code}`}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Write a sample question or task..."
          required
          value={value}
        />
        <p className="text-muted-foreground text-xs">
          {language.isDefault
            ? "Shown to visitors by default and used as the fallback for other languages."
            : `Displayed when ${language.name} is selected. Falls back to the default language if left unchanged.`}
        </p>
      </div>
      <div className="flex justify-end">
        <Button disabled={isSubmitting} type="submit" variant="default">
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin text-primary-foreground">
                <LoaderIcon size={16} />
              </span>
              <span>Saving…</span>
            </span>
          ) : (
            <>Save {language.name} prompts</>
          )}
        </Button>
      </div>
      <div
        aria-live="polite"
        className="min-h-[1.25rem] text-muted-foreground text-xs"
      >
        {statusMessage ? (
          <span
            className={isSubmitting ? "flex items-center gap-2" : undefined}
          >
            {isSubmitting ? (
              <span className="h-3 w-3 animate-spin text-muted-foreground">
                <LoaderIcon size={12} />
              </span>
            ) : null}
            {statusMessage}
          </span>
        ) : null}
      </div>
    </form>
  );
}
