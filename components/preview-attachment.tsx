"use client";

import Image from "next/image";
import { useState } from "react";
import type { Attachment } from "@/lib/types";
import { Loader } from "./elements/loader";
import { CrossSmallIcon } from "./icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = Boolean(contentType?.startsWith("image"));
  const [open, setOpen] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  if (!isImage) {
    return (
      <div
        className="group relative size-16 overflow-hidden rounded-lg border bg-muted"
        data-testid="input-attachment-preview"
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

        <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
          {name}
        </div>
      </div>
    );
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div
          aria-disabled={isUploading}
          aria-label={name ? `View ${name}` : "View image attachment"}
          className="group relative size-16 cursor-pointer overflow-hidden rounded-lg border bg-muted outline-none ring-primary transition focus-visible:ring-2"
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
          role="button"
          tabIndex={0}
        >
          <Image
            alt={name ?? "An image attachment"}
            className="size-full object-cover"
            height={64}
            src={url}
            width={64}
          />

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

          <div className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/80 to-transparent px-1 py-0.5 text-[10px] text-white">
            {name}
          </div>
        </div>
      </DialogTrigger>

      <DialogContent className="w-auto max-w-[95vw] overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <div className="flex items-center justify-center">
          <Image
            alt={name ?? "An image attachment"}
            className="h-auto w-auto max-h-[90vh] max-w-[95vw] object-contain"
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
