import type { RagRetrievalMatch } from "./types";

const SELECTED_LIMIT = 4;
const MAX_CONTEXT_CHARS = 6_000;
const MIN_SEMANTIC_SCORE = 0.58;

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

export function rankRagCandidates(
  semantic: RagRankCandidate[],
  keyword: RagRankCandidate[],
): RagRetrievalMatch[] {
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
    .filter(
      (candidate) =>
        candidate.semanticScore >= MIN_SEMANTIC_SCORE ||
        candidate.keywordScore > 0,
    )
    .map((candidate) => {
      const reciprocalRank =
        (candidate.semanticRank ? 1 / (60 + candidate.semanticRank) : 0) +
        (candidate.keywordRank ? 1 / (60 + candidate.keywordRank) : 0);
      const score =
        candidate.semanticScore * 0.75 +
        Math.min(candidate.keywordScore, 1) * 0.12 +
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
