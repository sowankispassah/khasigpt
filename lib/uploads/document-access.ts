import "server-only";

import { createBlobToken, verifyBlobToken } from "@/lib/security/blob-token";
import type { ChatMessage } from "@/lib/types";
import { isDocumentMimeType } from "@/lib/uploads/document-uploads";

const ALLOWED_BLOB_HOST_SUFFIXES = [
  "blob.vercel-storage.com",
  "public.blob.vercel-storage.com",
];

const DOWNLOAD_PATHNAME = "/api/files/download";

type ResolveDocumentUrlInput = {
  sourceUrl: string;
  userId: string;
  baseUrl: string;
  isAdmin: boolean;
};

type ResolvedDocumentUrl = {
  blobUrl: string;
  storageKey: string;
};

const isAllowedBlobHost = (hostname: string) =>
  ALLOWED_BLOB_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );

const extractStorageKey = (blobUrl: string): string | null => {
  try {
    const url = new URL(blobUrl);
    const pathname = decodeURIComponent(url.pathname);
    const key = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
};

const isOwnedStorageKey = (storageKey: string, userId: string) =>
  storageKey.startsWith(`uploads/${userId}/`);

export const buildDocumentDownloadUrl = ({
  blobUrl,
  userId,
  baseUrl,
}: {
  blobUrl: string;
  userId: string;
  baseUrl: string;
}) => {
  try {
    const parsed = new URL(blobUrl);
    if (parsed.protocol !== "https:" || !isAllowedBlobHost(parsed.hostname)) {
      return null;
    }
  } catch {
    return null;
  }
  const storageKey = extractStorageKey(blobUrl);
  if (!storageKey) {
    return null;
  }
  let token: string;
  try {
    token = createBlobToken({
      url: blobUrl,
      key: storageKey,
      userId,
      issuedAt: Date.now(),
    });
  } catch {
    return null;
  }
  const downloadUrl = new URL(DOWNLOAD_PATHNAME, baseUrl);
  downloadUrl.searchParams.set("token", token);
  return downloadUrl.toString();
};

export const resolveDocumentBlobUrl = ({
  sourceUrl,
  userId,
  baseUrl,
  isAdmin,
}: ResolveDocumentUrlInput): ResolvedDocumentUrl | null => {
  if (!sourceUrl) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(sourceUrl, baseUrl);
  } catch {
    return null;
  }

  if (resolved.pathname === DOWNLOAD_PATHNAME) {
    const token = resolved.searchParams.get("token");
    if (!token) {
      return null;
    }
    const payload = verifyBlobToken(token);
    if (!payload) {
      return null;
    }
    if (!isAdmin && payload.userId !== userId) {
      return null;
    }
    let payloadUrl: URL;
    try {
      payloadUrl = new URL(payload.url);
    } catch {
      return null;
    }
    if (!isAllowedBlobHost(payloadUrl.hostname)) {
      return null;
    }
    if (!payload.key || !isAdmin && !isOwnedStorageKey(payload.key, userId)) {
      return null;
    }
    const extractedKey = extractStorageKey(payload.url);
    if (!extractedKey || extractedKey !== payload.key) {
      return null;
    }
    return {
      blobUrl: payload.url,
      storageKey: payload.key,
    };
  }

  if (resolved.protocol !== "https:" || !isAllowedBlobHost(resolved.hostname)) {
    return null;
  }
  const storageKey = extractStorageKey(resolved.toString());
  if (!storageKey) {
    return null;
  }
  if (!isAdmin && !isOwnedStorageKey(storageKey, userId)) {
    return null;
  }
  return {
    blobUrl: resolved.toString(),
    storageKey,
  };
};

export const rewriteDocumentUrlsForViewer = ({
  messages,
  viewerUserId,
  isAdmin,
  baseUrl,
}: {
  messages: ChatMessage[];
  viewerUserId: string | null;
  isAdmin: boolean;
  baseUrl: string;
}) => {
  return messages.map((message) => {
    const parts = message.parts?.map((part) => {
      if (part.type !== "file") {
        return part;
      }
      const mediaType = part.mediaType ?? "";
      if (!isDocumentMimeType(mediaType)) {
        return part;
      }
      if (!viewerUserId) {
        return { ...part, url: "" };
      }

      const resolved = resolveDocumentBlobUrl({
        sourceUrl: part.url ?? "",
        userId: viewerUserId,
        baseUrl,
        isAdmin,
      });
      if (!resolved) {
        return { ...part, url: "" };
      }

      const downloadUrl = buildDocumentDownloadUrl({
        blobUrl: resolved.blobUrl,
        userId: viewerUserId,
        baseUrl,
      });
      if (!downloadUrl) {
        return { ...part, url: "" };
      }

      return {
        ...part,
        url: downloadUrl,
      };
    });

    return {
      ...message,
      parts,
    };
  });
};
