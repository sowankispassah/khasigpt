import { expect, test } from "@playwright/test";
import { chunkRagContent } from "@/lib/rag/chunking";
import { detectQueryLanguage } from "@/lib/rag/language";
import { shouldSkipRagQuery } from "@/lib/rag/query-policy";
import {
  type RagRankCandidate,
  rankRagCandidates,
} from "@/lib/rag/ranking";

function candidate(
  id: string,
  semanticScore: number,
  keywordScore = 0,
): RagRankCandidate {
  return {
    entryId: id,
    chunkId: `${id}-chunk`,
    chunkIndex: 0,
    title: `Entry ${id}`,
    content: `Knowledge for ${id}`,
    sourceUrl: null,
    language: "en",
    priority: 0,
    semanticScore,
    keywordScore,
  };
}

test("exact keyword and semantic matches rank above semantic-only candidates", () => {
  const exact = candidate("exact", 0.72, 0.9);
  const paraphrase = candidate("paraphrase", 0.76);
  const matches = rankRagCandidates([paraphrase, exact], [exact]);
  expect(matches.map((match) => match.entryId)).toEqual([
    "exact",
    "paraphrase",
  ]);
});
test("paraphrases pass while unrelated low-similarity chunks are rejected", () => {
  const matches = rankRagCandidates(
    [candidate("paraphrase", 0.69), candidate("unrelated", 0.31)],
    [],
  );
  expect(matches).toHaveLength(1);
  expect(matches[0]?.entryId).toBe("paraphrase");
});

test("Khasi and Pnar questions reach retrieval without English trigger words", () => {
  expect(detectQueryLanguage("Kumno phi long mynta?")).toBe("kha");
  expect(detectQueryLanguage("U moo toh heh ha Jowai")).toBe("pna");
  expect(shouldSkipRagQuery("Kaei ka jingmut jong kane?")).toBe(false);
  expect(shouldSkipRagQuery("khublei")).toBe(true);
});

test("control turns do not retrieve unrelated custom knowledge", () => {
  expect(shouldSkipRagQuery("Stop here")).toBe(true);
  expect(shouldSkipRagQuery("Please stop here.")).toBe(true);
  expect(shouldSkipRagQuery("Cancel that")).toBe(true);
  expect(shouldSkipRagQuery("Got it")).toBe(true);
  expect(shouldSkipRagQuery("What does 'stop here' mean?")).toBe(false);
  expect(shouldSkipRagQuery("Who founded KhasiGPT?")).toBe(false);
});

test("long knowledge is chunked with bounded overlapping units", () => {
  const text = Array.from(
    { length: 120 },
    (_, index) => `Paragraph ${index}. ${"detail ".repeat(18)}`,
  ).join("\n\n");
  const chunks = chunkRagContent(text);
  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks.length).toBeLessThanOrEqual(96);
  expect(chunks.every((chunk) => chunk.content.length <= 1_900)).toBe(true);
  expect(new Set(chunks.map((chunk) => chunk.contentHash)).size).toBe(
    chunks.length,
  );
});
