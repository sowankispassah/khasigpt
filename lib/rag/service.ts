import "server-only";

import { diff_match_patch } from "diff-match-patch";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db/queries";
import {
  ragEntry,
  ragChunk,
  ragEntryVersion,
  ragRetrievalLog,
  ragCategory,
  user,
  type RagEntry as RagEntryModel,
  type RagEntryApprovalStatus,
  type RagEntryStatus,
} from "@/lib/db/schema";
import type { ModelConfig } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { generateRagEmbedding } from "./embeddings";
import {
  hasSupabaseConfig,
  patchSupabaseEmbedding,
  searchSupabaseEmbeddings,
  upsertSupabaseEmbedding,
  type SupabaseRagMatch,
  deleteSupabaseEmbedding,
} from "./supabase";
import {
  CUSTOM_KNOWLEDGE_STORAGE_KEY,
  DEFAULT_RAG_TIMEOUT_MS,
  DEFAULT_RAG_MATCH_LIMIT,
  DEFAULT_RAG_MATCH_THRESHOLD,
  DEFAULT_RAG_VERSION_HISTORY_LIMIT,
  MAX_RAG_CONTENT_CHARS,
  MAX_RAG_CONTEXT_CHARS,
  MAX_RAG_CHUNK_CHARS,
  RAG_CHUNK_OVERLAP_CHARS,
} from "./constants";
import {
  normalizeModels,
  normalizeSourceUrl,
  normalizeTags,
  sanitizeRagContent,
  detectQueryLanguage,
  buildSupabaseMetadata,
} from "./utils";
import type {
  AdminRagEntry,
  RagAnalyticsSummary,
  RagUsageEvent,
  SanitizedRagEntry,
  UpsertRagEntryInput,
} from "./types";
import { ragEntrySchema } from "./validation";

const diffEngine = new diff_match_patch();
const NO_MATCH_SUPPLEMENT =
  "No saved knowledge matched this request. Do not fabricate or cite sources that were not retrieved. " +
  "If the user asks about uploaded or custom knowledge, explain that no matching reference was found and ask for more detail.";

function toSanitizedEntry(
  entry: RagEntryModel,
  extras?: { categoryName?: string | null }
): SanitizedRagEntry {
  return {
    ...entry,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    models: Array.isArray(entry.models) ? entry.models : [],
    metadata: (entry.metadata ?? {}) as Record<string, unknown>,
    categoryName: extras?.categoryName ?? null,
  };
}

async function getCategoryNameById(categoryId: string | null | undefined) {
  if (!categoryId) {
    return null;
  }
  const [record] = await db
    .select({ name: ragCategory.name })
    .from(ragCategory)
    .where(eq(ragCategory.id, categoryId))
    .limit(1);
  return record?.name ?? null;
}

export async function listRagCategories() {
  return db
    .select({
      id: ragCategory.id,
      name: ragCategory.name,
    })
    .from(ragCategory)
    .orderBy(asc(ragCategory.name));
}

export async function createRagCategory({ name }: { name: string }) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ChatSDKError(
      "bad_request:api",
      "Category name is required"
    );
  }

  const [record] = await db
    .insert(ragCategory)
    .values({ name: trimmed })
    .onConflictDoNothing()
    .returning();

  if (!record) {
    const [existing] = await db
      .select()
      .from(ragCategory)
      .where(eq(ragCategory.name, trimmed))
      .limit(1);
    if (existing) {
      return existing;
    }
    throw new ChatSDKError(
      "bad_request:api",
      "Unable to create category"
    );
  }

  return record;
}

function buildEmbeddableText(entry: RagEntryModel) {
  const tags = Array.isArray(entry.tags) && entry.tags.length
    ? `Tags: ${entry.tags.join(", ")}`
    : "";
  const source = entry.sourceUrl ? `Source: ${entry.sourceUrl}` : "";
  return [
    `Title: ${entry.title}`,
    `Type: ${entry.type}`,
    tags,
    source,
    "\n",
    entry.content,
  ]
    .filter(Boolean)
    .join("\n");
}

async function getEntryById(id: string): Promise<RagEntryModel | null> {
  const [record] = await db
    .select()
    .from(ragEntry)
    .where(eq(ragEntry.id, id))
    .limit(1);
  return record ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("RAG operation timed out")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function trimContent(content: string) {
  if (!content) {
    return "";
  }
  return content.length > MAX_RAG_CONTENT_CHARS
    ? `${content.slice(0, MAX_RAG_CONTENT_CHARS)}\n\n[...]`
    : content;
}

function chunkForPrompt(content: string) {
  const max = Math.max(200, MAX_RAG_CHUNK_CHARS);
  const overlap = Math.max(0, Math.min(RAG_CHUNK_OVERLAP_CHARS, Math.floor(max / 2)));
  const normalized = content.trim();
  if (normalized.length <= max) {
    return [normalized];
  }
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length && chunks.length < 20) {
    const end = Math.min(normalized.length, cursor + max);
    const slice = normalized.slice(cursor, end);
    chunks.push(slice.trim());
    cursor = end - overlap;
  }
  return chunks;
}

function composeRagResult({
  resolved,
  chatId,
  modelConfig,
  trimmedQuery,
  userId,
}: {
  resolved: Array<{
    entry: RagEntryModel;
    score: number;
    chunkContent: string;
    chunkIndex: number | null;
    chunkId: string | null;
  }>;
  chatId: string;
  modelConfig: ModelConfig;
  trimmedQuery: string;
  userId: string;
}) {
  const systemSupplement = resolved
    .flatMap(({ entry, chunkContent }) => {
      const header = entry.sourceUrl
        ? `Reference: ${entry.title} (${entry.sourceUrl})`
        : `Reference: ${entry.title}`;
      return [header, trimContent(chunkContent ?? "")].filter(Boolean).join("\n");
    })
    .reduce<string[]>((acc, section) => {
      const total = acc.join("\n\n").length;
      if (total + section.length <= MAX_RAG_CONTEXT_CHARS) {
        acc.push(section);
      }
      return acc;
    }, [])
    .join("\n\n");

  const safetyPrefix =
    "Use only the references below. If they do not answer the question, say you don't know and ask for clarification. Do not invent sources.";
  const finalSupplement = [safetyPrefix, systemSupplement].filter(Boolean).join("\n\n");

  const clientEvent: RagUsageEvent = {
    chatId,
    modelId: modelConfig.id,
    modelName: modelConfig.displayName,
    entries: resolved.map(({ entry, score, chunkIndex, chunkId }) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      approvalStatus: entry.approvalStatus,
      tags: entry.tags,
      sourceUrl: entry.sourceUrl ?? null,
      score,
      chunkIndex,
      chunkId,
    })),
  };

  void db
    .insert(ragRetrievalLog)
    .values(
      resolved.map(({ entry, score }) => ({
        ragEntryId: entry.id,
        chatId,
        modelConfigId: modelConfig.id,
        modelKey: modelConfig.key,
        userId,
        score,
        queryText: trimmedQuery,
        queryLanguage: detectQueryLanguage(trimmedQuery),
        metadata: buildSupabaseMetadata(entry),
      }))
    )
    .catch((error) => {
      console.warn("[rag] failed to record retrieval log", { error, chatId });
    });

  return {
    systemSupplement: finalSupplement,
    clientEvent,
  };
}

async function syncEmbedding(entry: RagEntryModel, { reembed } = { reembed: true }) {
  const chunks = chunkForPrompt(entry.content);
  const now = new Date();
  let chunkRows =
    reembed === false
      ? await db
          .select()
          .from(ragChunk)
          .where(eq(ragChunk.entryId, entry.id))
          .orderBy(asc(ragChunk.chunkIndex))
      : [];

  if (reembed || !chunkRows.length) {
    await db.delete(ragChunk).where(eq(ragChunk.entryId, entry.id));
    chunkRows = chunks.length
      ? await db
          .insert(ragChunk)
          .values(
            chunks.map((content, index) => ({
              entryId: entry.id,
              chunkIndex: index,
              content,
              createdAt: now,
              updatedAt: now,
            }))
          )
          .returning()
      : [];
  }

  if (!hasSupabaseConfig()) {
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "ready",
        embeddingUpdatedAt: new Date(),
        embeddingError: null,
      })
      .where(eq(ragEntry.id, entry.id));
    return;
  }

  if (reembed) {
    await deleteSupabaseEmbedding(entry.id);
  }

  for (const chunk of chunkRows) {
    try {
      if (reembed) {
        const { vector, model, dimensions } = await generateRagEmbedding(chunk.content);
        await upsertSupabaseEmbedding({
          entry: { ...entry, content: chunk.content },
          chunkId: chunk.id,
          chunkIndex: chunk.chunkIndex,
          embedding: vector,
        });
        await db
          .update(ragEntry)
          .set({
            embeddingStatus: "ready",
            embeddingModel: model,
            embeddingDimensions: dimensions,
            embeddingUpdatedAt: new Date(),
            embeddingError: null,
          })
          .where(eq(ragEntry.id, entry.id));
      } else {
        await patchSupabaseEmbedding(
          { ...entry, content: chunk.content },
          { chunkId: chunk.id, chunkIndex: chunk.chunkIndex, content: chunk.content }
        );
      }
    } catch (error) {
      await db
        .update(ragEntry)
        .set({
          embeddingStatus: "failed",
          embeddingError: error instanceof Error ? error.message : "Embedding failed",
        })
        .where(eq(ragEntry.id, entry.id));
      console.warn("[rag] chunk embedding/upsert failed", {
        entryId: entry.id,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        error,
      });
    }
  }
}

async function normalizeModelAssignments(modelIds: string[]) {
  if (!modelIds.length) {
    return [];
  }
  const registry = await getModelRegistry();
  const allowed = new Set(registry.configs.map((config) => config.id));
  return modelIds.filter((id) => allowed.has(id));
}

function buildVersionDiff(previous: RagEntryModel, next: RagEntryModel) {
  const fields: Record<string, { before: unknown; after: unknown }> = {};
  const compare = <K extends keyof RagEntryModel>(key: K) => {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      fields[key as string] = {
        before: previous[key],
        after: next[key],
      };
    }
  };

  compare("title");
  compare("content");
  compare("type");
  compare("status");
  compare("approvalStatus");
  compare("tags");
  compare("models");
  compare("sourceUrl");
  compare("categoryId");
  compare("personalForUserId");
  compare("approvedBy");

  let textDelta: string | undefined;
  if (previous.content !== next.content) {
    const diff = diffEngine.diff_main(previous.content, next.content);
    diffEngine.diff_cleanupSemantic(diff);
    textDelta = diffEngine.diff_toDelta(diff);
  }

  return {
    fields,
    textDelta,
  };
}

export async function createRagEntry({
  input,
  actorId,
}: {
  input: UpsertRagEntryInput;
  actorId: string;
}): Promise<SanitizedRagEntry> {
  const parsed = ragEntrySchema.parse({
    ...input,
    approvalStatus: input.approvalStatus ?? "approved",
    personalForUserId: input.personalForUserId ?? null,
    approvedBy:
      input.approvedBy ??
      ((input.approvalStatus ?? "approved") === "approved" ? actorId : null),
  });
  const tags = normalizeTags(parsed.tags);
  const models = await normalizeModelAssignments(normalizeModels(parsed.models));
  const title = parsed.title.trim();
  const content = sanitizeRagContent(parsed.content);
  const sourceUrl = normalizeSourceUrl(parsed.sourceUrl);
  const metadata = parsed.metadata ?? {};
  const now = new Date();

  const [created] = await db
    .insert(ragEntry)
    .values({
      title,
      content,
      type: parsed.type,
      status: parsed.status,
      tags,
      models,
      sourceUrl,
      categoryId: parsed.categoryId ?? null,
      metadata,
      addedBy: actorId,
      approvalStatus: parsed.approvalStatus,
      personalForUserId: parsed.personalForUserId ?? null,
      approvedBy: parsed.approvedBy ?? (parsed.approvalStatus === "approved" ? actorId : null),
      createdAt: now,
      updatedAt: now,
      embeddingStatus: "pending",
    })
    .returning();

  await db.insert(ragEntryVersion).values({
    ragEntryId: created.id,
    version: created.version,
    title: created.title,
    content: created.content,
    type: created.type,
    status: created.status,
    approvalStatus: created.approvalStatus,
    personalForUserId: created.personalForUserId,
    approvedBy: created.approvedBy,
    tags: created.tags,
    models: created.models,
    sourceUrl: created.sourceUrl,
    categoryId: created.categoryId,
    diff: { fields: {}, textDelta: undefined },
    changeSummary: "Initial version",
    editorId: actorId,
  });

  try {
    await syncEmbedding(created, { reembed: true });
  } catch (error) {
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "failed",
        embeddingError:
          error instanceof Error ? error.message : "Embedding failed",
      })
      .where(eq(ragEntry.id, created.id));
  }

  const refreshed = await getEntryById(created.id);
  const categoryName = await getCategoryNameById(created.categoryId);
  return toSanitizedEntry(refreshed ?? created, { categoryName });
}

export async function updateRagEntry({
  id,
  input,
  actorId,
}: {
  id: string;
  input: UpsertRagEntryInput;
  actorId: string;
}): Promise<SanitizedRagEntry> {
  const existing = await getEntryById(id);
  if (!existing) {
    throw new ChatSDKError("not_found:chat", "RAG entry not found");
  }

  const approvalStatus =
    input.approvalStatus ?? existing.approvalStatus ?? "approved";
  const personalForUserId =
    input.personalForUserId ?? existing.personalForUserId ?? null;
  const approvedBy =
    input.approvedBy ??
    (approvalStatus === "approved"
      ? actorId
      : null);

  const parsed = ragEntrySchema.parse({
    ...input,
    id,
    approvalStatus,
    personalForUserId,
    approvedBy,
  });
  const tags = normalizeTags(parsed.tags);
  const models = await normalizeModelAssignments(normalizeModels(parsed.models));
  const title = parsed.title.trim();
  const content = sanitizeRagContent(parsed.content);
  const sourceUrl = normalizeSourceUrl(parsed.sourceUrl);
  const metadata = parsed.metadata ?? {};
  const shouldReembed = existing.content !== content;

  const [updated] = await db
    .update(ragEntry)
    .set({
      title,
      content,
      type: parsed.type,
      status: parsed.status,
      approvalStatus: parsed.approvalStatus,
      personalForUserId: parsed.personalForUserId ?? null,
      approvedBy:
        parsed.approvalStatus === "approved"
          ? parsed.approvedBy ?? existing.approvedBy ?? actorId
          : null,
      tags,
      models,
      sourceUrl,
      categoryId: parsed.categoryId ?? null,
      metadata,
      version: existing.version + 1,
      updatedAt: new Date(),
      embeddingStatus: shouldReembed ? "pending" : existing.embeddingStatus,
    })
    .where(eq(ragEntry.id, id))
    .returning();

  const diff = buildVersionDiff(existing, updated);

  await db.insert(ragEntryVersion).values({
    ragEntryId: updated.id,
    version: updated.version,
    title: updated.title,
    content: updated.content,
    type: updated.type,
    status: updated.status,
    approvalStatus: updated.approvalStatus,
    personalForUserId: updated.personalForUserId,
    approvedBy: updated.approvedBy,
    tags: updated.tags,
    models: updated.models,
    sourceUrl: updated.sourceUrl,
    categoryId: updated.categoryId,
    diff,
    changeSummary: "Entry updated",
    editorId: actorId,
  });

  if (shouldReembed) {
    try {
      await syncEmbedding(updated, { reembed: true });
    } catch (error) {
      await db
        .update(ragEntry)
        .set({
          embeddingStatus: "failed",
          embeddingError:
            error instanceof Error ? error.message : "Embedding failed",
        })
        .where(eq(ragEntry.id, id));
    }
  } else {
    await syncEmbedding(updated, { reembed: false });
  }

  const refreshed = await getEntryById(updated.id);
  const categoryName = await getCategoryNameById(updated.categoryId);
  return toSanitizedEntry(refreshed ?? updated, { categoryName });
}

export async function bulkUpdateRagStatus({
  ids,
  status,
  actorId,
}: {
  ids: string[];
  status: RagEntryStatus;
  actorId: string;
}): Promise<SanitizedRagEntry[]> {
  if (!ids.length) {
    return [];
  }

  const [updated] = await Promise.all([
    db
      .update(ragEntry)
      .set({
        status,
        updatedAt: new Date(),
        version: sql`${ragEntry.version} + 1`,
      })
      .where(inArray(ragEntry.id, ids))
      .returning(),
  ]);

  for (const entry of updated) {
    await db.insert(ragEntryVersion).values({
      ragEntryId: entry.id,
      version: entry.version,
      title: entry.title,
      content: entry.content,
      type: entry.type,
      status: entry.status,
      approvalStatus: entry.approvalStatus,
      personalForUserId: entry.personalForUserId,
      approvedBy: entry.approvedBy,
      tags: entry.tags,
      models: entry.models,
      sourceUrl: entry.sourceUrl,
      categoryId: entry.categoryId,
      diff: { fields: { status: { before: null, after: status } } },
      changeSummary: `Status changed to ${status}`,
      editorId: actorId,
    });

    await syncEmbedding(entry, { reembed: false });
  }

  const categoryNames = await Promise.all(
    updated.map((entry) => getCategoryNameById(entry.categoryId))
  );

  return updated.map((entry, index) =>
    toSanitizedEntry(entry, { categoryName: categoryNames[index] ?? null })
  );
}

export async function deleteRagEntries({
  ids,
  actorId,
}: {
  ids: string[];
  actorId: string;
}) {
  if (!ids.length) {
    return;
  }

  const [updated] = await Promise.all([
    db
      .update(ragEntry)
      .set({
        status: "archived",
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${ragEntry.version} + 1`,
      })
      .where(inArray(ragEntry.id, ids))
      .returning(),
  ]);

  for (const entry of updated) {
    await db.insert(ragEntryVersion).values({
      ragEntryId: entry.id,
      version: entry.version,
      title: entry.title,
      content: entry.content,
      type: entry.type,
      status: entry.status,
      approvalStatus: entry.approvalStatus,
      personalForUserId: entry.personalForUserId,
      approvedBy: entry.approvedBy,
      tags: entry.tags,
      models: entry.models,
      sourceUrl: entry.sourceUrl,
      categoryId: entry.categoryId,
      diff: { fields: { status: { before: null, after: "archived" } } },
      changeSummary: "Entry archived",
      editorId: actorId,
    });

    await syncEmbedding(entry, { reembed: false });
  }
}

export async function restoreRagEntry({
  id,
  actorId,
}: {
  id: string;
  actorId: string;
}) {
  const existing = await getEntryById(id);
  if (!existing) {
    throw new ChatSDKError("not_found:chat", "RAG entry not found");
  }

  const [updated] = await db
    .update(ragEntry)
    .set({
      deletedAt: null,
      status: "inactive",
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(ragEntry.id, id))
    .returning();

  await db.insert(ragEntryVersion).values({
    ragEntryId: updated.id,
    version: updated.version,
    title: updated.title,
    content: updated.content,
    type: updated.type,
    status: updated.status,
    approvalStatus: updated.approvalStatus,
    personalForUserId: updated.personalForUserId,
    approvedBy: updated.approvedBy,
    tags: updated.tags,
    models: updated.models,
    sourceUrl: updated.sourceUrl,
    categoryId: updated.categoryId,
    diff: { fields: { deletedAt: { before: true, after: false } } },
    changeSummary: "Entry restored",
    editorId: actorId,
  });

  await syncEmbedding(updated, { reembed: false });
}

export async function getRagVersions(entryId: string) {
  return db
    .select({
      id: ragEntryVersion.id,
      version: ragEntryVersion.version,
      title: ragEntryVersion.title,
      status: ragEntryVersion.status,
      createdAt: ragEntryVersion.createdAt,
      changeSummary: ragEntryVersion.changeSummary,
      editorName: sql<string | null>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
    })
    .from(ragEntryVersion)
    .leftJoin(user, eq(user.id, ragEntryVersion.editorId))
    .where(eq(ragEntryVersion.ragEntryId, entryId))
    .orderBy(desc(ragEntryVersion.createdAt))
    .limit(DEFAULT_RAG_VERSION_HISTORY_LIMIT);
}

export async function restoreRagVersion({
  entryId,
  versionId,
  actorId,
}: {
  entryId: string;
  versionId: string;
  actorId: string;
}) {
  const version = await db
    .select()
    .from(ragEntryVersion)
    .where(eq(ragEntryVersion.id, versionId))
    .limit(1);

  const snapshot = version[0];
  if (!snapshot) {
    throw new ChatSDKError("not_found:chat", "Version not found");
  }

  const existing = await getEntryById(entryId);
  if (!existing) {
    throw new ChatSDKError("not_found:chat", "RAG entry not found");
  }

  const [updated] = await db
    .update(ragEntry)
    .set({
      title: snapshot.title,
      content: snapshot.content,
      type: snapshot.type,
      status: snapshot.status,
      approvalStatus: snapshot.approvalStatus,
      personalForUserId: snapshot.personalForUserId,
      approvedBy: snapshot.approvedBy,
      tags: snapshot.tags,
      models: snapshot.models,
      sourceUrl: snapshot.sourceUrl,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(ragEntry.id, entryId))
    .returning();

  await db.insert(ragEntryVersion).values({
    ragEntryId: updated.id,
    version: updated.version,
    title: updated.title,
    content: updated.content,
    type: updated.type,
    status: updated.status,
    approvalStatus: updated.approvalStatus,
    personalForUserId: updated.personalForUserId,
    approvedBy: updated.approvedBy,
    tags: updated.tags,
    models: updated.models,
    sourceUrl: updated.sourceUrl,
    categoryId: updated.categoryId,
    diff: buildVersionDiff(existing, updated),
    changeSummary: `Restored version ${snapshot.version}`,
    editorId: actorId,
  });

  await syncEmbedding(updated, { reembed: true });
}

export async function listPersonalKnowledgeForUser(userId: string) {
  const rows = await db
    .select({
      entry: ragEntry,
      categoryName: ragCategory.name,
    })
    .from(ragEntry)
    .leftJoin(ragCategory, eq(ragCategory.id, ragEntry.categoryId))
    .where(
      and(
        eq(ragEntry.personalForUserId, userId),
        isNull(ragEntry.deletedAt)
      )
    )
    .orderBy(desc(ragEntry.updatedAt));

  return rows.map((row) =>
    toSanitizedEntry(row.entry, { categoryName: row.categoryName ?? null })
  );
}

export async function createPersonalKnowledgeEntry({
  userId,
  title,
  content,
}: {
  userId: string;
  title: string;
  content: string;
}) {
  return createRagEntry({
    actorId: userId,
    input: {
      title,
      content,
      type: "text",
      status: "inactive",
      approvalStatus: "pending",
      tags: [],
      models: [],
      sourceUrl: null,
      metadata: { personalKnowledge: true },
      personalForUserId: userId,
      approvedBy: null,
    },
  });
}

export async function updatePersonalKnowledgeEntry({
  userId,
  entryId,
  title,
  content,
}: {
  userId: string;
  entryId: string;
  title: string;
  content: string;
}) {
  const existing = await getEntryById(entryId);
  if (!existing || existing.personalForUserId !== userId || existing.deletedAt) {
    throw new ChatSDKError("not_found:chat", "Personal knowledge not found");
  }

  const metadata =
    (existing.metadata as Record<string, unknown> | null | undefined) ?? {};
  const mergedMetadata = { ...metadata, personalKnowledge: true };

  return updateRagEntry({
    id: entryId,
    actorId: userId,
    input: {
      title,
      content,
      type: existing.type ?? "text",
      status: "inactive",
      approvalStatus: "pending",
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      models: Array.isArray(existing.models) ? existing.models : [],
      sourceUrl: existing.sourceUrl,
      metadata: mergedMetadata,
      categoryId: existing.categoryId,
      personalForUserId: userId,
      approvedBy: null,
    },
  });
}

export async function deletePersonalKnowledgeEntry({
  entryId,
  actorId,
  allowOverride = false,
}: {
  entryId: string;
  actorId: string;
  allowOverride?: boolean;
}) {
  const existing = await getEntryById(entryId);
  if (!existing || !existing.personalForUserId) {
    throw new ChatSDKError("not_found:chat", "Personal knowledge not found");
  }
  if (!allowOverride && existing.personalForUserId !== actorId) {
    throw new ChatSDKError("forbidden:chat", "You cannot delete this entry");
  }

  await deleteRagEntries({ ids: [entryId], actorId });
}

export async function listUserAddedKnowledgeEntries({
  limit = 200,
  approvalStatus,
}: {
  limit?: number;
  approvalStatus?: RagEntryApprovalStatus | "all";
} = {}): Promise<AdminRagEntry[]> {
  const conditions = [
    isNull(ragEntry.deletedAt),
    isNotNull(ragEntry.personalForUserId),
  ];

  if (approvalStatus && approvalStatus !== "all") {
    conditions.push(eq(ragEntry.approvalStatus, approvalStatus));
  }

  const rows = await db
    .select({
      entry: ragEntry,
      ownerId: user.id,
      ownerName: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      ownerEmail: user.email,
      retrievalCount: sql<number>`COALESCE(COUNT(${ragRetrievalLog.id}), 0)` ,
      lastRetrievedAt: sql<Date | null>`MAX(${ragRetrievalLog.createdAt})`,
      avgScore: sql<number | null>`AVG(${ragRetrievalLog.score})`,
      categoryName: ragCategory.name,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.personalForUserId))
    .leftJoin(ragCategory, eq(ragCategory.id, ragEntry.categoryId))
    .leftJoin(ragRetrievalLog, eq(ragRetrievalLog.ragEntryId, ragEntry.id))
    .where(and(...conditions))
    .groupBy(
      ragEntry.id,
      user.id,
      user.firstName,
      user.lastName,
      user.email,
      ragCategory.id,
      ragCategory.name
    )
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    entry: toSanitizedEntry(row.entry, { categoryName: row.categoryName ?? null }),
    creator: {
      id: row.ownerId ?? "",
      name: row.ownerName,
      email: row.ownerEmail,
    },
    retrievalCount: row.retrievalCount,
    lastRetrievedAt: (() => {
      if (!row.lastRetrievedAt) {
        return null;
      }
      if (row.lastRetrievedAt instanceof Date) {
        return row.lastRetrievedAt.toISOString();
      }
      const parsed = new Date(row.lastRetrievedAt as unknown as string);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })(),
    avgScore: row.avgScore,
  }));
}

export async function updateUserAddedKnowledgeApproval({
  entryId,
  approvalStatus,
  actorId,
}: {
  entryId: string;
  approvalStatus: RagEntryApprovalStatus;
  actorId: string;
}): Promise<SanitizedRagEntry> {
  const existing = await getEntryById(entryId);
  if (!existing || !existing.personalForUserId) {
    throw new ChatSDKError("not_found:chat", "Personal knowledge not found");
  }
  if (existing.deletedAt) {
    throw new ChatSDKError("bad_request:chat", "This entry has been deleted");
  }

  const now = new Date();
  const status: RagEntryStatus =
    approvalStatus === "approved" ? "active" : "inactive";
  const approvedBy =
    approvalStatus === "approved" || approvalStatus === "rejected" ? actorId : null;

  const [updated] = await db
    .update(ragEntry)
    .set({
      approvalStatus,
      status,
      approvedBy,
      updatedAt: now,
      version: existing.version + 1,
    })
    .where(eq(ragEntry.id, entryId))
    .returning();

  const diffFields: Record<string, { before: unknown; after: unknown }> = {
    approvalStatus: { before: existing.approvalStatus, after: approvalStatus },
  };
  if (existing.status !== status) {
    diffFields.status = { before: existing.status, after: status };
  }

  await db.insert(ragEntryVersion).values({
    ragEntryId: updated.id,
    version: updated.version,
    title: updated.title,
    content: updated.content,
    type: updated.type,
    status: updated.status,
    approvalStatus: updated.approvalStatus,
    personalForUserId: updated.personalForUserId,
    approvedBy: updated.approvedBy,
    tags: updated.tags,
    models: updated.models,
    sourceUrl: updated.sourceUrl,
    categoryId: updated.categoryId,
    diff: { fields: diffFields },
    changeSummary: `Approval set to ${approvalStatus}`,
    editorId: actorId,
  });

  await syncEmbedding(updated, { reembed: false });

  const categoryName = await getCategoryNameById(updated.categoryId);
  return toSanitizedEntry(updated, { categoryName });
}

export async function listAdminRagEntries(limit = 120): Promise<AdminRagEntry[]> {
  const rows = await db
    .select({
      entry: ragEntry,
      creatorId: user.id,
      creatorName: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      creatorEmail: user.email,
      retrievalCount: sql<number>`COALESCE(COUNT(${ragRetrievalLog.id}), 0)` ,
      lastRetrievedAt: sql<Date | null>`MAX(${ragRetrievalLog.createdAt})`,
      avgScore: sql<number | null>`AVG(${ragRetrievalLog.score})`,
      categoryName: ragCategory.name,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.addedBy))
    .leftJoin(ragCategory, eq(ragCategory.id, ragEntry.categoryId))
    .leftJoin(ragRetrievalLog, eq(ragRetrievalLog.ragEntryId, ragEntry.id))
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)))
    .groupBy(
      ragEntry.id,
      user.id,
      user.firstName,
      user.lastName,
      user.email,
      ragCategory.id,
      ragCategory.name
    )
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    entry: toSanitizedEntry(row.entry, { categoryName: row.categoryName ?? null }),
    creator: {
      id: row.creatorId ?? "",
      name: row.creatorName,
      email: row.creatorEmail,
    },
    retrievalCount: row.retrievalCount,
    lastRetrievedAt: (() => {
      if (!row.lastRetrievedAt) {
        return null;
      }
      if (row.lastRetrievedAt instanceof Date) {
        return row.lastRetrievedAt.toISOString();
      }
      const parsed = new Date(row.lastRetrievedAt as unknown as string);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    })(),
    avgScore: row.avgScore,
  }));
}

export async function getRagAnalyticsSummary(): Promise<RagAnalyticsSummary> {
  const [statusCounts] = await db
    .select({
      totalEntries: sql<number>`COUNT(*)`,
      activeEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'active' THEN 1 ELSE 0 END)` ,
      inactiveEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'inactive' THEN 1 ELSE 0 END)` ,
      archivedEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'archived' THEN 1 ELSE 0 END)` ,
      pendingEmbeddings: sql<number>`SUM(CASE WHEN ${ragEntry.embeddingStatus} <> 'ready' THEN 1 ELSE 0 END)` ,
    })
    .from(ragEntry)
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const modelUsage = await db
    .select({
      modelKey: ragRetrievalLog.modelKey,
      retrievals: sql<number>`COUNT(*)`,
    })
    .from(ragRetrievalLog)
    .where(gte(ragRetrievalLog.createdAt, sevenDaysAgo))
    .groupBy(ragRetrievalLog.modelKey)
    .orderBy(desc(sql<number>`COUNT(*)`));

  const creatorStats = await db
    .select({
      id: user.id,
      name: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      email: user.email,
      entryCount: sql<number>`COUNT(${ragEntry.id})`,
      activeEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'active' THEN 1 ELSE 0 END)` ,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.addedBy))
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)))
    .groupBy(user.id, user.firstName, user.lastName, user.email)
    .orderBy(desc(sql<number>`COUNT(${ragEntry.id})`))
    .limit(6);

  const retrievals7d = modelUsage.reduce(
    (total, usage) => total + usage.retrievals,
    0
  );

  return {
    totalEntries: statusCounts?.totalEntries ?? 0,
    activeEntries: statusCounts?.activeEntries ?? 0,
    inactiveEntries: statusCounts?.inactiveEntries ?? 0,
    archivedEntries: statusCounts?.archivedEntries ?? 0,
    pendingEmbeddings: statusCounts?.pendingEmbeddings ?? 0,
    retrievals7d,
    topModel: modelUsage[0]
      ? { modelKey: modelUsage[0].modelKey, retrievals: modelUsage[0].retrievals }
      : undefined,
    modelUsage,
    creatorStats: creatorStats.map((creator) => ({
      ...creator,
      id: creator.id ?? "",
    })),
  };
}

function passesModelFilter(entry: RagEntryModel, model: ModelConfig) {
  if (!entry.models?.length) {
    return true;
  }
  return entry.models.includes(model.id) || entry.models.includes(model.key);
}

export async function buildRagAugmentation({
  chatId,
  userId,
  modelConfig,
  queryText,
  useCustomKnowledge,
  threshold = DEFAULT_RAG_MATCH_THRESHOLD,
}: {
  chatId: string;
  userId: string;
  modelConfig: ModelConfig;
  queryText: string;
  useCustomKnowledge: boolean;
  threshold?: number;
}): Promise<
  | {
      systemSupplement: string;
      clientEvent: RagUsageEvent;
    }
  | null
> {
  if (!useCustomKnowledge) {
    return null;
  }

  if (!hasSupabaseConfig()) {
    return null;
  }

  const rawThreshold = Math.max(typeof threshold === "number" ? threshold : DEFAULT_RAG_MATCH_THRESHOLD, 0);
  const effectiveThreshold =
    queryText.trim().length < 40
      ? Math.min(Math.max(rawThreshold, 0.2), 0.4)
      : Math.min(rawThreshold, 1);
  const modelFilters = Array.from(
    new Set(
      [modelConfig.id, modelConfig.key].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    )
  );

  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) {
    return null;
  }

  const { vector } = await generateRagEmbedding(trimmedQuery);
  let matches = await withTimeout(
    searchSupabaseEmbeddings({
      embedding: vector,
      limit: DEFAULT_RAG_MATCH_LIMIT,
      threshold: effectiveThreshold,
      modelIds: modelFilters.length ? modelFilters : null,
      status: "active",
    }),
    DEFAULT_RAG_TIMEOUT_MS
  ).catch((error) => {
    console.warn("[rag] retrieval failed or timed out", error);
    return [] as SupabaseRagMatch[];
  });

  let filteredMatches = matches.filter((match) => {
    if (!match || typeof match.score !== "number") {
      return false;
    }
    return match.score >= effectiveThreshold;
  });
  if (!filteredMatches.length) {
    console.warn("[rag] no matches above threshold", {
      chatId,
      threshold: effectiveThreshold,
      matches: matches.length,
    });
    const fallbackThreshold = Math.max(0.15, Math.min(effectiveThreshold * 0.75, effectiveThreshold));
    matches = await withTimeout(
      searchSupabaseEmbeddings({
        embedding: vector,
        limit: DEFAULT_RAG_MATCH_LIMIT,
        threshold: fallbackThreshold,
        modelIds: [modelConfig.id],
        status: "active",
      }),
      DEFAULT_RAG_TIMEOUT_MS
    ).catch((error) => {
      console.warn("[rag] fallback retrieval failed or timed out", error);
      return [] as SupabaseRagMatch[];
    });
    filteredMatches = matches.filter((match) => {
      if (!match || typeof match.score !== "number") {
        return false;
      }
      return match.score >= fallbackThreshold;
    });
    if (!filteredMatches.length) {
      console.warn("[rag] fallback search also returned no matches", {
        chatId,
        threshold: fallbackThreshold,
      });
      return {
        systemSupplement: NO_MATCH_SUPPLEMENT,
        clientEvent: {
          chatId,
          modelId: modelConfig.id,
          modelName: modelConfig.displayName,
          entries: [],
        },
      };
    }
  }

  const ids = filteredMatches.map((match) => match.rag_entry_id);
  const rows = await db
    .select()
    .from(ragEntry)
    .where(
      and(
        inArray(ragEntry.id, ids),
        isNull(ragEntry.deletedAt),
        eq(ragEntry.approvalStatus, "approved")
      )
    );

  const entryMap = new Map(rows.map((row) => [row.id, row]));

  const resolved = filteredMatches
    .map((match) => {
      const entry = entryMap.get(match.rag_entry_id);
      if (!entry) {
        return null;
      }
      if (entry.status !== "active" || entry.approvalStatus !== "approved") {
        return null;
      }
      if (!passesModelFilter(entry, modelConfig)) {
        return null;
      }
      const chunkIndex =
        typeof match.metadata?.chunkIndex === "number"
          ? match.metadata.chunkIndex
          : null;
      return {
        entry,
        score: match.score,
        chunkContent: match.content,
        chunkIndex,
        chunkId: match.chunk_id ?? null,
      };
    })
    .filter(Boolean) as Array<{
    entry: RagEntryModel;
    score: number;
    chunkContent: string;
    chunkIndex: number | null;
    chunkId: string | null;
  }>;

  if (!resolved.length) {
    console.warn("[rag] matches filtered out after validation", {
      chatId,
      rawMatches: matches.length,
    });
    // Fallback to a simple word-based content/title search in DB
    const terms = trimmedQuery
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3)
      .slice(0, 5);

    const wordConditions =
      terms.length > 0
        ? terms.map((term) =>
            or(
              ilike(ragEntry.content, `%${term}%`),
              ilike(ragEntry.title, `%${term}%`)
            )
          )
        : [ilike(ragEntry.content, `%${trimmedQuery}%`)];

    const fallbackRows = await db
      .select({
        entry: ragEntry,
        chunkContent: ragChunk.content,
        chunkIndex: ragChunk.chunkIndex,
        chunkId: ragChunk.id,
      })
      .from(ragChunk)
      .innerJoin(ragEntry, eq(ragChunk.entryId, ragEntry.id))
      .where(
        and(
          isNull(ragEntry.deletedAt),
          eq(ragEntry.status, "active"),
          eq(ragEntry.approvalStatus, "approved"),
          wordConditions.length > 1 ? or(...wordConditions) : wordConditions[0]
        )
      )
      .limit(DEFAULT_RAG_MATCH_LIMIT * 4);

    const fallbackResolved = fallbackRows
      .filter(({ entry }) => passesModelFilter(entry, modelConfig))
      .map(({ entry, chunkContent, chunkIndex, chunkId }) => ({
        entry,
        score: 0.01,
        chunkContent: trimContent(chunkContent ?? entry.content),
        chunkIndex: chunkIndex ?? null,
        chunkId: chunkId ?? null,
      }))
      .slice(0, DEFAULT_RAG_MATCH_LIMIT);

    if (!fallbackResolved.length) {
      return {
        systemSupplement: NO_MATCH_SUPPLEMENT,
        clientEvent: {
          chatId,
          modelId: modelConfig.id,
          modelName: modelConfig.displayName,
          entries: [],
        },
      };
    }

    return composeRagResult({
      resolved: fallbackResolved,
      chatId,
      modelConfig,
      trimmedQuery,
      userId,
    });
  }

  return composeRagResult({
    resolved,
    chatId,
    modelConfig,
    trimmedQuery,
    userId,
  });
}

export { CUSTOM_KNOWLEDGE_STORAGE_KEY };

export async function rebuildAllRagEmbeddings() {
  const entries = await db
    .select()
    .from(ragEntry)
    .where(isNull(ragEntry.deletedAt));

  for (const entry of entries) {
    try {
      await syncEmbedding(entry, { reembed: true });
    } catch (error) {
      await db
        .update(ragEntry)
        .set({
          embeddingStatus: "failed",
          embeddingError: error instanceof Error ? error.message : "Embedding failed",
        })
        .where(eq(ragEntry.id, entry.id));
      console.warn("[rag] rebuild embedding failed", { entryId: entry.id, error });
    }
  }
}
