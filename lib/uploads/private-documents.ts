import "server-only";

import { get, put } from "@vercel/blob";
import { DOCUMENT_UPLOADS_MAX_BYTES } from "@/lib/uploads/document-uploads";

// Preserve legacy pathnames when migrating. Historical signed URLs can then
// resolve to the private copy without rewriting every stored message.
export function isDocumentStorageKey(key: string) {
  return /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(pdf|docx)$/.test(key);
}

function storageOptions() {
  const storeId = (process.env.CHAT_DOCUMENT_BLOB_STORE_ID ?? process.env.CHAT_DOCUMENT_DEV_BLOB_STORE_ID)?.trim();
  const token = process.env.CHAT_DOCUMENT_BLOB_READ_WRITE_TOKEN?.trim();
  if (!storeId && !token) throw new Error("Private document storage is not configured.");
  return { storeId, token };
}

export async function putPrivateDocument(key: string, buffer: Buffer, contentType: string) {
  if (!isDocumentStorageKey(key)) throw new Error("Invalid document key.");
  return put(key, buffer, { ...storageOptions(), access: "private", contentType });
}

export async function getPrivateDocument(key: string, signal?: AbortSignal) {
  if (!isDocumentStorageKey(key)) return null;
  return get(key, {
    ...storageOptions(), access: "private", useCache: false,
    abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
}

export async function readPrivateDocument(key: string) {
  const result = await getPrivateDocument(key);
  if (!result || result.statusCode !== 200) throw new Error("Document not found.");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (result.blob.size > DOCUMENT_UPLOADS_MAX_BYTES) throw new Error("Document is too large.");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > DOCUMENT_UPLOADS_MAX_BYTES) throw new Error("Document is too large.");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
