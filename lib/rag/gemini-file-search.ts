import "server-only";

import { ChatSDKError } from "@/lib/errors";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_UPLOAD_BASE_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta";

type GeminiFile = {
  name: string;
  uri?: string;
  mimeType?: string;
  displayName?: string;
};

type GeminiDocument = {
  name: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
  state?: string;
  customMetadata?: GeminiFileSearchCustomMetadata[];
};

type ListDocumentsResponse = {
  documents?: GeminiDocument[];
  nextPageToken?: string;
};

type GeminiOperation = {
  name: string;
  done?: boolean;
  response?: unknown;
  error?: { message?: string } | null;
};

export type GeminiFileSearchCustomMetadata = {
  key: string;
  stringValue?: string;
  numericValue?: number;
  stringListValue?: { values: string[] };
};

export function getGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    null
  );
}

export function getGeminiFileSearchStoreName(): string | null {
  const store = process.env.GEMINI_FILE_SEARCH_STORE_NAME ?? null;
  if (!store) {
    return null;
  }
  return store.startsWith("fileSearchStores/") ? store : `fileSearchStores/${store}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length ? text : response.statusText;
  } catch {
    return response.statusText;
  }
}

function ensureApiKey(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "Missing GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY."
    );
  }
  return apiKey;
}

export async function uploadFileResumable({
  bytes,
  mimeType,
  displayName,
}: {
  bytes: Uint8Array;
  mimeType: string;
  displayName: string;
}): Promise<GeminiFile> {
  const apiKey = ensureApiKey();
  const startResponse = await fetch(`${GEMINI_UPLOAD_BASE_URL}/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        displayName,
      },
    }),
  });

  if (!startResponse.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini file upload start failed (${startResponse.status}): ${await readErrorBody(startResponse)}`
    );
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new ChatSDKError(
      "bad_request:api",
      "Gemini resumable upload URL missing from response headers."
    );
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini file upload finalize failed (${uploadResponse.status}): ${await readErrorBody(uploadResponse)}`
    );
  }

  const payload = (await uploadResponse.json().catch(() => null)) as
    | { file?: GeminiFile }
    | null;
  const file = payload?.file;
  if (!file?.name) {
    throw new ChatSDKError(
      "bad_request:api",
      "Gemini file upload finalize returned an invalid payload."
    );
  }

  return file;
}

export async function deleteGeminiFile(fileName: string) {
  const apiKey = ensureApiKey();
  const response = await fetch(`${GEMINI_API_BASE_URL}/${fileName}`, {
    method: "DELETE",
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini file delete failed (${response.status}): ${await readErrorBody(response)}`
    );
  }
}

export async function importFileToSearchStore({
  fileSearchStoreName,
  fileName,
  customMetadata,
}: {
  fileSearchStoreName: string;
  fileName: string;
  customMetadata?: GeminiFileSearchCustomMetadata[];
}): Promise<GeminiOperation> {
  const apiKey = ensureApiKey();
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/${fileSearchStoreName}:importFile`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName,
        ...(customMetadata?.length ? { customMetadata } : {}),
      }),
    }
  );

  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini importFile failed (${response.status}): ${await readErrorBody(response)}`
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | GeminiOperation
    | null;

  if (!payload?.name) {
    throw new ChatSDKError(
      "bad_request:api",
      "Gemini importFile returned an invalid operation payload."
    );
  }

  return payload;
}

export async function getFileSearchOperation(
  name: string
): Promise<GeminiOperation> {
  const apiKey = ensureApiKey();
  const response = await fetch(`${GEMINI_API_BASE_URL}/${name}`, {
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini operation.get failed (${response.status}): ${await readErrorBody(response)}`
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | GeminiOperation
    | null;

  if (!payload?.name) {
    throw new ChatSDKError(
      "bad_request:api",
      "Gemini operation.get returned an invalid payload."
    );
  }

  return payload;
}

export async function waitForFileSearchOperation({
  operationName,
  timeoutMs = 120_000,
  pollIntervalMs = 1000,
}: {
  operationName: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<GeminiOperation> {
  const deadline = Date.now() + timeoutMs;

  // First fetch ensures we have a fresh state even if the caller passed an old snapshot.
  let current = await getFileSearchOperation(operationName);

  while (!current.done) {
    if (Date.now() >= deadline) {
      throw new ChatSDKError(
        "bad_request:api",
        `Gemini file search operation timed out after ${timeoutMs}ms (${operationName}).`
      );
    }
    await sleep(pollIntervalMs);
    current = await getFileSearchOperation(operationName);
  }

  if (current.error?.message) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini file search operation failed: ${current.error.message}`
    );
  }

  return current;
}

async function listFileSearchDocuments({
  fileSearchStoreName,
  pageSize = 20,
  pageToken,
}: {
  fileSearchStoreName: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<ListDocumentsResponse> {
  const apiKey = ensureApiKey();
  const url = new URL(
    `${GEMINI_API_BASE_URL}/${fileSearchStoreName}/documents`
  );
  const normalizedPageSize = Math.min(20, Math.max(1, Math.floor(pageSize)));
  url.searchParams.set("pageSize", String(normalizedPageSize));
  url.searchParams.set("page_size", String(normalizedPageSize));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("page_token", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "x-goog-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini documents.list failed (${response.status}): ${await readErrorBody(response)}`
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ListDocumentsResponse
    | null;
  return payload ?? {};
}

function documentHasStringMetadata({
  document,
  key,
  value,
}: {
  document: GeminiDocument;
  key: string;
  value: string;
}): boolean {
  const metadata = document.customMetadata ?? [];
  if (!Array.isArray(metadata) || metadata.length === 0) {
    return false;
  }
  return metadata.some(
    (entry) => entry?.key === key && entry?.stringValue === value
  );
}

export async function findFileSearchDocumentNameByRagEntryId({
  fileSearchStoreName,
  ragEntryId,
  timeoutMs = 15_000,
  pollIntervalMs = 1000,
}: {
  fileSearchStoreName: string;
  ragEntryId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let pageToken: string | undefined = undefined;
    let bestDocument: GeminiDocument | null = null;

    while (true) {
      const page = await listFileSearchDocuments({
        fileSearchStoreName,
        pageToken,
      });

      const documents = Array.isArray(page.documents) ? page.documents : [];
      for (const document of documents) {
        if (
          document?.name &&
          document.name.includes("/documents/") &&
          documentHasStringMetadata({
            document,
            key: "rag_entry_id",
            value: ragEntryId,
          })
        ) {
          if (!bestDocument) {
            bestDocument = document;
            continue;
          }
          const bestTime = Date.parse(bestDocument.createTime ?? "");
          const currentTime = Date.parse(document.createTime ?? "");
          if (!Number.isFinite(bestTime) || currentTime > bestTime) {
            bestDocument = document;
          }
        }
      }

      pageToken =
        typeof page.nextPageToken === "string" && page.nextPageToken.length > 0
          ? page.nextPageToken
          : undefined;
      if (!pageToken) {
        break;
      }
    }

    if (bestDocument?.name) {
      return bestDocument.name;
    }

    await sleep(pollIntervalMs);
  }

  return null;
}

export function extractDocumentNameFromOperation(
  operation: GeminiOperation
): string | null {
  const response = operation.response as any;
  if (!response) {
    return null;
  }

  const candidates = [
    response?.documentName,
    response?.document,
    response?.name,
    response?.document?.name,
    response?.importedDocument?.name,
    response?.importedDocumentName,
    response?.resource?.name,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.includes("/documents/")) {
      return value;
    }
  }

  return null;
}

export async function deleteFileSearchDocument(documentName: string) {
  const apiKey = ensureApiKey();
  const response = await fetch(
    `${GEMINI_API_BASE_URL}/${documentName}?force=true`,
    {
      method: "DELETE",
      headers: {
        "x-goog-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Gemini document delete failed (${response.status}): ${await readErrorBody(response)}`
    );
  }
}
