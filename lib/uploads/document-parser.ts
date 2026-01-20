import {
  DOCUMENT_UPLOADS_MAX_TEXT_CHARS,
  isDocumentMimeType,
} from "@/lib/uploads/document-uploads";
import { pathToFileURL } from "node:url";

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

let pdfWorkerReady = false;

const normalizeText = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const truncateText = (value: string) => {
  if (value.length <= DOCUMENT_UPLOADS_MAX_TEXT_CHARS) {
    return { text: value, truncated: false };
  }
  return {
    text: value.slice(0, DOCUMENT_UPLOADS_MAX_TEXT_CHARS),
    truncated: true,
  };
};

async function fetchFileBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function ensurePdfWorkerReady() {
  if (pdfWorkerReady) {
    return;
  }
  const [{ PDFParse }, worker, canvas] = await Promise.all([
    import("pdf-parse"),
    import("pdf-parse/worker"),
    import("@napi-rs/canvas"),
  ]);
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = canvas.DOMMatrix as unknown as typeof DOMMatrix;
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = canvas.ImageData as unknown as typeof ImageData;
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = canvas.Path2D as unknown as typeof Path2D;
  }
  if (worker.getPath && typeof PDFParse?.setWorker === "function") {
    const workerPath = worker.getPath();
    const workerUrl = workerPath.startsWith("data:")
      ? workerPath
      : pathToFileURL(workerPath).toString();
    PDFParse.setWorker(workerUrl);
  }
  pdfWorkerReady = true;
}

async function parsePdf(buffer: Buffer) {
  await ensurePdfWorkerReady();
  const { PDFParse } = await import("pdf-parse");
  if (!PDFParse) {
    throw new Error("PDF parser unavailable");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
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
  attachment: DocumentAttachment
): Promise<ParsedDocument> {
  if (!isDocumentMimeType(attachment.mediaType)) {
    throw new Error("Unsupported document type");
  }

  const buffer = await fetchFileBuffer(attachment.url);
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

  const { text, truncated } = truncateText(normalized);
  return {
    name: attachment.name?.trim() || "document",
    text,
    truncated,
  };
}
