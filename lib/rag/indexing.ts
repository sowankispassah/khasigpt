import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragChunk, ragEntry } from "@/lib/db/schema";
import { chunkRagContent } from "./chunking";
import { embedRagDocuments, getRagEmbeddingModel } from "./embeddings";

function isIndexable(entry: typeof ragEntry.$inferSelect) {
  return (
    entry.status === "active" &&
    entry.approvalStatus === "approved" &&
    !entry.deletedAt
  );
}

export async function indexRagEntry(
  entryId: string,
  signal?: AbortSignal,
): Promise<{ indexedChunks: number; status: "ready" | "failed" }> {
  const [entry] = await db
    .select()
    .from(ragEntry)
    .where(eq(ragEntry.id, entryId))
    .limit(1);
  if (!entry) {
    throw new Error("RAG entry not found.");
  }

  if (!isIndexable(entry)) {
    await db.transaction(async (tx) => {
      await tx.delete(ragChunk).where(eq(ragChunk.ragEntryId, entryId));
      await tx
        .update(ragEntry)
        .set({
          embeddingStatus: "ready",
          embeddingModel: null,
          embeddingUpdatedAt: new Date(),
          embeddingError: null,
        })
        .where(eq(ragEntry.id, entryId));
    });
    return { indexedChunks: 0, status: "ready" };
  }

  await db
    .update(ragEntry)
    .set({ embeddingStatus: "pending", embeddingError: null })
    .where(eq(ragEntry.id, entryId));

  try {
    const chunks = chunkRagContent(entry.content);
    const tagText = entry.tags.length ? ` Tags: ${entry.tags.join(", ")}.` : "";
    const embeddings = await embedRagDocuments(
      chunks.map((chunk) => ({
        title: entry.title,
        text: `${chunk.content}${tagText}`,
      })),
      signal,
    );
    const now = new Date();
    const embeddingModel = getRagEmbeddingModel();

    await db.transaction(async (tx) => {
      await tx.delete(ragChunk).where(eq(ragChunk.ragEntryId, entryId));
      if (chunks.length) {
        await tx.insert(ragChunk).values(
          chunks.map((chunk, index) => {
            const embedding = embeddings[index];
            if (!embedding) {
              throw new Error(`Missing embedding for chunk ${index}.`);
            }
            return {
              ragEntryId: entry.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              searchText: `${entry.title}\n${entry.tags.join(" ")}\n${chunk.content}`,
              contentHash: chunk.contentHash,
              tokenCount: chunk.tokenCount,
              language: entry.language,
              embedding,
              embeddingModel,
              metadata: {},
              updatedAt: now,
            };
          }),
        );
      }
      await tx
        .update(ragEntry)
        .set({
          embeddingStatus: "ready",
          embeddingModel,
          embeddingUpdatedAt: now,
          embeddingError: null,
        })
        .where(eq(ragEntry.id, entryId));
    });

    return { indexedChunks: chunks.length, status: "ready" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed";
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "failed",
        embeddingUpdatedAt: new Date(),
        embeddingError: message.slice(0, 1_000),
      })
      .where(eq(ragEntry.id, entryId));
    return { indexedChunks: 0, status: "failed" };
  }
}
