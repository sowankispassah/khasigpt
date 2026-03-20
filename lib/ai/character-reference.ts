import "server-only";

import { getDownloadUrl } from "@vercel/blob";
import {
  buildCharacterReference as buildCharacterReferenceCore,
  detectImageMime,
  exceedsReferenceImageSizeLimit,
} from "@/lib/ai/character-reference-core";
import type { ImageInput } from "@/lib/ai/image-types";
import {
  getCharacterForImageGeneration,
  getCharacterMatchCandidates,
  listCharacterAliasIndex,
} from "@/lib/db/queries";
import type { CharacterRefImage } from "@/lib/db/schema";
import { normalizeCharacterText } from "./character-normalize";

export * from "./character-reference-core";

const ALIAS_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const REF_IMAGE_CACHE_TTL_MS = 2 * 60 * 1000;
const SIGNED_URL_CACHE_TTL_MS = 5 * 60 * 1000;

type AliasIndexCache = {
  loadedAt: number;
  entries: Awaited<ReturnType<typeof listCharacterAliasIndex>>;
};

type ReferenceImageCacheEntry = {
  expiresAt: number;
  value: ImageInput;
};

type SignedUrlCacheEntry = {
  expiresAt: number;
  value: string;
};

const globalCache = globalThis as {
  __characterAliasIndexCache?: AliasIndexCache;
  __characterRefImageCache?: Map<string, ReferenceImageCacheEntry>;
  __characterSignedUrlCache?: Map<string, SignedUrlCacheEntry>;
};

async function getAliasIndexCached() {
  const now = Date.now();
  const cached = globalCache.__characterAliasIndexCache;
  if (cached && now - cached.loadedAt < ALIAS_INDEX_CACHE_TTL_MS) {
    return cached.entries;
  }

  const entries = await listCharacterAliasIndex();
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      aliasNormalized: normalizeCharacterText(entry.aliasNormalized),
    }))
    .filter((entry) => entry.aliasNormalized.length > 0);

  globalCache.__characterAliasIndexCache = {
    loadedAt: now,
    entries: normalizedEntries,
  };

  return normalizedEntries;
}

function getReferenceImageCache() {
  if (!globalCache.__characterRefImageCache) {
    globalCache.__characterRefImageCache = new Map();
  }
  return globalCache.__characterRefImageCache;
}

function getSignedUrlCache() {
  if (!globalCache.__characterSignedUrlCache) {
    globalCache.__characterSignedUrlCache = new Map();
  }
  return globalCache.__characterSignedUrlCache;
}

function getReferenceCacheKey(ref: CharacterRefImage): string | null {
  return ref.imageId ?? ref.storageKey ?? ref.url ?? null;
}

async function resolveReferenceImageUrl(
  ref: CharacterRefImage
): Promise<string | null> {
  if (ref.url) {
    return ref.url;
  }

  const storageKey = ref.storageKey ?? ref.imageId;
  if (!storageKey) {
    return null;
  }

  const signedUrlCache = getSignedUrlCache();
  const cached = signedUrlCache.get(storageKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const resolved = getDownloadUrl(storageKey);
    signedUrlCache.set(storageKey, {
      value: resolved,
      expiresAt: now + SIGNED_URL_CACHE_TTL_MS,
    });
    return resolved;
  } catch (error) {
    console.error("Failed to resolve character reference image URL", error);
    return null;
  }
}

async function fetchReferenceImage(
  ref: CharacterRefImage,
  abortSignal?: AbortSignal
): Promise<ImageInput | null> {
  const cacheKey = getReferenceCacheKey(ref);
  const referenceCache = getReferenceImageCache();
  if (cacheKey) {
    const cached = referenceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const url = await resolveReferenceImageUrl(ref);
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: abortSignal,
    });
    if (!response.ok) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (exceedsReferenceImageSizeLimit(buffer)) {
      console.error("Character reference image exceeded size limit", {
        url,
        bytes: buffer.byteLength,
      });
      return null;
    }

    const detected = detectImageMime(buffer, ref.mimeType ?? null);
    if (!detected) {
      return null;
    }

    const imageInput = {
      data: Buffer.from(buffer).toString("base64"),
      mediaType: detected,
    };

    if (cacheKey) {
      referenceCache.set(cacheKey, {
        value: imageInput,
        expiresAt: Date.now() + REF_IMAGE_CACHE_TTL_MS,
      });
    }

    return imageInput;
  } catch (error) {
    console.error("Failed to fetch character reference image", error);
    return null;
  }
}

export async function buildCharacterReference({
  prompt,
  abortSignal,
  deps,
}: {
  prompt: string;
  abortSignal?: AbortSignal;
  deps?: import("./character-reference-core").CharacterReferenceDeps;
}) {
  return buildCharacterReferenceCore({
    prompt,
    abortSignal,
    deps: {
      listAliasIndex: deps?.listAliasIndex ?? getAliasIndexCached,
      getCharactersByIds:
        deps?.getCharactersByIds ?? getCharacterMatchCandidates,
      getCharacterById: deps?.getCharacterById ?? getCharacterForImageGeneration,
      fetchReferenceImage: deps?.fetchReferenceImage ?? fetchReferenceImage,
    },
  });
}
