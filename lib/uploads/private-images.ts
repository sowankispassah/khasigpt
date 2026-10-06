import "server-only";

import type { ChatMessage } from "@/lib/types";
import { resolveDocumentBlobUrl } from "@/lib/uploads/document-access";
import { validateImageBytes } from "@/lib/uploads/image-validation";
import { isPrivateImageStorageKey, readPrivateFile } from "@/lib/uploads/private-documents";

export function imageMimeFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}

export function resolveOwnedImage(sourceUrl: string, userId: string, baseUrl: string, allowHistorical = false) {
  const resolved = resolveDocumentBlobUrl({ sourceUrl, userId, baseUrl, isAdmin: false, allowHistorical });
  return resolved && isPrivateImageStorageKey(resolved.storageKey) ? resolved : null;
}

export async function readOwnedImage(sourceUrl: string, userId: string, baseUrl: string, allowHistorical = false) {
  const resolved = resolveOwnedImage(sourceUrl, userId, baseUrl, allowHistorical);
  if (!resolved) throw new Error("Invalid image attachment.");
  const bytes = await readPrivateFile(resolved.storageKey);
  const mediaType = await validateImageBytes(bytes);
  if (!mediaType) throw new Error("Invalid image attachment.");
  return { bytes, mediaType };
}

// Send bounded owned bytes to the model; never ask a provider to fetch an
// authenticated app URL or send browser/native session credentials to it.
export async function hydratePrivateImageMessages(messages: ChatMessage[], userId: string, baseUrl: string) {
  const latest = messages.at(-1);
  if ((latest?.parts.filter(part => part.type === "file" && part.mediaType.startsWith("image/")).length ?? 0) > 4) throw new Error("Too many image attachments.");
  let retained = 0;
  const result: ChatMessage[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof readOwnedImage>>>();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const parts: ChatMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file" || !part.mediaType.startsWith("image/")) { parts.push(part); continue; }
      if (retained++ >= 4) continue;
      // The isolated browser harness supplies harmless local image fixtures.
      const source = new URL(part.url, baseUrl);
      if (process.env.PLAYWRIGHT === "true" && source.origin === new URL(baseUrl).origin && ["/playwright-upload.png", "/images/mouth%20of%20the%20seine%2C%20monet.jpg"].includes(source.pathname)) { parts.push(part); continue; }
      let image = cache.get(part.url);
      if (!image) { image = await readOwnedImage(part.url, userId, baseUrl, index < messages.length - 1); cache.set(part.url, image); }
      parts.push({ ...part, mediaType: image.mediaType, url: `data:${image.mediaType};base64,${image.bytes.toString("base64")}` });
    }
    result.unshift({ ...message, parts });
  }
  return result;
}
