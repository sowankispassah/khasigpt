import "server-only";

import { get, put } from "@vercel/blob";
import { DOCUMENT_UPLOADS_MAX_BYTES } from "@/lib/uploads/document-uploads";

// Preserve legacy pathnames when migrating. Historical signed URLs can then
// resolve to the private copy without rewriting every stored message.
export function isDocumentStorageKey(key: string) {
  return /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(pdf|docx)$/.test(key);
}

export function isPrivateImageStorageKey(key: string) {
  return /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(key) ||
    /^generated-images\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(key);
}

export function isPrivateFileStorageKey(key: string) {
  return isDocumentStorageKey(key) || isPrivateImageStorageKey(key);
}

function storageOptions() {
  const storeId = (process.env.CHAT_DOCUMENT_BLOB_STORE_ID ?? process.env.CHAT_DOCUMENT_DEV_BLOB_STORE_ID)?.trim();
  const token = process.env.CHAT_DOCUMENT_BLOB_READ_WRITE_TOKEN?.trim();
  if (!storeId && !token) throw new Error("Private document storage is not configured.");
  return { storeId, token };
}

export async function putPrivateDocument(key: string, buffer: Buffer, contentType: string) {
  if (!isDocumentStorageKey(key)) throw new Error("Invalid document key.");
  return putPrivateFile(key, buffer, contentType);
}

export async function putPrivateFile(key: string, buffer: Buffer, contentType: string) {
  if (!isPrivateFileStorageKey(key)) throw new Error("Invalid file key.");
  if (buffer.byteLength > privateFileMaxBytes(key)) throw new Error("File is too large.");
  return put(key, buffer, { ...storageOptions(), access: "private", contentType });
}

export async function getPrivateDocument(key: string, signal?: AbortSignal) {
  if (!isDocumentStorageKey(key)) return null;
  return getPrivateFile(key, signal);
}

export async function getPrivateFile(key: string, signal?: AbortSignal) {
  if (!isPrivateFileStorageKey(key)) return null;
  return get(key, {
    ...storageOptions(), access: "private", useCache: false,
    abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
}

export async function readPrivateDocument(key: string) {
  if (!isDocumentStorageKey(key)) throw new Error("Invalid document key.");
  return readPrivateFile(key);
}

export async function readPrivateFile(key: string) {
  const result = await getPrivateFile(key);
  if (!result || result.statusCode !== 200) throw new Error("Document not found.");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    const maxBytes = privateFileMaxBytes(key);
    if (result.blob.size > maxBytes) throw new Error("Document is too large.");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("Document is too large.");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function privateFileMaxBytes(key: string) {
  return key.startsWith("generated-images/") ? 10 * 1024 * 1024 : DOCUMENT_UPLOADS_MAX_BYTES;
}
