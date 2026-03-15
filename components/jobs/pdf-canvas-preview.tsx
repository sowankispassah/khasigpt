"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";

type PdfCanvasPreviewProps = {
  src: string;
  title: string;
  maxPages?: number;
};

type RenderState = "loading" | "ready" | "error";

type PdfBytesCacheEntry = {
  bytes: Uint8Array;
  size: number;
  expiresAt: number;
  lastAccessedAt: number;
};

type PdfPagePreviewCacheEntry = {
  dataUrl: string;
  expiresAt: number;
  lastAccessedAt: number;
};

const PDF_BYTES_CACHE_TTL_MS = 10 * 60 * 1000;
const PDF_BYTES_CACHE_MAX_ENTRIES = 8;
const PDF_BYTES_CACHE_MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const PDF_PREVIEW_CACHE_TTL_MS = 15 * 60 * 1000;
const PDF_PREVIEW_CACHE_MAX_ENTRIES = 120;
const MAX_CACHED_PREVIEW_PAGE_NUMBER = 8;

const pdfBytesCache = new Map<string, PdfBytesCacheEntry>();
const pdfPagePreviewCache = new Map<string, PdfPagePreviewCacheEntry>();
let pdfBytesCacheTotalBytes = 0;
const textSelectionLayers = new Map<HTMLDivElement, HTMLDivElement>();
let textSelectionAbortController: AbortController | null = null;

function nowMs() {
  return Date.now();
}

function getWidthBucket(width: number) {
  return Math.max(320, Math.round(width / 24) * 24);
}

function getPreviewCacheKey({
  src,
  widthBucket,
  pageNumber,
}: {
  src: string;
  widthBucket: number;
  pageNumber: number;
}) {
  return `${src}::${widthBucket}::${pageNumber}`;
}

function evictExpiredPdfByteCacheEntries() {
  const now = nowMs();
  for (const [key, entry] of pdfBytesCache.entries()) {
    if (entry.expiresAt <= now) {
      pdfBytesCache.delete(key);
      pdfBytesCacheTotalBytes = Math.max(0, pdfBytesCacheTotalBytes - entry.size);
    }
  }
}

function enforcePdfByteCacheLimits() {
  while (
    pdfBytesCache.size > PDF_BYTES_CACHE_MAX_ENTRIES ||
    pdfBytesCacheTotalBytes > PDF_BYTES_CACHE_MAX_TOTAL_BYTES
  ) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of pdfBytesCache.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (!oldestKey) {
      break;
    }

    const removed = pdfBytesCache.get(oldestKey);
    pdfBytesCache.delete(oldestKey);
    if (removed) {
      pdfBytesCacheTotalBytes = Math.max(0, pdfBytesCacheTotalBytes - removed.size);
    }
  }
}

function readCachedPdfBytes(src: string) {
  evictExpiredPdfByteCacheEntries();
  const entry = pdfBytesCache.get(src);
  if (!entry) {
    return null;
  }

  entry.lastAccessedAt = nowMs();
  return entry.bytes;
}

function cachePdfBytes(src: string, bytes: Uint8Array) {
  evictExpiredPdfByteCacheEntries();

  const existing = pdfBytesCache.get(src);
  if (existing) {
    pdfBytesCacheTotalBytes = Math.max(0, pdfBytesCacheTotalBytes - existing.size);
  }

  pdfBytesCache.set(src, {
    bytes,
    size: bytes.byteLength,
    expiresAt: nowMs() + PDF_BYTES_CACHE_TTL_MS,
    lastAccessedAt: nowMs(),
  });
  pdfBytesCacheTotalBytes += bytes.byteLength;
  enforcePdfByteCacheLimits();
}

function evictExpiredPdfPreviewCacheEntries() {
  const now = nowMs();
  for (const [key, entry] of pdfPagePreviewCache.entries()) {
    if (entry.expiresAt <= now) {
      pdfPagePreviewCache.delete(key);
    }
  }
}

function enforcePdfPreviewCacheLimits() {
  while (pdfPagePreviewCache.size > PDF_PREVIEW_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of pdfPagePreviewCache.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (!oldestKey) {
      break;
    }

    pdfPagePreviewCache.delete(oldestKey);
  }
}

function readCachedPagePreview({
  src,
  widthBucket,
  pageNumber,
}: {
  src: string;
  widthBucket: number;
  pageNumber: number;
}) {
  evictExpiredPdfPreviewCacheEntries();
  const key = getPreviewCacheKey({
    src,
    widthBucket,
    pageNumber,
  });
  const entry = pdfPagePreviewCache.get(key);
  if (!entry) {
    return null;
  }

  entry.lastAccessedAt = nowMs();
  return entry.dataUrl;
}

function cachePagePreview({
  src,
  widthBucket,
  pageNumber,
  dataUrl,
}: {
  src: string;
  widthBucket: number;
  pageNumber: number;
  dataUrl: string;
}) {
  if (pageNumber > MAX_CACHED_PREVIEW_PAGE_NUMBER) {
    return;
  }

  evictExpiredPdfPreviewCacheEntries();
  const key = getPreviewCacheKey({
    src,
    widthBucket,
    pageNumber,
  });
  pdfPagePreviewCache.set(key, {
    dataUrl,
    expiresAt: nowMs() + PDF_PREVIEW_CACHE_TTL_MS,
    lastAccessedAt: nowMs(),
  });
  enforcePdfPreviewCacheLimits();
}

function removeNullCharacters(value: string) {
  return value.replace(/\u0000/g, "");
}

function unregisterTextSelectionLayer(textLayerDiv: HTMLDivElement) {
  textSelectionLayers.delete(textLayerDiv);
  if (textSelectionLayers.size === 0) {
    textSelectionAbortController?.abort();
    textSelectionAbortController = null;
  }
}

function ensureTextSelectionTracking() {
  if (textSelectionAbortController) {
    return;
  }

  textSelectionAbortController = new AbortController();
  const { signal } = textSelectionAbortController;

  const reset = (endOfContent: HTMLDivElement, textLayerDiv: HTMLDivElement) => {
    textLayerDiv.append(endOfContent);
    endOfContent.style.width = "";
    endOfContent.style.height = "";
    textLayerDiv.classList.remove("selecting");
  };

  let isPointerDown = false;
  let previousRange: Range | null = null;

  document.addEventListener(
    "pointerdown",
    () => {
      isPointerDown = true;
    },
    { signal }
  );

  document.addEventListener(
    "pointerup",
    () => {
      isPointerDown = false;
      previousRange = null;
      textSelectionLayers.forEach(reset);
    },
    { signal }
  );

  window.addEventListener(
    "blur",
    () => {
      isPointerDown = false;
      previousRange = null;
      textSelectionLayers.forEach(reset);
    },
    { signal }
  );

  document.addEventListener(
    "keyup",
    () => {
      if (!isPointerDown) {
        previousRange = null;
        textSelectionLayers.forEach(reset);
      }
    },
    { signal }
  );

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        previousRange = null;
        textSelectionLayers.forEach(reset);
        return;
      }

      const activeTextLayers = new Set<HTMLDivElement>();
      for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index);
        for (const textLayerDiv of textSelectionLayers.keys()) {
          if (
            !activeTextLayers.has(textLayerDiv) &&
            range.intersectsNode(textLayerDiv)
          ) {
            activeTextLayers.add(textLayerDiv);
          }
        }
      }

      for (const [textLayerDiv, endOfContent] of textSelectionLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add("selecting");
        } else {
          reset(endOfContent, textLayerDiv);
        }
      }

      const range = selection.getRangeAt(0);
      const modifyStart =
        !!previousRange &&
        (range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0);

      let anchor: Node | null = modifyStart
        ? range.startContainer
        : range.endContainer;
      if (anchor?.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode;
      }
      if (!anchor) {
        previousRange = range.cloneRange();
        return;
      }

      if (!modifyStart && range.endOffset === 0) {
        do {
          while (anchor && !anchor.previousSibling) {
            anchor = anchor.parentNode;
          }
          anchor = anchor?.previousSibling ?? null;
        } while (anchor && !anchor.childNodes.length);
      }

      const anchorElement =
        anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const parentTextLayer = anchorElement?.closest(".textLayer");
      if (parentTextLayer instanceof HTMLDivElement) {
        const endOfContent = textSelectionLayers.get(parentTextLayer);
        if (endOfContent) {
          endOfContent.style.width = parentTextLayer.style.width;
          endOfContent.style.height = parentTextLayer.style.height;
          anchorElement?.parentElement?.insertBefore(
            endOfContent,
            modifyStart ? anchorElement : anchorElement?.nextSibling ?? null
          );
        }
      }

      previousRange = range.cloneRange();
    },
    { signal }
  );
}

function registerTextSelectionLayer(textLayerDiv: HTMLDivElement) {
  const endOfContent = document.createElement("div");
  endOfContent.className = "endOfContent";
  textLayerDiv.append(endOfContent);

  textLayerDiv.tabIndex = 0;
  textLayerDiv.addEventListener("mousedown", () => {
    textLayerDiv.classList.add("selecting");
  });
  textLayerDiv.addEventListener("copy", (event) => {
    const selection = document.getSelection();
    if (!selection) {
      return;
    }

    event.clipboardData?.setData(
      "text/plain",
      removeNullCharacters(selection.toString())
    );
    event.preventDefault();
  });

  textSelectionLayers.set(textLayerDiv, endOfContent);
  ensureTextSelectionTracking();
}

async function fetchPdfBytes({
  src,
  signal,
}: {
  src: string;
  signal: AbortSignal;
}) {
  const response = await fetch(src, {
    method: "GET",
    credentials: "include",
    cache: "force-cache",
    signal,
    headers: {
      accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`PDF fetch failed (HTTP ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export function PdfCanvasPreview({
  src,
  title,
  maxPages,
}: PdfCanvasPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [containerWidthBucket, setContainerWidthBucket] = useState<number>(0);
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
        setContainerWidthBucket(getWidthBucket(width));
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
    if (containerWidthBucket <= 0) {
      return;
    }

    let cancelled = false;
    let loadingTask: any = null;
    let pdfDocument: any = null;
    const pdfBytesAbortController = new AbortController();
    const registeredTextLayers: HTMLDivElement[] = [];

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
      const nextMount = globalThis.document.createElement("div");
      nextMount.className = "w-full";

      try {
        const pdfjs = await import("pdfjs-dist");

        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          // Use a local worker served by Next.js to avoid CDN/CORS failures.
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        let documentInput: Record<string, unknown> = {
          url: src,
          withCredentials: true,
          useSystemFonts: true,
        };

        try {
          let bytes = readCachedPdfBytes(src);
          if (!bytes) {
            bytes = await fetchPdfBytes({
              src,
              signal: pdfBytesAbortController.signal,
            });
            if (cancelled) {
              return;
            }
            cachePdfBytes(src, bytes);
          }

          documentInput = {
            data: bytes.slice(),
            useSystemFonts: true,
          };
        } catch {
          // Fallback to URL mode when in-memory byte cache cannot be populated.
        }

        loadingTask = pdfjs.getDocument(documentInput);

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
        if (!mountRef.current) {
          return;
        }

        const effectiveWidth = containerWidthBucket;
        const widthBucket = containerWidthBucket;
        const deviceScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        let renderedPages = 0;

        for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
          if (cancelled) {
            return;
          }
          const cachedPreviewDataUrl = readCachedPagePreview({
            src,
            widthBucket,
            pageNumber,
          });

          const page = await pdfDoc.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = effectiveWidth / baseViewport.width;
          const renderScale = Math.max(fitScale, 0.1);
          const cssViewport = page.getViewport({ scale: renderScale });
          const renderViewport = page.getViewport({
            scale: renderScale * deviceScale,
          });
          const textContent = await page.getTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          });
          const textItems = textContent.items.filter(
            (item: { str?: string }) =>
              typeof item.str === "string" && item.str.trim().length > 0
          ).length;

          const pageWrapper = globalThis.document.createElement("div");
          pageWrapper.className =
            "relative mb-3 block box-border w-full overflow-hidden bg-white";
          pageWrapper.style.height = `${Math.floor(cssViewport.height)}px`;
          nextMount.appendChild(pageWrapper);

          if (cachedPreviewDataUrl) {
            const previewImage = globalThis.document.createElement("img");
            previewImage.className = "pointer-events-none block h-full w-full bg-white select-none";
            previewImage.alt = `PDF page ${pageNumber}`;
            previewImage.loading = "lazy";
            previewImage.src = cachedPreviewDataUrl;
            pageWrapper.appendChild(previewImage);
          } else {
            const canvas = globalThis.document.createElement("canvas");
            canvas.className = "pointer-events-none block box-border w-full bg-white select-none";
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

            pageWrapper.appendChild(canvas);
            if (pageNumber <= MAX_CACHED_PREVIEW_PAGE_NUMBER) {
              const previewDataUrl = canvas.toDataURL("image/webp", 0.82);
              cachePagePreview({
                src,
                widthBucket,
                pageNumber,
                dataUrl: previewDataUrl,
              });
            }
          }

          const textLayerDiv = globalThis.document.createElement("div");
          textLayerDiv.className = "pdf-preview-text-layer textLayer";
          textLayerDiv.setAttribute("data-main-rotation", String(cssViewport.rotation));
          textLayerDiv.style.width = "100%";
          textLayerDiv.style.height = `${Math.floor(cssViewport.height)}px`;
          textLayerDiv.style.setProperty("--scale-factor", String(renderScale));
          textLayerDiv.style.setProperty(
            "--total-scale-factor",
            String(renderScale)
          );
          pageWrapper.appendChild(textLayerDiv);

          const textLayer = new pdfjs.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: cssViewport,
          });
          await textLayer.render();
          if (textItems > 0) {
            registerTextSelectionLayer(textLayerDiv);
            registeredTextLayers.push(textLayerDiv);
          }

          renderedPages += 1;
        }

        if (!cancelled) {
          clearMount();
          mountRef.current?.appendChild(nextMount);
          setPagesRendered(renderedPages);
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
      pdfBytesAbortController.abort();
      for (const textLayer of registeredTextLayers) {
        unregisterTextSelectionLayer(textLayer);
      }
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
  }, [containerWidthBucket, normalizedMaxPages, src]);

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
