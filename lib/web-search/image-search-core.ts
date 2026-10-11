export type VisualSearchCandidate = {
  imageUrl: string;
  sourceUrl: string;
  title: string;
  snippet?: string;
  sourceDomain?: string;
  mediaType?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  provider: "google_custom_search" | "wikimedia_commons";
};

const REJECTED_VISUAL_TERMS = /\b(?:advert(?:isement)?|banner|clipart|diagram|drawing|flag|icon|infographic|logo|map|poster|route map|screenshot|social media|vector)\b/i;
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function normalizedTokens(value: string) {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3)
    )
  );
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function scoreVisualSearchCandidate(
  candidate: VisualSearchCandidate,
  entity: string
) {
  const combinedText = `${candidate.title} ${candidate.snippet ?? ""}`;
  if (REJECTED_VISUAL_TERMS.test(combinedText)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (
    candidate.mediaType &&
    !SUPPORTED_MEDIA_TYPES.has(candidate.mediaType.toLocaleLowerCase())
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (
    (candidate.width && candidate.width < 480) ||
    (candidate.height && candidate.height < 320) ||
    (candidate.byteSize && candidate.byteSize > 10 * 1024 * 1024)
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (candidate.width && candidate.height) {
    const ratio = candidate.width / candidate.height;
    if (ratio < 0.2 || ratio > 5) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  const haystack = combinedText.toLocaleLowerCase();
  const entityTokens = normalizedTokens(entity);
  const matchedTokens = entityTokens.filter((token) => haystack.includes(token));
  let score = matchedTokens.length * 20;
  if (entityTokens.length > 0 && matchedTokens.length === entityTokens.length) {
    score += 30;
  }
  if (candidate.width && candidate.height) {
    const megapixels = (candidate.width * candidate.height) / 1_000_000;
    score += Math.min(20, megapixels * 4);
  }
  if (/\b(?:photo|photograph|street|road|view|lake|building|market|bazaar|landmark)\b/i.test(combinedText)) {
    score += 8;
  }
  if (/\.(?:gov|nic)\.in$/i.test(candidate.sourceDomain ?? "")) {
    score += 10;
  }
  if (/wikimedia\.org$|wikipedia\.org$/i.test(candidate.sourceDomain ?? "")) {
    score += 6;
  }
  return score;
}

export function rankVisualSearchCandidates({
  candidates,
  entity,
  limit,
}: {
  candidates: VisualSearchCandidate[];
  entity: string;
  limit: number;
}) {
  const seenImages = new Set<string>();
  const seenSources = new Set<string>();
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreVisualSearchCandidate(candidate, entity),
    }))
    .filter(({ candidate, score }) => {
      if (!Number.isFinite(score) || score < 20) {
        return false;
      }
      const imageKey = normalizedUrl(candidate.imageUrl);
      if (seenImages.has(imageKey)) {
        return false;
      }
      seenImages.add(imageKey);
      return true;
    })
    .sort((left, right) => right.score - left.score)
    .filter(({ candidate }) => {
      const sourceKey = normalizedUrl(candidate.sourceUrl);
      if (seenSources.has(sourceKey)) {
        return false;
      }
      seenSources.add(sourceKey);
      return true;
    })
    .slice(0, Math.max(0, limit));
}

export function buildVisualSearchQuery({
  entity,
  geographicContext,
  historicalPeriod,
}: {
  entity: string;
  geographicContext?: string | null;
  historicalPeriod?: string | null;
}) {
  return Array.from(
    new Set(
      [entity, geographicContext, historicalPeriod]
        .flatMap((value) => value?.trim() || [])
        .map((value) => value.replace(/\s+/g, " "))
    )
  ).join(" ");
}
