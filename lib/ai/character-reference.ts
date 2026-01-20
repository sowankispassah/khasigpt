import "server-only";

import { getDownloadUrl } from "@vercel/blob";
import { normalizeCharacterText } from "@/lib/ai/character-normalize";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from "@/lib/ai/image-constants";
import type { ImageInput } from "@/lib/ai/image-types";
import {
  getCharacterForImageGeneration,
  getCharacterMatchCandidates,
  listCharacterAliasIndex,
} from "@/lib/db/queries";
import type { CharacterRefImage } from "@/lib/db/schema";

export const MAX_CHARACTER_REFS = 3;
export const MAX_MATCHED_CHARACTERS = 3;
export const MAX_TOTAL_CHARACTER_REFS =
  MAX_CHARACTER_REFS * MAX_MATCHED_CHARACTERS;

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
  matchedCharacterIds?: string[];
  matchedAliases?: string[];
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
  const matches = await detectCharacters({
    prompt,
    aliasIndex,
    getCharactersByIds,
    maxMatches: 1,
  });

  return matches[0] ?? null;
}

export async function detectCharacters({
  prompt,
  aliasIndex,
  getCharactersByIds,
  maxMatches = MAX_MATCHED_CHARACTERS,
}: {
  prompt: string;
  aliasIndex: CharacterAliasIndexEntry[];
  getCharactersByIds?: (ids: string[]) => Promise<CharacterMatchCandidate[]>;
  maxMatches?: number;
}): Promise<CharacterMatch[]> {
  const normalizedPrompt = normalizeCharacterText(prompt);
  const matches = findAliasMatches(normalizedPrompt, aliasIndex);
  if (!matches.length) {
    return [];
  }

  if (!hasIdentityIntent(normalizedPrompt)) {
    return [];
  }

  const uniqueCharacterIds = Array.from(
    new Set(matches.map((match) => match.characterId))
  );

  const matchedAliases = new Map<string, string>();
  const aliasLengths = new Map<string, number>();

  for (const characterId of uniqueCharacterIds) {
    const matchedAlias = pickLongestAliasForCharacter(matches, characterId);
    if (!matchedAlias) {
      continue;
    }
    matchedAliases.set(characterId, matchedAlias);
    aliasLengths.set(characterId, matchedAlias.length);
  }

  if (matchedAliases.size === 0) {
    return [];
  }

  const candidates = getCharactersByIds
    ? await getCharactersByIds(uniqueCharacterIds)
    : [];
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );

  const ranked = Array.from(matchedAliases.entries())
    .map(([characterId, matchedAlias]) => {
      const candidate = candidateById.get(characterId);
      return {
        characterId,
        matchedAlias,
        aliasLength: aliasLengths.get(characterId) ?? matchedAlias.length,
        priority: candidate?.priority ?? 0,
        refCount: candidate?.refImages.length ?? 0,
        enabled: candidate?.enabled ?? true,
      };
    })
    .filter((entry) => entry.enabled);

  if (!ranked.length) {
    return [];
  }

  ranked.sort((a, b) => {
    const aliasDiff = b.aliasLength - a.aliasLength;
    if (aliasDiff !== 0) {
      return aliasDiff;
    }

    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return b.refCount - a.refCount;
  });

  return ranked
    .slice(0, Math.max(1, maxMatches))
    .map(({ characterId, matchedAlias }) => ({
      characterId,
      matchedAlias,
    }));
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
  characters: CharacterForImageGeneration[]
) {
  let finalPrompt = basePrompt;

  const profileLines: string[] = [];
  const styleLines: string[] = [];
  const negativeLines: string[] = [];

  for (const character of characters) {
    const profileParts = [
      character.gender ? `gender: ${character.gender}` : null,
      character.height ? `height: ${character.height}` : null,
      character.weight ? `weight: ${character.weight}` : null,
      character.complexion ? `skin tone: ${character.complexion}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    if (profileParts.length > 0) {
      profileLines.push(
        `${character.canonicalName}: ${profileParts.join(", ")}`
      );
    }
    if (character.lockedPrompt) {
      styleLines.push(
        `${character.canonicalName}: ${character.lockedPrompt}`
      );
    }
    if (character.negativePrompt) {
      negativeLines.push(
        `${character.canonicalName}: ${character.negativePrompt}`
      );
    }
  }

  if (profileLines.length > 0) {
    finalPrompt = `${finalPrompt}\n\nCHARACTER PROFILES:\n${profileLines.join(
      "\n"
    )}`;
  }
  if (styleLines.length > 0) {
    finalPrompt = `${finalPrompt}\n\nSYSTEM STYLE/CONSTRAINTS:\n${styleLines.join(
      "\n"
    )}`;
  }
  if (negativeLines.length > 0) {
    finalPrompt = `${finalPrompt}\n\nNEGATIVE CONSTRAINTS:\n${negativeLines.join(
      "\n"
    )}`;
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

  const characterMatches = await detectCharacters({
    prompt,
    aliasIndex,
    getCharactersByIds: deps?.getCharactersByIds ?? getCharacterMatchCandidates,
  });

  if (!characterMatches.length) {
    return { prompt };
  }

  const matchedCharacterIds = characterMatches.map(
    (match) => match.characterId
  );
  const matchedAliases = characterMatches.map((match) => match.matchedAlias);

  const fetchCharacter =
    deps?.getCharacterById ?? getCharacterForImageGeneration;
  const characterRecords = await Promise.all(
    characterMatches.map((match) => fetchCharacter(match.characterId))
  );
  const matchedCharacters = characterMatches
    .map((match, index) => ({
      match,
      character: characterRecords[index],
    }))
    .filter(
      (
        entry
      ): entry is {
        match: CharacterMatch;
        character: CharacterForImageGeneration;
      } => Boolean(entry.character?.enabled)
    );

  if (!matchedCharacters.length) {
    return {
      prompt,
      matchedCharacterId: characterMatches[0]?.characterId,
      matchedAlias: characterMatches[0]?.matchedAlias,
      matchedCharacterIds,
      matchedAliases,
    };
  }

  const selectedRefs = matchedCharacters.flatMap(({ character }) =>
    selectRefImages(character.refImages ?? [])
  );
  if (!selectedRefs.length) {
    return {
      prompt,
      matchedCharacterId: matchedCharacters[0]?.character.id,
      matchedAlias: matchedCharacters[0]?.match.matchedAlias,
      matchedCharacterIds,
      matchedAliases,
    };
  }

  const cappedRefs = selectedRefs.slice(0, MAX_TOTAL_CHARACTER_REFS);

  const fetcher = deps?.fetchReferenceImage ?? fetchReferenceImage;
  const referenceImages = await Promise.all(
    cappedRefs.map((ref) => fetcher(ref, abortSignal))
  );

  if (referenceImages.some((image) => !image)) {
    console.error("Failed to load character reference images", {
      matchedCharacterIds,
      matchedAliases,
    });
    return { prompt };
  }

  return {
    prompt: applyCharacterConstraints(
      prompt,
      matchedCharacters.map(({ character }) => character)
    ),
    referenceImages: referenceImages as ImageInput[],
    matchedCharacterId: matchedCharacters[0]?.character.id,
    matchedAlias: matchedCharacters[0]?.match.matchedAlias,
    matchedCharacterIds,
    matchedAliases,
  };
}
