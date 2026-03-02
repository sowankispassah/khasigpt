import {
  DOCUMENT_UPLOADS_MAX_BYTES,
  DOCUMENT_UPLOADS_MAX_TEXT_CHARS,
  isDocumentMimeType,
} from "@/lib/uploads/document-uploads";

type DocumentAttachment = {
  name: string | null | undefined;
  url: string;
  mediaType: string;
};

type ParsedDocument = {
  name: string;
  text: string;
  truncated: boolean;
};

type ParseDocumentOptions = {
  maxTextChars?: number;
  downloadTimeoutMs?: number;
};

let pdfRuntimeReady = false;

const normalizeText = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const truncateText = (value: string, maxTextChars: number) => {
  if (value.length <= maxTextChars) {
    return { text: value, truncated: false };
  }
  return {
    text: value.slice(0, maxTextChars),
    truncated: true,
  };
};

async function fetchFileBuffer(
  url: string,
  {
    maxBytes = DOCUMENT_UPLOADS_MAX_BYTES,
    timeoutMs = 20_000,
  }: { maxBytes?: number; timeoutMs?: number } = {}
) {
  const controller = new AbortController();
  const timeoutId =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to download file (${response.status})`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const length = Number(contentLength);
      if (Number.isFinite(length) && length > maxBytes) {
        throw new Error("Document is too large");
      }
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        total += value.length;
        if (total > maxBytes) {
          throw new Error("Document is too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Document download timed out");
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function ensurePdfRuntimeReady() {
  if (pdfRuntimeReady) {
    return;
  }

  // PDF parser dependencies may evaluate these globals during module load.
  // Install polyfills before importing parser modules to avoid runtime errors.
  try {
    const canvas = await import("@napi-rs/canvas");
    if (!globalThis.DOMMatrix) {
      globalThis.DOMMatrix = canvas.DOMMatrix as unknown as typeof DOMMatrix;
    }
    if (!globalThis.ImageData) {
      globalThis.ImageData = canvas.ImageData as unknown as typeof ImageData;
    }
    if (!globalThis.Path2D) {
      globalThis.Path2D = canvas.Path2D as unknown as typeof Path2D;
    }
  } catch {
    // Fallback shim for environments where native canvas can't load.
    if (!globalThis.DOMMatrix) {
      class DOMMatrixShim {}
      globalThis.DOMMatrix = DOMMatrixShim as unknown as typeof DOMMatrix;
    }
    if (!globalThis.ImageData) {
      class ImageDataShim {}
      globalThis.ImageData = ImageDataShim as unknown as typeof ImageData;
    }
    if (!globalThis.Path2D) {
      class Path2DShim {}
      globalThis.Path2D = Path2DShim as unknown as typeof Path2D;
    }
  }

  pdfRuntimeReady = true;
}

async function parsePdfViaLibrary(buffer: Buffer) {
  await ensurePdfRuntimeReady();
  const { PDFParse } = await import("pdf-parse");
  if (!PDFParse) {
    throw new Error("PDF parser unavailable");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    try {
      await parser.destroy();
    } catch {
      // noop
    }
  }
}

function parsePdfTextFallback(buffer: Buffer) {
  const raw = buffer.toString("latin1");

  const decodePdfLiteralString = (value: string) =>
    value
      .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
        switch (escaped) {
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          case "b":
            return "\b";
          case "f":
            return "\f";
          default:
            return escaped;
        }
      })
      .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => {
        const codePoint = Number.parseInt(octal, 8);
        if (!Number.isFinite(codePoint)) {
          return "";
        }
        return String.fromCharCode(codePoint);
      })
      .replace(/\\\r?\n/g, "");

  const isLikelyReadableText = (value: string) => {
    const normalized = normalizeText(value);
    if (!normalized) {
      return false;
    }

    if (
      /%?PDF-\d\.\d/i.test(normalized) ||
      /\b(?:obj|endobj|stream|endstream)\b/i.test(normalized) ||
      /\/(?:Type|XObject|Filter|DecodeParms|ColorSpace|BitsPerComponent|Length)\b/i.test(
        normalized
      )
    ) {
      return false;
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 8) {
      return false;
    }

    const alphaWordCount = words.filter((word) => /[A-Za-z]{3,}/.test(word)).length;
    const alphaRatio = alphaWordCount / words.length;
    if (alphaRatio < 0.5) {
      return false;
    }

    const longTokenCount = words.filter(
      (word) => word.length >= 30 && !/^https?:\/\//i.test(word)
    ).length;
    if (longTokenCount / words.length > 0.06) {
      return false;
    }

    const symbolCount = (normalized.match(/[^A-Za-z0-9\s.,;:'"!?()/-]/g) ?? []).length;
    const symbolRatio = symbolCount / normalized.length;
    return symbolRatio <= 0.18;
  };

  const literalMatches = raw.match(/\((?:\\.|[^\\()]){3,}\)/g) ?? [];
  const literalText = literalMatches
    .slice(0, 12_000)
    .map((match) => decodePdfLiteralString(match.slice(1, -1)))
    .filter((segment) => /[A-Za-z]{2,}/.test(segment))
    .join(" ");
  if (isLikelyReadableText(literalText)) {
    return literalText;
  }

  const tokenMatches = raw.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:'"()/%+\-]{3,}/g) ?? [];
  const tokenText = tokenMatches.slice(0, 8_000).join(" ");
  if (isLikelyReadableText(tokenText)) {
    return tokenText;
  }

  return "";
}

async function parsePdf(buffer: Buffer) {
  try {
    return await parsePdfViaLibrary(buffer);
  } catch (error) {
    console.warn("[document-parser] pdf_parse_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const fallback = parsePdfTextFallback(buffer);
    if (fallback.trim()) {
      return fallback;
    }
    throw new Error("PDF parser unavailable");
  }
}

async function parseDocx(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

async function parseSpreadsheet(buffer: Buffer) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(buffer, {
    type: "buffer",
    cellFormula: true,
    cellDates: true,
    raw: true,
  });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      return "";
    }
    const range = xlsx.utils.decode_range(sheet["!ref"]);
    const rows: string[] = [];

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const rowValues: string[] = [];
      let lastValueIndex = -1;

      for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
        const cellAddress = xlsx.utils.encode_cell({
          r: rowIndex,
          c: colIndex,
        });
        const cell = sheet[cellAddress];
        let value = "";

        if (cell) {
          if (cell.v !== undefined && cell.v !== null) {
            value =
              cell.v instanceof Date ? cell.v.toISOString() : String(cell.v);
          } else if (typeof cell.w === "string" && cell.w.trim().length > 0) {
            value = cell.w;
          } else if (typeof cell.f === "string" && cell.f.trim().length > 0) {
            value = `=${cell.f}`;
          }
        }

        rowValues.push(value);
        if (value.trim().length > 0) {
          lastValueIndex = colIndex - range.s.c;
        }
      }

      if (lastValueIndex >= 0) {
        rows.push(rowValues.slice(0, lastValueIndex + 1).join("\t"));
      }
    }

    if (rows.length === 0) {
      return "";
    }
    return `Sheet: ${sheetName}\n${rows.join("\n")}`;
  }).filter(Boolean);
  return sheets.join("\n\n");
}

export async function extractDocumentText(
  attachment: DocumentAttachment,
  options: ParseDocumentOptions = {}
): Promise<ParsedDocument> {
  if (!isDocumentMimeType(attachment.mediaType)) {
    throw new Error("Unsupported document type");
  }

  const buffer = await fetchFileBuffer(attachment.url, {
    timeoutMs: options.downloadTimeoutMs,
  });
  let rawText = "";

  switch (attachment.mediaType) {
    case "application/pdf":
      rawText = await parsePdf(buffer);
      break;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      rawText = await parseDocx(buffer);
      break;
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      rawText = await parseSpreadsheet(buffer);
      break;
    default:
      rawText = "";
  }

  const normalized = normalizeText(rawText);
  if (!normalized) {
    throw new Error("No extractable text found");
  }

  const maxTextChars =
    typeof options.maxTextChars === "number" && options.maxTextChars > 0
      ? Math.trunc(options.maxTextChars)
      : DOCUMENT_UPLOADS_MAX_TEXT_CHARS;

  const { text, truncated } = truncateText(normalized, maxTextChars);
  return {
    name: attachment.name?.trim() || "document",
    text,
    truncated,
  };
}

export async function extractDocumentTextFromBuffer(
  attachment: {
    name: string | null | undefined;
    buffer: Buffer;
    mediaType: string;
  },
  options: ParseDocumentOptions = {}
): Promise<ParsedDocument> {
  if (!isDocumentMimeType(attachment.mediaType)) {
    throw new Error("Unsupported document type");
  }

  let rawText = "";
  switch (attachment.mediaType) {
    case "application/pdf":
      rawText = await parsePdf(attachment.buffer);
      break;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      rawText = await parseDocx(attachment.buffer);
      break;
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      rawText = await parseSpreadsheet(attachment.buffer);
      break;
    default:
      rawText = "";
  }

  const normalized = normalizeText(rawText);
  if (!normalized) {
    throw new Error("No extractable text found");
  }

  const maxTextChars =
    typeof options.maxTextChars === "number" && options.maxTextChars > 0
      ? Math.trunc(options.maxTextChars)
      : DOCUMENT_UPLOADS_MAX_TEXT_CHARS;

  const { text, truncated } = truncateText(normalized, maxTextChars);
  return {
    name: attachment.name?.trim() || "document",
    text,
    truncated,
  };
}
