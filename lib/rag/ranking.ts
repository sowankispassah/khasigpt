import type { RagRetrievalMatch } from "./types";

const SELECTED_LIMIT = 4;
const MAX_CONTEXT_CHARS = 6_000;
const MIN_SEMANTIC_ONLY_SCORE = 0.7;
const MIN_TYPO_SUPPORTED_SEMANTIC_SCORE = 0.55;
const MIN_FUZZY_LEXICAL_SCORE = 0.7;
const MAX_QUERY_TOKENS = 16;
const MAX_CANDIDATE_TOKENS = 192;
const MAX_TOKEN_LENGTH = 32;

const RETRIEVAL_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "ba",
  "balei",
  "ban",
  "da",
  "do",
  "does",
  "for",
  "from",
  "ha",
  "how",
  "ia",
  "in",
  "is",
  "jong",
  "ka",
  "kaei",
  "ki",
  "kumno",
  "ma",
  "mano",
  "me",
  "na",
  "of",
  "on",
  "or",
  "phi",
  "please",
  "sha",
  "shano",
  "tell",
  "the",
  "to",
  "u",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

export type RagRankCandidate = {
  entryId: string;
  chunkId: string;
  chunkIndex: number;
  title: string;
  content: string;
  sourceUrl: string | null;
  language: string;
  priority: number;
  semanticScore: number;
  keywordScore: number;
};

function tokenizeForFuzzyMatch(text: string, limit: number): string[] {
  const tokens =
    text
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\p{M}+/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? [];

  return Array.from(
    new Set(
      tokens.filter(
        (token) => token.length >= 3 && !RETRIEVAL_STOP_WORDS.has(token),
      ),
    ),
  ).slice(0, limit);
}

function levenshteinDistance(left: string, right: string): number {
  const a = left.slice(0, MAX_TOKEN_LENGTH);
  const b = right.slice(0, MAX_TOKEN_LENGTH);
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= a.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= b.length; rightIndex += 1) {
      const substitutionCost =
        a[leftIndex - 1] === b[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  const longest = Math.max(left.length, right.length);
  if (!longest) {
    return 0;
  }
  const maximumUsefulDistance = Math.floor(
    longest * (1 - MIN_FUZZY_LEXICAL_SCORE),
  );
  if (Math.abs(left.length - right.length) > maximumUsefulDistance) {
    return 0;
  }
  return Math.max(0, 1 - levenshteinDistance(left, right) / longest);
}

export function getFuzzyLexicalScore(
  query: string,
  candidate: Pick<RagRankCandidate, "content" | "title">,
): number {
  const queryTokens = tokenizeForFuzzyMatch(query, MAX_QUERY_TOKENS);
  if (!queryTokens.length) {
    return 0;
  }

  const scoreTokens = (candidateTokens: string[]) =>
    queryTokens.map((queryToken) =>
      candidateTokens.reduce(
      (highest, candidateToken) =>
        Math.max(highest, tokenSimilarity(queryToken, candidateToken)),
      0,
      ),
    );
  const titleMatches = scoreTokens(
    tokenizeForFuzzyMatch(candidate.title, MAX_CANDIDATE_TOKENS),
  );
  const strongestTitleMatches = titleMatches
    .sort((left, right) => right - left)
    .slice(0, 2);
  const averageScore = (scores: number[]) =>
    scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
  const titleScore = averageScore(strongestTitleMatches);

  const contentMatches = scoreTokens(
    tokenizeForFuzzyMatch(candidate.content, MAX_CANDIDATE_TOKENS),
  );
  const contentCoverage = averageScore(contentMatches);

  return Math.max(titleScore, contentCoverage * 0.9);
}

export function rankRagCandidates(
  semantic: RagRankCandidate[],
  keyword: RagRankCandidate[],
  query: string,
): RagRetrievalMatch[] {
  const meaningfulQueryTokenCount = tokenizeForFuzzyMatch(
    query,
    MAX_QUERY_TOKENS,
  ).length;
  const combined = new Map<
    string,
    RagRankCandidate & { semanticRank?: number; keywordRank?: number }
  >();

  semantic.forEach((candidate, index) => {
    combined.set(candidate.chunkId, { ...candidate, semanticRank: index + 1 });
  });
  keyword.forEach((candidate, index) => {
    const current = combined.get(candidate.chunkId);
    combined.set(candidate.chunkId, {
      ...(current ?? candidate),
      keywordScore: candidate.keywordScore,
      keywordRank: index + 1,
    });
  });

  const ranked = Array.from(combined.values())
    .map((candidate) => ({
      ...candidate,
      lexicalScore: getFuzzyLexicalScore(query, candidate),
    }))
    .filter((candidate) => {
      const hasKeywordEvidence = candidate.keywordScore > 0;
      const hasStrongSemanticEvidence =
        meaningfulQueryTokenCount >= 2 &&
        candidate.semanticScore >= MIN_SEMANTIC_ONLY_SCORE;
      const hasTypoSupportedEvidence =
        candidate.semanticScore >= MIN_TYPO_SUPPORTED_SEMANTIC_SCORE &&
        candidate.lexicalScore >= MIN_FUZZY_LEXICAL_SCORE;
      return (
        hasKeywordEvidence ||
        hasStrongSemanticEvidence ||
        hasTypoSupportedEvidence
      );
    })
    .map((candidate) => {
      const reciprocalRank =
        (candidate.semanticRank ? 1 / (60 + candidate.semanticRank) : 0) +
        (candidate.keywordRank ? 1 / (60 + candidate.keywordRank) : 0);
      const score =
        candidate.semanticScore * 0.75 +
        Math.min(candidate.keywordScore, 1) * 0.12 +
        candidate.lexicalScore * 0.15 +
        reciprocalRank * 5 +
        Math.max(-0.03, Math.min(0.03, candidate.priority / 3_333));
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected: RagRetrievalMatch[] = [];
  const entryCounts = new Map<string, number>();
  let usedChars = 0;
  for (const candidate of ranked) {
    if ((entryCounts.get(candidate.entryId) ?? 0) >= 2) {
      continue;
    }
    if (usedChars + candidate.content.length > MAX_CONTEXT_CHARS && selected.length) {
      continue;
    }
    selected.push({
      entryId: candidate.entryId,
      chunkId: candidate.chunkId,
      chunkIndex: candidate.chunkIndex,
      title: candidate.title,
      content: candidate.content,
      sourceUrl: candidate.sourceUrl,
      language: candidate.language,
      semanticScore: candidate.semanticScore,
      keywordScore: candidate.keywordScore,
      lexicalScore: candidate.lexicalScore,
      score: candidate.score,
    });
    usedChars += candidate.content.length;
    entryCounts.set(candidate.entryId, (entryCounts.get(candidate.entryId) ?? 0) + 1);
    if (selected.length >= SELECTED_LIMIT) {
      break;
    }
  }
  return selected;
}
