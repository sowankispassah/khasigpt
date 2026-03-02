"use client";

import Image from "next/image";
import { useState } from "react";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader } from "./elements/loader";
import { CrossSmallIcon, DownloadIcon } from "./icons";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
  className,
  previewSize,
  showName = true,
  showDownload = false,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
  className?: string;
  previewSize?: number;
  showName?: boolean;
  showDownload?: boolean;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = Boolean(contentType?.startsWith("image"));
  const [open, setOpen] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const resolvedPreviewSize = previewSize ?? 64;
  const imageExtension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/jpeg"
        ? "jpg"
        : "";
  const downloadFilename =
    name && imageExtension && !name.includes(".")
      ? `${name}.${imageExtension}`
      : name ?? `image${imageExtension ? `.${imageExtension}` : ""}`;

  if (!isImage) {
    return (
      <div
        className={cn(
          "group relative overflow-hidden rounded-lg border bg-muted",
          className
        )}
        data-testid="input-attachment-preview"
        style={{ width: resolvedPreviewSize, height: resolvedPreviewSize }}
      >
        <div className="flex size-full items-center justify-center text-muted-foreground text-xs">
          File
        </div>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader size={16} />
          </div>
        )}

        {onRemove && !isUploading && (
          <Button
            className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            size="sm"
            variant="destructive"
          >
            <CrossSmallIcon size={8} />
          </Button>
        )}

        {showName ? (
          <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
            {name}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <button
          aria-disabled={isUploading}
          aria-label={name ? `View ${name}` : "View image attachment"}
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-lg border bg-muted outline-none ring-primary transition focus-visible:ring-2",
            className
          )}
          data-testid="input-attachment-preview"
          onClick={(event) => {
            if (isUploading) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onKeyDown={(event) => {
            if (isUploading) {
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          style={{ width: resolvedPreviewSize, height: resolvedPreviewSize }}
          type="button"
        >
          <Image
            alt={name ?? "An image attachment"}
            className="size-full object-cover"
            height={resolvedPreviewSize}
            src={url}
            width={resolvedPreviewSize}
          />

          {showDownload && !isUploading ? (
            <a
              aria-label={
                name ? `Download ${name}` : "Download image attachment"
              }
              className="absolute top-0.5 left-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              download={downloadFilename}
              href={url}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DownloadIcon size={12} />
            </a>
          ) : null}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader size={16} />
            </div>
          )}

          {onRemove && !isUploading && (
            <Button
              className="absolute top-0.5 right-0.5 size-4 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              size="sm"
              variant="destructive"
            >
              <CrossSmallIcon size={8} />
            </Button>
          )}

          {showName ? (
            <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
              {name}
            </div>
          ) : null}
        </button>
      </DialogTrigger>

      <DialogContent className="w-auto max-w-[95vw] overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <div className="flex items-center justify-center">
          {showDownload && !isUploading ? (
            <a
              aria-label={
                name ? `Download ${name}` : "Download image attachment"
              }
              className="absolute top-3 right-3 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground shadow-md"
              download={downloadFilename}
              href={url}
            >
              <DownloadIcon size={16} />
            </a>
          ) : null}
          <Image
            alt={name ?? "An image attachment"}
            className="h-auto max-h-[90vh] w-auto max-w-[95vw] object-contain"
            height={dimensions?.height ?? 800}
            onLoadingComplete={({ naturalWidth, naturalHeight }) => {
              setDimensions({ width: naturalWidth, height: naturalHeight });
            }}
            sizes="(min-width: 1024px) 95vw, 95vw"
            src={url}
            width={dimensions?.width ?? 800}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
