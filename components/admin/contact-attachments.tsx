"use client";

import { Download, Loader2, Paperclip, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isContactImageAttachment } from "@/lib/contact/attachment-preview";
import type { ContactAttachment } from "@/lib/db/schema";

function ContactAttachmentView({ file, href }: { file: ContactAttachment; href: string }) {
  const { translate } = useTranslation();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [largePreviewLoaded, setLargePreviewLoaded] = useState(false);
  const [largePreviewFailed, setLargePreviewFailed] = useState(false);
  if (!isContactImageAttachment(file)) {
    return (
      <a
        className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-current/20 px-2 py-1 text-xs underline-offset-2 hover:underline"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Paperclip aria-hidden="true" className="size-3 shrink-0" />
        <span className="max-w-56 truncate" title={file.name}>
          {file.name}
        </span>
      </a>
    );
  }
  return (
    <div className="min-w-0 max-w-full space-y-2">
      {previewFailed ? (
        <p className="text-xs">
          <EditableTranslation
            defaultText="Image preview unavailable. You can still download the file."
            description="Fallback when a support image attachment cannot be displayed."
            translationKey="admin.contacts.attachments.preview_error"
          />
        </p>
      ) : (
        <Dialog
          onOpenChange={(open) => {
            if (open) {
              setLargePreviewLoaded(false);
              setLargePreviewFailed(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              className="block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-current/20 bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <Image
                alt={file.name}
                className="h-auto max-h-64 w-auto max-w-full object-contain"
                height={240}
                loading="lazy"
                onError={() => setPreviewFailed(true)}
                src={`${href}&display=inline`}
                unoptimized
                width={320}
              />
            </button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl gap-0 overflow-hidden p-0">
            <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3 text-left">
              <DialogTitle className="min-w-0 truncate text-base" title={file.name}>
                {file.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                <EditableTranslation
                  defaultText="Image attachment preview"
                  description="Accessible description for the large support image preview."
                  translationKey="admin.contacts.attachments.preview"
                />
              </DialogDescription>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  aria-label={translate("admin.contacts.attachments.download", "Download")}
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={translate("admin.contacts.attachments.download", "Download")}
                >
                  <Download aria-hidden="true" className="size-4" />
                  <span className="sr-only">
                    <EditableTranslation
                      defaultText="Download"
                      description="Download a support conversation image attachment."
                      translationKey="admin.contacts.attachments.download"
                    />
                  </span>
                </a>
                <DialogClose
                  aria-label={translate("admin.contacts.dialog.close", "Close")}
                  className="size-8 p-0"
                  title={translate("admin.contacts.dialog.close", "Close")}
                >
                  <X aria-hidden="true" className="size-4" />
                </DialogClose>
              </div>
            </DialogHeader>
            <div className="relative flex h-[70vh] items-center justify-center bg-muted/30 p-4">
              {largePreviewFailed ? (
                <p className="px-4 text-center text-muted-foreground text-sm" role="alert">
                  <EditableTranslation
                    defaultText="Image preview unavailable. You can still download the file."
                    description="Fallback when a support image attachment cannot be displayed."
                    translationKey="admin.contacts.attachments.preview_error"
                  />
                </p>
              ) : (
                <>
                  {!largePreviewLoaded ? (
                    <output>
                      <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                      <span className="sr-only">
                        <EditableTranslation
                          defaultText="Loading image"
                          description="Support image preview loading state."
                          translationKey="admin.contacts.attachments.loading"
                        />
                      </span>
                    </output>
                  ) : null}
                  <Image
                    alt={file.name}
                    className="object-contain p-4"
                    fill
                    onError={() => setLargePreviewFailed(true)}
                    onLoad={() => setLargePreviewLoaded(true)}
                    sizes="(max-width: 1024px) 100vw, 1024px"
                    src={`${href}&display=inline`}
                    unoptimized
                  />
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="max-w-56 truncate" title={file.name}>
          {file.name}
        </span>
        <a
          className="inline-flex cursor-pointer items-center gap-1 underline-offset-2 hover:underline"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Download aria-hidden="true" className="size-3" />
          <EditableTranslation
            defaultText="Download"
            description="Download a support conversation image attachment."
            translationKey="admin.contacts.attachments.download"
          />
        </a>
      </div>
    </div>
  );
}

export function ContactAttachments({
  files,
  source,
  id,
}: {
  files: ContactAttachment[];
  source: "contact" | "reply";
  id: string;
}) {
  if (!Array.isArray(files) || !files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-start gap-3 whitespace-normal">
      {files
        .filter((file) => file && typeof file.id === "string" && typeof file.name === "string")
        .map((file) => (
          <ContactAttachmentView
            file={file}
            href={`/api/admin/contact-messages/attachments?source=${source}&id=${encodeURIComponent(id)}&attachmentId=${encodeURIComponent(file.id)}`}
            key={file.id}
          />
        ))}
    </div>
  );
}
