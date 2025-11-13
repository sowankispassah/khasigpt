import "server-only";

import { diff_match_patch } from "diff-match-patch";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db/queries";
import {
  ragEntry,
  ragEntryVersion,
  ragRetrievalLog,
  ragCategory,
  user,
  type RagEntry as RagEntryModel,
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
} from "./supabase";
import {
  CUSTOM_KNOWLEDGE_STORAGE_KEY,
  DEFAULT_RAG_MATCH_LIMIT,
  DEFAULT_RAG_MATCH_THRESHOLD,
  DEFAULT_RAG_VERSION_HISTORY_LIMIT,
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

async function syncEmbedding(entry: RagEntryModel, { reembed } = { reembed: true }) {
  if (!hasSupabaseConfig()) {
    return;
  }

  if (!reembed) {
    await patchSupabaseEmbedding(entry);
    return;
  }

  const payloadText = buildEmbeddableText(entry);
  const { vector, model, dimensions } = await generateRagEmbedding(payloadText);
  await upsertSupabaseEmbedding({
    entry: { ...entry, content: payloadText },
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
  compare("tags");
  compare("models");
  compare("sourceUrl");
  compare("categoryId");

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
  const parsed = ragEntrySchema.parse(input);
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

  const parsed = ragEntrySchema.parse({ ...input, id });
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
    .where(isNull(ragEntry.deletedAt))
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
    .where(isNull(ragEntry.deletedAt));

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
    .where(isNull(ragEntry.deletedAt))
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

function passesModelFilter(entry: RagEntryModel, modelId: string) {
  if (!entry.models?.length) {
    return true;
  }
  return entry.models.includes(modelId);
}

function filterByThreshold(match: SupabaseRagMatch | null) {
  if (!match) {
    return false;
  }
  if (typeof match.score !== "number") {
    return false;
  }
  return match.score >= DEFAULT_RAG_MATCH_THRESHOLD;
}

export async function buildRagAugmentation({
  chatId,
  userId,
  modelConfig,
  queryText,
  useCustomKnowledge,
}: {
  chatId: string;
  userId: string;
  modelConfig: ModelConfig;
  queryText: string;
  useCustomKnowledge: boolean;
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

  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) {
    return null;
  }

  const { vector } = await generateRagEmbedding(trimmedQuery);
  const matches = await searchSupabaseEmbeddings({
    embedding: vector,
    limit: DEFAULT_RAG_MATCH_LIMIT,
    threshold: DEFAULT_RAG_MATCH_THRESHOLD,
    modelIds: [modelConfig.id],
    status: "active",
  });

  const filteredMatches = matches.filter(filterByThreshold);
  if (!filteredMatches.length) {
    return null;
  }

  const ids = filteredMatches.map((match) => match.rag_entry_id);
  const rows = await db
    .select()
    .from(ragEntry)
    .where(and(inArray(ragEntry.id, ids), isNull(ragEntry.deletedAt)));

  const entryMap = new Map(rows.map((row) => [row.id, row]));

  const resolved = filteredMatches
    .map((match) => {
      const entry = entryMap.get(match.rag_entry_id);
      if (!entry) {
        return null;
      }
      if (entry.status !== "active") {
        return null;
      }
      if (!passesModelFilter(entry, modelConfig.id)) {
        return null;
      }
      return { entry, score: match.score };
    })
    .filter(Boolean) as Array<{ entry: RagEntryModel; score: number }>;

  if (!resolved.length) {
    return null;
  }

  const systemSupplement = resolved
    .map(({ entry }) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const clientEvent: RagUsageEvent = {
    chatId,
    modelId: modelConfig.id,
    modelName: modelConfig.displayName,
    entries: resolved.map(({ entry, score }) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      tags: entry.tags,
      sourceUrl: entry.sourceUrl ?? null,
      score,
    })),
  };

  await db.insert(ragRetrievalLog).values(
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
  );

  return {
    systemSupplement,
    clientEvent,
  };
}

export { CUSTOM_KNOWLEDGE_STORAGE_KEY };
