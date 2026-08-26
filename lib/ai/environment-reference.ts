import "server-only";

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import {
  type EnvironmentReferenceDecision,
  emptyEnvironmentReferenceDecision,
  extractJsonObject,
  inferKnownEnvironmentDecision,
  parseEnvironmentReferenceDecision,
} from "@/lib/ai/environment-reference-core";
import type { ImageInput } from "@/lib/ai/image-types";
import { resolveLanguageModel } from "@/lib/ai/providers";
import type {
  EnvironmentReferenceContext,
  NormalizedVisualReference,
  PersistedEnvironmentReference,
} from "@/lib/ai/visual-reference-types";
import { IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY } from "@/lib/constants";
import { getAppSetting, getModelConfigById } from "@/lib/db/queries";
import {
  buildVisualSearchQuery,
  rankVisualSearchCandidates,
  type VisualSearchCandidate,
} from "@/lib/web-search/image-search-core";
import { visualImageSearchService } from "@/lib/web-search/image-service";

const MAX_ENVIRONMENT_REFERENCES = 3;
const MAX_DOWNLOAD_CANDIDATES = 6;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const REFERENCE_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLASSIFIER_MODEL = "gemini-flash-lite-latest";

type LoadedWebImage = {
  image: ImageInput;
  width: number;
  height: number;
  sha256: string;
};

export type EnvironmentReferenceResolution = {
  decision: EnvironmentReferenceDecision;
  references: NormalizedVisualReference[];
  context: EnvironmentReferenceContext | null;
  candidateCount: number;
  searchCallCount: number;
  reusedContext: boolean;
};

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIp(address: string) {
  if (isIP(address) === 4) {
    return isPrivateIpv4(address);
  }
  const normalized = address.toLocaleLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    (normalized.startsWith("::ffff:") &&
      isPrivateIpv4(normalized.slice("::ffff:".length)))
  );
}

async function assertSafeRemoteUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("unsafe_visual_reference_url");
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("unsafe_visual_reference_host");
  }
  return url;
}

function detectImageMediaType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function fetchValidatedWebImage(
  initialUrl: string,
  abortSignal?: AbortSignal
): Promise<LoadedWebImage> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteUrl(currentUrl);
    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9",
        "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)",
      },
      signal: AbortSignal.any(
        [abortSignal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)].filter(
          (signal): signal is AbortSignal => Boolean(signal)
        )
      ),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("visual_reference_redirect_rejected");
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`visual_reference_http_${response.status}`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REFERENCE_BYTES) {
      throw new Error("visual_reference_too_large");
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_REFERENCE_BYTES) {
      throw new Error("visual_reference_invalid_size");
    }
    const bytes = new Uint8Array(buffer);
    const mediaType = detectImageMediaType(bytes);
    if (!mediaType) {
      throw new Error("visual_reference_unsupported_type");
    }
    const { loadImage } = await import("@napi-rs/canvas");
    const decoded = await loadImage(Buffer.from(buffer));
    if (decoded.width < 480 || decoded.height < 320) {
      throw new Error("visual_reference_dimensions_too_small");
    }
    return {
      image: {
        data: Buffer.from(buffer).toString("base64"),
        mediaType,
      },
      width: decoded.width,
      height: decoded.height,
      sha256: createHash("sha256").update(Buffer.from(buffer)).digest("hex"),
    };
  }
  throw new Error("visual_reference_unavailable");
}

async function resolveClassifierModel() {
  const configuredModelId = await getAppSetting<string | null>(
    IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY
  );
  if (configuredModelId?.trim()) {
    const config = await getModelConfigById({ id: configuredModelId.trim() });
    if (config?.isEnabled) {
      return resolveLanguageModel(config);
    }
  }
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return createGoogleGenerativeAI({ apiKey }).languageModel(
    process.env.IMAGE_VISUAL_REFERENCE_CLASSIFIER_MODEL?.trim() ||
      DEFAULT_CLASSIFIER_MODEL
  );
}

async function classifyEnvironmentEntity({
  prompt,
  abortSignal,
}: {
  prompt: string;
  abortSignal?: AbortSignal;
}) {
  const known = inferKnownEnvironmentDecision(prompt);
  if (known) {
    return known;
  }
  const model = await resolveClassifierModel();
  if (!model) {
    return emptyEnvironmentReferenceDecision();
  }
  const result = await generateText({
    model,
    temperature: 0,
    abortSignal,
    messages: [
      {
        role: "system",
        content: [
          "Classify whether an image-generation prompt needs a real-world visual environment reference.",
          "Only select a specific non-person PLACE, LANDMARK, BUILDING, VENUE, or NATURAL_LOCATION.",
          "Never select a person, face, character, animal, vehicle, generic concept, fictional place, brand-only logo, or user-supplied image.",
          "Mark ambiguous place names such as Springfield ambiguous unless the prompt supplies enough geographic context.",
          "The search entity must describe the real place as it exists, not the requested creative transformation.",
          "For a future scene, do not include the future year as historicalPeriod. For an explicitly historical scene, set historicalPeriod to the requested past year or era.",
          "Return JSON only with: shouldSearch, entity, entityType, geographicContext, historicalPeriod, ambiguous.",
        ].join(" "),
      },
      { role: "user", content: prompt.slice(0, 2000) },
    ],
  });
  return parseEnvironmentReferenceDecision(extractJsonObject(result.text));
}

function persistedReference(
  reference: NormalizedVisualReference
): PersistedEnvironmentReference | null {
  if (
    reference.source !== "WEB" ||
    (reference.type !== "ENVIRONMENT" && reference.type !== "LANDMARK") ||
    !(
      reference.imageUrl &&
      reference.entity &&
      reference.searchQuery &&
      reference.retrievedAt
    )
  ) {
    return null;
  }
  const { image: _image, ...persisted } = reference;
  return persisted as PersistedEnvironmentReference;
}

async function loadRankedCandidates({
  candidates,
  decision,
  query,
  maxReferences,
  abortSignal,
}: {
  candidates: Array<{ candidate: VisualSearchCandidate; score: number }>;
  decision: EnvironmentReferenceDecision;
  query: string;
  maxReferences: number;
  abortSignal?: AbortSignal;
}) {
  const references: NormalizedVisualReference[] = [];
  const seenHashes = new Set<string>();
  const retrievedAt = new Date().toISOString();
  for (const { candidate, score } of candidates.slice(0, MAX_DOWNLOAD_CANDIDATES)) {
    if (references.length >= maxReferences) {
      break;
    }
    try {
      const loaded = await fetchValidatedWebImage(candidate.imageUrl, abortSignal);
      if (seenHashes.has(loaded.sha256)) {
        continue;
      }
      seenHashes.add(loaded.sha256);
      references.push({
        type: decision.entityType === "LANDMARK" ? "LANDMARK" : "ENVIRONMENT",
        source: "WEB",
        image: loaded.image,
        entity: decision.entity ?? query,
        imageUrl: candidate.imageUrl,
        sourceUrl: candidate.sourceUrl,
        sourceDomain: candidate.sourceDomain,
        searchQuery: query,
        retrievedAt,
        relevance: Math.round(score),
        width: loaded.width,
        height: loaded.height,
      });
    } catch (error) {
      console.warn("[visual-reference/download] Candidate rejected.", {
        domain: candidate.sourceDomain ?? null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return references;
}

function emptyResolution(
  decision = emptyEnvironmentReferenceDecision()
): EnvironmentReferenceResolution {
  return {
    decision,
    references: [],
    context: null,
    candidateCount: 0,
    searchCallCount: 0,
    reusedContext: false,
  };
}

export async function resolveEnvironmentReferences({
  prompt,
  allowSearch,
  skipNewSearch,
  previousContext,
  maxReferences = MAX_ENVIRONMENT_REFERENCES,
  abortSignal,
}: {
  prompt: string;
  allowSearch: boolean;
  skipNewSearch: boolean;
  previousContext?: EnvironmentReferenceContext | null;
  maxReferences?: number;
  abortSignal?: AbortSignal;
}): Promise<EnvironmentReferenceResolution> {
  const resolvedLimit = Math.min(
    MAX_ENVIRONMENT_REFERENCES,
    Math.max(0, Math.floor(maxReferences))
  );
  if (!allowSearch || resolvedLimit === 0) {
    return emptyResolution();
  }

  if (previousContext?.references.length) {
    const retrievedAt = Date.parse(previousContext.retrievedAt);
    if (
      Number.isFinite(retrievedAt) &&
      Date.now() - retrievedAt <= REFERENCE_CONTEXT_TTL_MS
    ) {
      const decision: EnvironmentReferenceDecision = {
        shouldSearch: true,
        entity: previousContext.entity,
        entityType: previousContext.entityType,
        geographicContext: null,
        historicalPeriod: null,
        ambiguous: false,
      };
      const candidates = previousContext.references.map((reference) => ({
        candidate: {
          imageUrl: reference.imageUrl,
          sourceUrl: reference.sourceUrl ?? reference.imageUrl,
          sourceDomain: reference.sourceDomain,
          title: reference.entity,
          width: reference.width,
          height: reference.height,
          provider: "google_custom_search" as const,
        },
        score: reference.relevance ?? 100,
      }));
      const references = await loadRankedCandidates({
        candidates,
        decision,
        query: previousContext.searchQuery,
        maxReferences: resolvedLimit,
        abortSignal,
      });
      if (references.length) {
        return {
          decision,
          references,
          context: previousContext,
          candidateCount: candidates.length,
          searchCallCount: 0,
          reusedContext: true,
        };
      }
    }
  }

  if (skipNewSearch) {
    return emptyResolution();
  }

  let decision: EnvironmentReferenceDecision;
  try {
    decision = await classifyEnvironmentEntity({ prompt, abortSignal });
  } catch (error) {
    console.warn("[visual-reference/classify] Falling back without web references.", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return emptyResolution();
  }
  if (!(decision.shouldSearch && decision.entity && decision.entityType)) {
    return emptyResolution(decision);
  }

  const query = buildVisualSearchQuery({
    entity: decision.entity,
    geographicContext: decision.geographicContext,
    historicalPeriod: decision.historicalPeriod,
  });
  const candidates = await visualImageSearchService.search(query);
  const ranked = rankVisualSearchCandidates({
    candidates,
    entity: decision.entity,
    limit: MAX_DOWNLOAD_CANDIDATES,
  });
  const references = await loadRankedCandidates({
    candidates: ranked,
    decision,
    query,
    maxReferences: resolvedLimit,
    abortSignal,
  });
  const persisted = references
    .map(persistedReference)
    .filter((reference): reference is PersistedEnvironmentReference => Boolean(reference));
  return {
    decision,
    references,
    context: persisted.length
      ? {
          entity: decision.entity,
          entityType: decision.entityType,
          searchQuery: query,
          retrievedAt: persisted[0]?.retrievedAt ?? new Date().toISOString(),
          references: persisted,
        }
      : null,
    candidateCount: candidates.length,
    searchCallCount: 1,
    reusedContext: false,
  };
}
