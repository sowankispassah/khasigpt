import { createHash } from "node:crypto";

const TARGET_CHARS = 1_800;
const OVERLAP_CHARS = 240;
const MAX_CHUNKS = 96;

export type RagTextChunk = {
  chunkIndex: number;
  content: string;
  contentHash: string;
  tokenCount: number;
};

function findBoundary(text: string, start: number, idealEnd: number): number {
  if (idealEnd >= text.length) {
    return text.length;
  }

  const minimumEnd = Math.min(text.length, start + Math.floor(TARGET_CHARS * 0.65));
  const sample = text.slice(minimumEnd, idealEnd);
  const paragraph = sample.lastIndexOf("\n\n");
  if (paragraph >= 0) {
    return minimumEnd + paragraph + 2;
  }

  const sentence = Math.max(
    sample.lastIndexOf(". "),
    sample.lastIndexOf("? "),
    sample.lastIndexOf("! "),
    sample.lastIndexOf("। "),
  );
  return sentence >= 0 ? minimumEnd + sentence + 1 : idealEnd;
}

export function chunkRagContent(content: string): RagTextChunk[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: RagTextChunk[] = [];
  let start = 0;

  while (start < normalized.length && chunks.length < MAX_CHUNKS) {
    const end = findBoundary(
      normalized,
      start,
      Math.min(normalized.length, start + TARGET_CHARS),
    );
    const value = normalized.slice(start, end).trim();
    if (value) {
      chunks.push({
        chunkIndex: chunks.length,
        content: value,
        contentHash: createHash("sha256").update(value).digest("hex"),
        tokenCount: Math.max(1, Math.ceil(value.length / 4)),
      });
    }

    if (end >= normalized.length) {
      break;
    }
    start = Math.max(start + 1, end - OVERLAP_CHARS);
  }

  return chunks;
}
