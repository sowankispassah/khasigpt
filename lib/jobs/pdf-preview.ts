import "server-only";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { resolveServerFetchableSupabaseUrl } from "@/lib/supabase/storage-url";

let pdfPreviewRuntimeReady = false;

async function ensurePdfPreviewRuntimeReady() {
  if (pdfPreviewRuntimeReady) {
    return;
  }

  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = DOMMatrix as unknown as typeof globalThis.DOMMatrix;
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = ImageData as unknown as typeof globalThis.ImageData;
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = Path2D as unknown as typeof globalThis.Path2D;
  }

  pdfPreviewRuntimeReady = true;
}

async function fetchPdfBuffer(
  url: string,
  headers?: HeadersInit
) {
  const fetchUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? await resolveServerFetchableSupabaseUrl(url, 120)
      : url;
  const response = await fetch(fetchUrl, {
    method: "GET",
    cache: "force-cache",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`PDF fetch failed (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function renderPdfPreviewImage(input: {
  headers?: HeadersInit;
  pdfUrl: string;
  targetWidth?: number;
}) {
  await ensurePdfPreviewRuntimeReady();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = await fetchPdfBuffer(input.pdfUrl, input.headers);
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isOffscreenCanvasSupported: false,
    useWasm: false,
  });

  let pdfDocument: Awaited<typeof loadingTask.promise> | null = null;

  try {
    pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const desiredWidth = Math.max(480, Math.trunc(input.targetWidth ?? 900));
    const scale = desiredWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.max(1, Math.floor(viewport.width)),
      Math.max(1, Math.floor(viewport.height))
    );
    const context = canvas.getContext("2d");

    await page.render({
      canvas: null,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      background: "rgb(255,255,255)",
    }).promise;

    return {
      aspectRatio: viewport.width / viewport.height,
      dataUrl: canvas.toDataURL("image/png"),
      pngBuffer: canvas.toBuffer("image/png"),
      height: viewport.height,
      width: viewport.width,
    };
  } finally {
    try {
      await pdfDocument?.destroy?.();
    } catch {
      // noop
    }
    try {
      await loadingTask.destroy();
    } catch {
      // noop
    }
  }
}
