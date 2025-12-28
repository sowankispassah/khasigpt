import "server-only";

import { getDownloadUrl } from "@vercel/blob";
import {
  getCharacterForImageGeneration,
  getCharacterMatchCandidates,
  listCharacterAliasIndex,
} from "@/lib/db/queries";
import type { CharacterRefImage } from "@/lib/db/schema";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from "@/lib/ai/image-constants";
import type { ImageInput } from "@/lib/ai/image-types";
import { normalizeCharacterText } from "@/lib/ai/character-normalize";

export const MAX_CHARACTER_REFS = 3;

const ALIAS_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const REF_IMAGE_CACHE_TTL_MS = 2 * 60 * 1000;
const SIGNED_URL_CACHE_TTL_MS = 5 * 60 * 1000;

export type CharacterAliasIndexEntry = {
  aliasNormalized: string;
  characterId: string;
};

export type CharacterMatch = {
  characterId: string;
  matchedAlias: string;
};

export type CharacterMatchCandidate = {
  id: string;
  priority: number;
  enabled: boolean;
  refImages: CharacterRefImage[];
};

export type CharacterForImageGeneration = {
  id: string;
  canonicalName: string;
  refImages: CharacterRefImage[];
  lockedPrompt: string | null;
  negativePrompt: string | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  complexion: string | null;
  enabled: boolean;
  priority: number;
};

export type CharacterReferenceDeps = {
  listAliasIndex?: () => Promise<CharacterAliasIndexEntry[]>;
  getCharactersByIds?: (ids: string[]) => Promise<CharacterMatchCandidate[]>;
  getCharacterById?: (id: string) => Promise<CharacterForImageGeneration | null>;
  fetchReferenceImage?: (
    ref: CharacterRefImage,
    abortSignal?: AbortSignal
  ) => Promise<ImageInput | null>;
};

export type CharacterReferenceResult = {
  prompt: string;
  referenceImages?: ImageInput[];
  matchedCharacterId?: string;
  matchedAlias?: string;
};

type AliasIndexCache = {
  loadedAt: number;
  entries: CharacterAliasIndexEntry[];
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

const IDENTITY_PHRASES = [
  "photo of",
  "portrait of",
  "picture of",
  "image of",
  "shot of",
  "render of",
  "illustration of",
  "painting of",
  "sketch of",
  "drawing of",
];

const IDENTITY_TOKENS = new Set(["generate", "show", "realistic", "depict"]);

const STYLE_ONLY_PHRASES = ["style of", "in the style of", "inspired by"];

function hasIdentityIntent(normalizedPrompt: string): boolean {
  if (!normalizedPrompt) {
    return false;
  }

  if (STYLE_ONLY_PHRASES.some((phrase) => normalizedPrompt.includes(phrase))) {
    const hasIdentityPhrase = IDENTITY_PHRASES.some((phrase) =>
      normalizedPrompt.includes(phrase)
    );
    const hasIdentityToken = normalizedPrompt
      .split(" ")
      .some((token) => IDENTITY_TOKENS.has(token));
    if (!hasIdentityPhrase && !hasIdentityToken) {
      return false;
    }
  }

  if (IDENTITY_PHRASES.some((phrase) => normalizedPrompt.includes(phrase))) {
    return true;
  }

  const tokens = normalizedPrompt.split(" ").filter(Boolean);
  if (tokens.some((token) => IDENTITY_TOKENS.has(token))) {
    return true;
  }

  return true;
}

function hasNonNegatedOccurrence(
  tokens: string[],
  aliasTokens: string[]
): boolean {
  if (!tokens.length || !aliasTokens.length) {
    return false;
  }

  const aliasLength = aliasTokens.length;
  for (let index = 0; index <= tokens.length - aliasLength; index += 1) {
    let matches = true;
    for (let offset = 0; offset < aliasLength; offset += 1) {
      if (tokens[index + offset] !== aliasTokens[offset]) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }

    if (index > 0 && tokens[index - 1] === "not") {
      continue;
    }

    return true;
  }

  return false;
}

function findAliasMatches(
  normalizedPrompt: string,
  aliasIndex: CharacterAliasIndexEntry[]
) {
  const matches: Array<
    CharacterAliasIndexEntry & { aliasLength: number }
  > = [];
  if (!normalizedPrompt) {
    return matches;
  }

  const tokens = normalizedPrompt.split(" ").filter(Boolean);
  const paddedPrompt = ` ${normalizedPrompt} `;

  for (const entry of aliasIndex) {
    const alias = entry.aliasNormalized.trim();
    if (!alias) {
      continue;
    }

    if (!paddedPrompt.includes(` ${alias} `)) {
      continue;
    }

    const aliasTokens = alias.split(" ").filter(Boolean);
    if (!hasNonNegatedOccurrence(tokens, aliasTokens)) {
      continue;
    }

    matches.push({
      ...entry,
      aliasLength: alias.length,
    });
  }

  return matches;
}

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

function pickLongestAliasForCharacter(
  matches: Array<CharacterAliasIndexEntry & { aliasLength: number }>,
  characterId: string
): string {
  const filtered = matches
    .filter((match) => match.characterId === characterId)
    .sort((a, b) => b.aliasLength - a.aliasLength);

  return filtered[0]?.aliasNormalized ?? "";
}

export async function detectCharacter({
  prompt,
  aliasIndex,
  getCharactersByIds,
}: {
  prompt: string;
  aliasIndex: CharacterAliasIndexEntry[];
  getCharactersByIds?: (ids: string[]) => Promise<CharacterMatchCandidate[]>;
}): Promise<CharacterMatch | null> {
  const normalizedPrompt = normalizeCharacterText(prompt);
  const matches = findAliasMatches(normalizedPrompt, aliasIndex);
  if (!matches.length) {
    return null;
  }

  if (!hasIdentityIntent(normalizedPrompt)) {
    return null;
  }

  const longestLength = Math.max(...matches.map((match) => match.aliasLength));
  const longestMatches = matches.filter(
    (match) => match.aliasLength === longestLength
  );
  const uniqueCharacterIds = Array.from(
    new Set(longestMatches.map((match) => match.characterId))
  );

  if (uniqueCharacterIds.length === 1) {
    const characterId = uniqueCharacterIds[0];
    const matchedAlias = pickLongestAliasForCharacter(matches, characterId);
    if (!matchedAlias) {
      return null;
    }
    return { characterId, matchedAlias };
  }

  if (!getCharactersByIds) {
    return null;
  }

  const candidates = await getCharactersByIds(uniqueCharacterIds);
  if (!candidates.length) {
    return null;
  }

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const eligibleMatches = longestMatches.filter((match) => {
    const candidate = candidateById.get(match.characterId);
    return candidate ? candidate.enabled : false;
  });

  if (!eligibleMatches.length) {
    return null;
  }

  const sorted = [...eligibleMatches].sort((a, b) => {
    const aCandidate = candidateById.get(a.characterId);
    const bCandidate = candidateById.get(b.characterId);
    const priorityDiff =
      (bCandidate?.priority ?? 0) - (aCandidate?.priority ?? 0);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const refCountDiff =
      (bCandidate?.refImages.length ?? 0) -
      (aCandidate?.refImages.length ?? 0);
    if (refCountDiff !== 0) {
      return refCountDiff;
    }

    return b.aliasLength - a.aliasLength;
  });

  const best = sorted[0];
  if (!best) {
    return null;
  }

  const matchedAlias = pickLongestAliasForCharacter(matches, best.characterId);
  if (!matchedAlias) {
    return null;
  }

  return { characterId: best.characterId, matchedAlias };
}

function parseUpdatedAt(updatedAt: string | null | undefined) {
  if (!updatedAt) {
    return 0;
  }
  const timestamp = Date.parse(updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function selectRefImages(
  refImages: CharacterRefImage[],
  maxRefs = MAX_CHARACTER_REFS
): CharacterRefImage[] {
  if (!Array.isArray(refImages) || refImages.length === 0 || maxRefs <= 0) {
    return [];
  }

  const primaries = refImages.filter((image) => image.isPrimary);
  const pool = primaries.length > 0 ? primaries : refImages;

  const sorted = [...pool].sort((a, b) => {
    const aFace = (a.role ?? "").toLowerCase() === "face";
    const bFace = (b.role ?? "").toLowerCase() === "face";
    if (aFace !== bFace) {
      return aFace ? -1 : 1;
    }

    return parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt);
  });

  return sorted.slice(0, maxRefs);
}

function detectImageMime(
  buffer: ArrayBuffer,
  declaredType?: string | null
): string | null {
  const bytes = new Uint8Array(buffer);
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const detected = isPng ? "image/png" : isJpeg ? "image/jpeg" : null;
  if (detected) {
    return detected;
  }
  if (declaredType && ALLOWED_IMAGE_MEDIA_TYPES.has(declaredType)) {
    return declaredType;
  }
  return null;
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
    if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
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

function applyCharacterConstraints(
  basePrompt: string,
  character: CharacterForImageGeneration
) {
  let finalPrompt = basePrompt;
  const profileParts = [
    character.gender ? `gender: ${character.gender}` : null,
    character.height ? `height: ${character.height}` : null,
    character.weight ? `weight: ${character.weight}` : null,
    character.complexion ? `skin tone: ${character.complexion}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  if (profileParts.length > 0) {
    finalPrompt = `${finalPrompt}\n\nCHARACTER PROFILE: ${profileParts.join(
      ", "
    )}`;
  }
  if (character.lockedPrompt) {
    finalPrompt = `${finalPrompt}\n\nSYSTEM STYLE/CONSTRAINTS: ${character.lockedPrompt}`;
  }
  if (character.negativePrompt) {
    finalPrompt = `${finalPrompt}\n\nNEGATIVE CONSTRAINTS: ${character.negativePrompt}`;
  }
  return finalPrompt;
}

export async function buildCharacterReference({
  prompt,
  abortSignal,
  deps,
}: {
  prompt: string;
  abortSignal?: AbortSignal;
  deps?: CharacterReferenceDeps;
}): Promise<CharacterReferenceResult> {
  const aliasIndex = deps?.listAliasIndex
    ? await deps.listAliasIndex()
    : await getAliasIndexCached();

  if (!aliasIndex.length) {
    return { prompt };
  }

  const characterMatch = await detectCharacter({
    prompt,
    aliasIndex,
    getCharactersByIds: deps?.getCharactersByIds ?? getCharacterMatchCandidates,
  });

  if (!characterMatch) {
    return { prompt };
  }

  const character = deps?.getCharacterById
    ? await deps.getCharacterById(characterMatch.characterId)
    : await getCharacterForImageGeneration(characterMatch.characterId);

  if (!character || !character.enabled) {
    return {
      prompt,
      matchedCharacterId: characterMatch.characterId,
      matchedAlias: characterMatch.matchedAlias,
    };
  }

  const selectedRefImages = selectRefImages(character.refImages ?? []);
  if (!selectedRefImages.length) {
    return {
      prompt,
      matchedCharacterId: character.id,
      matchedAlias: characterMatch.matchedAlias,
    };
  }

  const fetcher = deps?.fetchReferenceImage ?? fetchReferenceImage;
  const referenceImages = await Promise.all(
    selectedRefImages.map((ref) => fetcher(ref, abortSignal))
  );

  if (referenceImages.some((image) => !image)) {
    console.error("Failed to load character reference images", {
      characterId: character.id,
      matchedAlias: characterMatch.matchedAlias,
    });
    return { prompt };
  }

  return {
    prompt: applyCharacterConstraints(prompt, character),
    referenceImages: referenceImages as ImageInput[],
    matchedCharacterId: character.id,
    matchedAlias: characterMatch.matchedAlias,
  };
}
