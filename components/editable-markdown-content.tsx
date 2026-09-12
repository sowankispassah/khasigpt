"use client";

import { type JSX, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { useTranslationEdit } from "@/components/translation-edit-provider";
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

const DOUBLE_NEWLINE_REGEX = /\n{2,}/;
const HEADING_REGEX = /^#{1,6}\s/;
const HEADING_PREFIX_REGEX = /^#{1,6}/;
const HEADING_TRIM_REGEX = /^#{1,6}\s*/;
const LIST_ITEM_PREFIX_REGEX = /^-+\s*/;
const MULTILINE_REGEX = /\n+/;

type ResourceName = "about" | "privacyPolicy" | "termsOfService";

type EditableMarkdownContentProps = {
  className?: string;
  content: string;
  headingClassName?: string;
  paragraphClassName?: string;
  resource: ResourceName;
};

export function EditableMarkdownContent({
  className,
  content,
  headingClassName = "font-semibold text-foreground text-xl",
  paragraphClassName,
  resource,
}: EditableMarkdownContentProps) {
  const { activeLanguage, translate } = useTranslation();
  const { enabled, isAdmin } = useTranslationEdit();
  const [open, setOpen] = useState(false);
  const [displayContent, setDisplayContent] = useState(content);
  const [draft, setDraft] = useState(content);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayContent(content);
    setDraft(content);
  }, [content]);

  const canEdit = enabled && isAdmin;

  const saveContent = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/resources/inline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draft,
          languageCode: activeLanguage.code,
          resource,
          source: "web",
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; value?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          body?.error ??
            translate("translation_edit.save_failed", "Unable to save translation.")
        );
      }

      const nextContent = body?.value ?? draft;
      setDisplayContent(nextContent);
      setDraft(nextContent);
      setOpen(false);
      toast.success(translate("translation_edit.saved", "Translation saved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate("translation_edit.save_failed", "Unable to save translation.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderedContent = renderMarkdownContent(
    displayContent,
    headingClassName,
    paragraphClassName
  );

  return (
    <>
      {canEdit ? (
        // biome-ignore lint/a11y/useSemanticElements: This wrapper contains rich page content, so a native button would create invalid nested markup.
        <div
          className={cn(
            className,
            "cursor-pointer rounded-md border border-dashed border-orange-400/80 p-2 transition hover:bg-orange-500/5"
          )}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {renderedContent}
        </div>
      ) : (
        <div className={className}>{renderedContent}</div>
      )}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {translate("translation_edit.resource_title", "Edit page content")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "translation_edit.resource_description",
                "Update the content for the current language only."
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[360px] font-mono text-sm"
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {translate("common.cancel", "Cancel")}
            </Button>
            <Button disabled={isSaving} onClick={saveContent} type="button">
              {isSaving
                ? translate("translation_edit.saving", "Saving...")
                : translate("translation_edit.save", "Save translation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function renderMarkdownContent(
  content: string,
  headingClassName: string,
  paragraphClassName?: string
) {
  const blocks = content
    .split(DOUBLE_NEWLINE_REGEX)
    .map((block) => block.trim());

  return blocks.filter(Boolean).map((block, index) => {
    if (HEADING_REGEX.test(block)) {
      const match = block.match(HEADING_PREFIX_REGEX);
      const level = match ? match[0].length : 2;
      const headingText = block.replace(HEADING_TRIM_REGEX, "").trim();
      const HeadingTag =
        `h${Math.min(level + 1, 6)}` as keyof JSX.IntrinsicElements;

      return (
        <HeadingTag
          className={headingClassName}
          key={`heading-${headingText || index}`}
        >
          {headingText}
        </HeadingTag>
      );
    }

    const lines = block.split("\n").map((line) => line.trim());
    const isList = lines.every((line) => line.startsWith("- "));

    if (isList) {
      const listKey = `list-${lines.join("|").slice(0, 32) || index}`;
      return (
        <ul className="list-disc space-y-2 pl-5" key={listKey}>
          {lines.map((line, itemIndex) => (
            <li key={`list-item-${listKey}-${itemIndex}-${line}`}>
              {line.replace(LIST_ITEM_PREFIX_REGEX, "")}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p
        className={cn("whitespace-pre-line", paragraphClassName)}
        key={`paragraph-${block.slice(0, 32) || index}`}
      >
        {block.replace(MULTILINE_REGEX, " ")}
      </p>
    );
  });
}
