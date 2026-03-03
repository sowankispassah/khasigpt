"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";

type PdfCanvasPreviewProps = {
  src: string;
  title: string;
  maxPages?: number;
};

type RenderState = "loading" | "ready" | "error";

export function PdfCanvasPreview({
  src,
  title,
  maxPages,
}: PdfCanvasPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [state, setState] = useState<RenderState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [pagesRendered, setPagesRendered] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  const normalizedMaxPages = useMemo<number | null>(() => {
    if (!Number.isFinite(maxPages) || (maxPages ?? 0) <= 0) {
      return null;
    }
    return Math.max(1, Math.trunc(maxPages ?? 0));
  }, [maxPages]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      const width = Math.floor(container.clientWidth);
      if (Number.isFinite(width) && width > 0) {
        setContainerWidth(width);
      }
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerWidth <= 0) {
      return;
    }

    let cancelled = false;
    let loadingTask: any = null;
    let pdfDocument: any = null;

    const clearMount = () => {
      if (mountRef.current) {
        mountRef.current.innerHTML = "";
      }
    };

    const render = async () => {
      clearMount();
      setState("loading");
      setErrorMessage("");
      setPagesRendered(0);
      setTotalPages(0);

      try {
        const pdfjs = await import("pdfjs-dist");

        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          // Use a local worker served by Next.js to avoid CDN/CORS failures.
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        loadingTask = pdfjs.getDocument({
          url: src,
          withCredentials: true,
          useSystemFonts: true,
        });

        const pdfDoc = await loadingTask.promise;
        pdfDocument = pdfDoc;
        if (cancelled) {
          return;
        }

        const pageCount = Math.max(0, Number(pdfDoc.numPages) || 0);
        setTotalPages(pageCount);

        const pagesToRender =
          normalizedMaxPages === null
            ? pageCount
            : Math.min(pageCount, normalizedMaxPages);
        const container = mountRef.current;
        if (!container) {
          return;
        }

        const effectiveWidth = containerWidth;
        const deviceScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

        for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
          if (cancelled) {
            return;
          }

          const page = await pdfDoc.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = effectiveWidth / baseViewport.width;
          const renderScale = Math.max(fitScale, 0.1);
          const cssViewport = page.getViewport({ scale: renderScale });
          const renderViewport = page.getViewport({
            scale: renderScale * deviceScale,
          });

          const canvas = globalThis.document.createElement("canvas");
          canvas.className = "mb-3 block box-border w-full bg-white";
          canvas.style.width = "100%";
          canvas.style.height = `${Math.floor(cssViewport.height)}px`;
          canvas.width = Math.max(1, Math.floor(renderViewport.width));
          canvas.height = Math.max(1, Math.floor(renderViewport.height));

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            continue;
          }

          await page.render({
            canvasContext: context,
            viewport: renderViewport,
          }).promise;

          if (cancelled) {
            return;
          }

          container.appendChild(canvas);
          setPagesRendered((previous) => previous + 1);
        }

        if (!cancelled) {
          setState("ready");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to render PDF preview.");
      }
    };

    render();

    return () => {
      cancelled = true;
      clearMount();
      try {
        void loadingTask?.destroy?.();
      } catch {
        // noop
      }
      try {
        void pdfDocument?.destroy?.();
      } catch {
        // noop
      }
    };
  }, [containerWidth, normalizedMaxPages, src]);

  return (
    <div className="relative min-h-[220px] w-full bg-muted/10">
      {state === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          <span className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            Rendering PDF preview...
          </span>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-4 text-center">
          <p className="text-muted-foreground text-sm">
            PDF preview failed to render. Open it in a new tab.
          </p>
          {errorMessage ? (
            <p className="max-w-[95%] truncate text-muted-foreground/80 text-xs">{errorMessage}</p>
          ) : null}
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

      <div
        aria-label={title}
        className="w-full"
        ref={mountRef}
      />

      {state === "ready" &&
      normalizedMaxPages !== null &&
      totalPages > pagesRendered ? (
        <div className="px-2 pb-2 text-center text-muted-foreground text-xs">
          Showing first {pagesRendered} of {totalPages} pages.
        </div>
      ) : null}
    </div>
  );
}
