"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { PdfCanvasPreview } from "@/components/jobs/pdf-canvas-preview";

type ExternalPreviewFrameProps = {
  src: string;
  title: string;
  heightClassName: string;
  format?: "html" | "pdf";
};

const PREVIEW_LOAD_TIMEOUT_MS = 12000;

export function ExternalPreviewFrame({
  src,
  title,
  heightClassName,
  format = "html",
}: ExternalPreviewFrameProps) {
  if (format === "pdf") {
    return (
      <div className={`relative overflow-hidden rounded-lg border ${heightClassName}`}>
        <PdfCanvasPreview src={src} title={title} />
      </div>
    );
  }

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const clearLoadTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setFailed(false);
    clearLoadTimeout();

    timeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      setFailed(true);
    }, PREVIEW_LOAD_TIMEOUT_MS);

    return () => {
      clearLoadTimeout();
    };
  }, [src]);

  return (
    <div className={`relative overflow-hidden rounded-lg border ${heightClassName}`}>
      {!failed ? (
        <iframe
          className={`h-full w-full ${isLoading ? "opacity-0" : "opacity-100"}`}
          onError={() => {
            clearLoadTimeout();
            setIsLoading(false);
            setFailed(true);
          }}
          onLoad={() => {
            clearLoadTimeout();
            setIsLoading(false);
            setFailed(false);
          }}
          ref={frameRef}
          src={src}
          title={title}
        />
      ) : null}

      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          <span className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            Loading preview...
          </span>
        </div>
      ) : null}

      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-4 text-center">
          <p className="text-muted-foreground text-sm">
            Preview is blocked by the source website or failed to load.
          </p>
          <a
            className="rounded-md border px-3 py-2 text-sm underline underline-offset-2"
            href={src}
            rel="noreferrer"
            target="_blank"
          >
            Open in new tab
          </a>
        </div>
      ) : null}
    </div>
  );
}
