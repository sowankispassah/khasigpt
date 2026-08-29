import "server-only";

import { createHash } from "node:crypto";
import {
  and,
  cosineDistance,
  desc,
  eq,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/queries";
import {
  ragChunk,
  ragEntry,
  ragRetrievalLog,
  ragSearchLog,
} from "@/lib/db/schema";
import { RAG_CONTEXT_HEADER } from "./answering";
import { embedRagQuery } from "./embeddings";
import { detectQueryLanguage } from "./language";
import { shouldSkipRagQuery } from "./query-policy";
import { type RagRankCandidate, rankRagCandidates } from "./ranking";
import type {
  RagRetrievalMatch,
  RagRetrievalResult,
  RagRetrievalScope,
} from "./types";

const CANDIDATE_LIMIT = 14;

export type RagRetrievalDiagnostics = {
  surface: "live_voice" | "smoke" | "text_chat";
  requestId?: string;
  authSource?: "bearer" | "cookie";
  phaseDurationsMs?: Record<string, number>;
};

export type RetrieveRagContextInput = {
  query: string;
  scope?: RagRetrievalScope;
  chatId?: string | null;
  userId?: string | null;
  modelConfigId?: string | null;
  modelKey: string;
  signal?: AbortSignal;
  diagnostics?: RagRetrievalDiagnostics;
  deferLogWrites?: (task: () => Promise<void>) => void;
};

function scopeCondition(scope: RagRetrievalScope) {
  if (scope === "study") {
    return sql`coalesce(${ragEntry.metadata}->>'chatScope', 'default') in ('study', 'shared')`;
  }
  if (scope === "jobs") {
    return sql`coalesce(${ragEntry.metadata}->>'chatScope', 'default') in ('jobs', 'shared')`;
  }
  return sql`coalesce(${ragEntry.metadata}->>'chatScope', 'default') in ('default', 'identity', 'shared')`;
}

function buildContext(matches: RagRetrievalMatch[]): string {
  if (!matches.length) {
    return "";
  }
  return [
    RAG_CONTEXT_HEADER,
    ...matches.map((match, index) => {
      const source = match.sourceUrl ? ` | source: ${match.sourceUrl}` : "";
      return `[Knowledge ${index + 1} | ${match.title}${source}]\n${match.content}`;
    }),
  ].join("\n\n");
}

async function writeSearchLog(
  input: RetrieveRagContextInput,
  details: {
    queryHash: string;
    language: string;
    status: RagRetrievalResult["status"];
    resultCount: number;
    selectedCount: number;
    durationMs: number;
    failureReason?: string;
  },
) {
  const rawQuery = process.env.NODE_ENV === "production" ? null : input.query;
  try {
    await db.insert(ragSearchLog).values({
      chatId: input.chatId ?? null,
      modelConfigId: input.modelConfigId ?? null,
      modelKey: input.modelKey,
      userId: input.userId ?? null,
      chatScope: input.scope ?? "default",
      queryText: rawQuery,
      queryHash: details.queryHash,
      queryLanguage: details.language,
      status: details.status,
      resultCount: details.resultCount,
      selectedCount: details.selectedCount,
      durationMs: details.durationMs,
      failureReason: details.failureReason?.slice(0, 1_000),
      metadata: input.diagnostics ?? {},
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[rag] search log write failed", error);
    }
  }
}

async function persistLogWrites(
  input: RetrieveRagContextInput,
  task: () => Promise<void>,
) {
  if (input.deferLogWrites) {
    try {
      input.deferLogWrites(task);
      return;
    } catch (error) {
      console.warn("[rag] failed to defer diagnostic writes", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await task();
}

export async function retrieveRagContext(
  input: RetrieveRagContextInput,
): Promise<RagRetrievalResult> {
  const startedAt = performance.now();
  const query = input.query.trim();
  const language = detectQueryLanguage(query);
  const queryHash = createHash("sha256").update(query).digest("hex");

  if (shouldSkipRagQuery(query)) {
    const durationMs = Math.round(performance.now() - startedAt);
    const result: RagRetrievalResult = {
      context: "",
      matches: [],
      language,
      durationMs,
      status: "skipped",
    };
    await persistLogWrites(input, () =>
      writeSearchLog(input, {
        queryHash,
        language,
        status: result.status,
        resultCount: 0,
        selectedCount: 0,
        durationMs,
      }),
    );
    return result;
  }

  try {
    const queryEmbedding = await embedRagQuery(query, input.signal);
    const distance = cosineDistance(ragChunk.embedding, queryEmbedding);
    const semanticScore = sql<number>`1 - (${distance})`;
    const keywordScore = sql<number>`ts_rank_cd(
      to_tsvector('simple', ${ragChunk.searchText}),
      websearch_to_tsquery('simple', ${query})
    )`;
    const personalCondition = input.userId
      ? or(
          isNull(ragEntry.personalForUserId),
          eq(ragEntry.personalForUserId, input.userId),
        )
      : isNull(ragEntry.personalForUserId);
    const modelCondition = input.modelConfigId
      ? sql`(
          cardinality(${ragEntry.models}) = 0
          OR ${input.modelKey} = ANY(${ragEntry.models})
          OR ${input.modelConfigId} = ANY(${ragEntry.models})
        )`
      : sql`(
          cardinality(${ragEntry.models}) = 0
          OR ${input.modelKey} = ANY(${ragEntry.models})
        )`;
    const baseCondition = and(
      eq(ragEntry.status, "active"),
      eq(ragEntry.approvalStatus, "approved"),
      eq(ragEntry.embeddingStatus, "ready"),
      isNull(ragEntry.deletedAt),
      personalCondition,
      modelCondition,
      scopeCondition(input.scope ?? "default"),
    );
    const fields = {
      entryId: ragEntry.id,
      chunkId: ragChunk.id,
      chunkIndex: ragChunk.chunkIndex,
      title: ragEntry.title,
      content: ragChunk.content,
      sourceUrl: ragEntry.sourceUrl,
      language: ragChunk.language,
      priority: ragEntry.priority,
      semanticScore,
      keywordScore,
    };

    const [semanticRows, keywordRows] = await db.transaction(async (tx) => {
      // pgvector 0.8 iterative scans keep filtered HNSW queries complete as
      // scope, ownership, status, and model filters become more selective.
      await tx.execute(sql`SET LOCAL hnsw.iterative_scan = 'strict_order'`);
      const semanticCandidates = await tx
        .select(fields)
        .from(ragChunk)
        .innerJoin(ragEntry, eq(ragChunk.ragEntryId, ragEntry.id))
        .where(baseCondition)
        .orderBy(desc(semanticScore))
        .limit(CANDIDATE_LIMIT);
      const keywordCandidates = await tx
        .select(fields)
        .from(ragChunk)
        .innerJoin(ragEntry, eq(ragChunk.ragEntryId, ragEntry.id))
        .where(
          and(
            baseCondition,
            sql`to_tsvector('simple', ${ragChunk.searchText})
              @@ websearch_to_tsquery('simple', ${query})`,
          ),
        )
        .orderBy(desc(keywordScore))
        .limit(CANDIDATE_LIMIT);
      return [semanticCandidates, keywordCandidates] as const;
    });

    const matches = rankRagCandidates(
      semanticRows.map((row) => ({
        ...row,
        semanticScore: Number(row.semanticScore),
        keywordScore: Number(row.keywordScore),
      })) satisfies RagRankCandidate[],
      keywordRows.map((row) => ({
        ...row,
        semanticScore: Number(row.semanticScore),
        keywordScore: Number(row.keywordScore),
      })) satisfies RagRankCandidate[],
      query,
    );
    const durationMs = Math.round(performance.now() - startedAt);
    const status = matches.length ? "hit" : "miss";

    if (process.env.NODE_ENV !== "production") {
      console.info("[rag] retrieval", {
        query,
        language,
        scope: input.scope ?? "default",
        semanticCandidates: semanticRows.length,
        keywordCandidates: keywordRows.length,
        selected: matches.map((match) => ({
          entryId: match.entryId,
          chunkIndex: match.chunkIndex,
          semanticScore: match.semanticScore,
          keywordScore: match.keywordScore,
          lexicalScore: match.lexicalScore,
          score: match.score,
          preview: match.content.slice(0, 160),
        })),
        durationMs,
      });
    } else {
      console.info("[rag] retrieval", {
        queryHash,
        language,
        scope: input.scope ?? "default",
        candidateCount: semanticRows.length + keywordRows.length,
        selectedCount: matches.length,
        durationMs,
      });
    }

    await persistLogWrites(input, async () => {
      await Promise.all([
        writeSearchLog(input, {
          queryHash,
          language,
          status,
          resultCount: semanticRows.length + keywordRows.length,
          selectedCount: matches.length,
          durationMs,
        }),
        matches.length
          ? db
              .insert(ragRetrievalLog)
              .values(
                matches.map((match) => ({
                  ragEntryId: match.entryId,
                  ragChunkId: match.chunkId,
                  chatId: input.chatId ?? null,
                  modelConfigId: input.modelConfigId ?? null,
                  modelKey: input.modelKey,
                  userId: input.userId ?? null,
                  score: match.score,
                  queryText:
                    process.env.NODE_ENV === "production" ? null : input.query,
                  queryHash,
                  queryLanguage: language,
                  applied: true,
                  metadata: {
                    semanticScore: match.semanticScore,
                    keywordScore: match.keywordScore,
                    lexicalScore: match.lexicalScore,
                    chunkIndex: match.chunkIndex,
                  },
                })),
              )
              .catch((error) => {
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[rag] retrieval log write failed", error);
                }
              })
          : Promise.resolve(),
      ]);
    });

    return {
      context: buildContext(matches),
      matches,
      language,
      durationMs,
      status,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    const failureReason =
      error instanceof Error ? error.message : "Unknown retrieval failure";
    console.error("[rag] retrieval failed", {
      queryHash,
      language,
      durationMs,
      failureReason,
    });
    await persistLogWrites(input, () =>
      writeSearchLog(input, {
        queryHash,
        language,
        status: "failed",
        resultCount: 0,
        selectedCount: 0,
        durationMs,
        failureReason,
      }),
    );
    return {
      context: "",
      matches: [],
      language,
      durationMs,
      status: "failed",
    };
  }
}
