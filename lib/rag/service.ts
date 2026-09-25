import "server-only";

import { diff_match_patch } from "diff-match-patch";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { db } from "@/lib/db/queries";
import {
  type RagEntryApprovalStatus,
  type RagEntry as RagEntryModel,
  type RagEntryStatus,
  ragEntry,
  ragEntryVersion,
  user,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { DEFAULT_RAG_VERSION_HISTORY_LIMIT } from "./constants";
import { indexRagEntry } from "./indexing";
import { detectQueryLanguage } from "./language";
import type {
  AdminRagEntry,
  RagAnalyticsSummary,
  SanitizedRagEntry,
  UpsertRagEntryInput,
} from "./types";
import {
  normalizeModels,
  normalizeSourceUrl,
  normalizeTags,
  sanitizeRagContent,
} from "./utils";
import { ragEntrySchema } from "./validation";

const diffEngine = new diff_match_patch();
const JOBS_RAG_KIND = "job_posting";
const JOBS_RAG_SOURCE = "supabase_jobs_table";

function customAdminRagEntryCondition() {
  return sql<boolean>`NOT (
    COALESCE(${ragEntry.metadata} ->> 'jobs_kind', '') = ${JOBS_RAG_KIND}
    OR COALESCE(${ragEntry.metadata} ->> 'jobs_source', '') = ${JOBS_RAG_SOURCE}
    OR COALESCE(${ragEntry.metadata} ->> 'category', '') = 'job_postings'
  )`;
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeRagEntryMetadata(value: unknown) {
  const metadata = { ...toMetadataRecord(value) };
  const scope =
    typeof metadata.chatScope === "string"
      ? metadata.chatScope.trim().toLowerCase()
      : "";
  if (!["default", "identity", "study", "jobs", "shared"].includes(scope)) {
    delete metadata.chatScope;
  } else {
    metadata.chatScope = scope;
  }
  return metadata;
}

function mergeRagEntryMetadata(existing: unknown, incoming: unknown) {
  return normalizeRagEntryMetadata({
    ...toMetadataRecord(existing),
    ...toMetadataRecord(incoming),
  });
}

function toSanitizedEntry(entry: RagEntryModel): SanitizedRagEntry {
  return {
    ...entry,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    models: Array.isArray(entry.models) ? entry.models : [],
    metadata: toMetadataRecord(entry.metadata),
  };
}

async function getEntryById(id: string) {
  const [entry] = await db
    .select()
    .from(ragEntry)
    .where(eq(ragEntry.id, id))
    .limit(1);
  return entry ?? null;
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
      fields[key as string] = { before: previous[key], after: next[key] };
    }
  };
  (
    [
      "title",
      "content",
      "type",
      "status",
      "approvalStatus",
      "tags",
      "models",
      "sourceUrl",
      "language",
      "priority",
      "metadata",
      "personalForUserId",
      "approvedBy",
    ] as const
  ).forEach(compare);

  let textDelta: string | undefined;
  if (previous.content !== next.content) {
    const diff = diffEngine.diff_main(previous.content, next.content);
    diffEngine.diff_cleanupSemantic(diff);
    textDelta = diffEngine.diff_toDelta(diff);
  }
  return { fields, textDelta };
}

async function writeVersion({
  entry,
  actorId,
  diff,
  changeSummary,
}: {
  entry: RagEntryModel;
  actorId: string;
  diff: Record<string, unknown>;
  changeSummary: string;
}) {
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
    language: entry.language,
    priority: entry.priority,
    metadata: entry.metadata,
    diff,
    changeSummary,
    editorId: actorId,
  });
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
    language: input.language ?? detectQueryLanguage(input.content),
    priority: input.priority ?? 0,
    approvalStatus: input.approvalStatus ?? "approved",
    personalForUserId: input.personalForUserId ?? null,
    approvedBy:
      input.approvedBy ??
      ((input.approvalStatus ?? "approved") === "approved" ? actorId : null),
  });
  const now = new Date();
  const [created] = await db
    .insert(ragEntry)
    .values({
      ...(parsed.id ? { id: parsed.id } : {}),
      title: parsed.title.trim(),
      content: sanitizeRagContent(parsed.content),
      type: parsed.type,
      status: parsed.status,
      approvalStatus: parsed.approvalStatus,
      personalForUserId: parsed.personalForUserId ?? null,
      approvedBy: parsed.approvedBy ?? null,
      tags: normalizeTags(parsed.tags),
      models: await normalizeModelAssignments(normalizeModels(parsed.models)),
      sourceUrl: normalizeSourceUrl(parsed.sourceUrl),
      language: parsed.language,
      priority: parsed.priority,
      metadata: normalizeRagEntryMetadata(parsed.metadata),
      addedBy: actorId,
      createdAt: now,
      updatedAt: now,
      embeddingStatus: "pending",
    })
    .returning();
  if (!created) {
    throw new ChatSDKError("bad_request:api", "Unable to create RAG entry");
  }

  await writeVersion({
    entry: created,
    actorId,
    diff: { fields: {} },
    changeSummary: "Initial version",
  });
  await indexRagEntry(created.id);
  return toSanitizedEntry((await getEntryById(created.id)) ?? created);
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
  const approvalStatus = input.approvalStatus ?? existing.approvalStatus;
  const parsed = ragEntrySchema.parse({
    ...input,
    id,
    language: input.language ?? existing.language,
    priority: input.priority ?? existing.priority,
    approvalStatus,
    personalForUserId:
      input.personalForUserId ?? existing.personalForUserId ?? null,
    approvedBy:
      input.approvedBy ??
      (approvalStatus === "approved" ? existing.approvedBy ?? actorId : null),
  });
  const title = parsed.title.trim();
  const content = sanitizeRagContent(parsed.content);
  const tags = normalizeTags(parsed.tags);
  const models = await normalizeModelAssignments(normalizeModels(parsed.models));
  const sourceUrl = normalizeSourceUrl(parsed.sourceUrl);
  const metadata =
    input.metadata === undefined
      ? toMetadataRecord(existing.metadata)
      : mergeRagEntryMetadata(existing.metadata, parsed.metadata);
  const shouldReindex =
    title !== existing.title ||
    content !== existing.content ||
    parsed.status !== existing.status ||
    parsed.approvalStatus !== existing.approvalStatus ||
    parsed.language !== existing.language ||
    JSON.stringify(tags) !== JSON.stringify(existing.tags) ||
    JSON.stringify(models) !== JSON.stringify(existing.models) ||
    JSON.stringify(metadata) !== JSON.stringify(existing.metadata);

  const [updated] = await db
    .update(ragEntry)
    .set({
      title,
      content,
      type: parsed.type,
      status: parsed.status,
      approvalStatus: parsed.approvalStatus,
      personalForUserId: parsed.personalForUserId ?? null,
      approvedBy: parsed.approvedBy ?? null,
      tags,
      models,
      sourceUrl,
      language: parsed.language,
      priority: parsed.priority,
      metadata,
      version: existing.version + 1,
      updatedAt: new Date(),
      embeddingStatus: shouldReindex ? "pending" : existing.embeddingStatus,
    })
    .where(eq(ragEntry.id, id))
    .returning();
  if (!updated) {
    throw new ChatSDKError("bad_request:api", "Unable to update RAG entry");
  }

  await writeVersion({
    entry: updated,
    actorId,
    diff: buildVersionDiff(existing, updated),
    changeSummary: "Entry updated",
  });
  if (shouldReindex) {
    await indexRagEntry(updated.id);
  }
  return toSanitizedEntry((await getEntryById(updated.id)) ?? updated);
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
  const updated = await db
    .update(ragEntry)
    .set({
      status,
      updatedAt: new Date(),
      version: sql`${ragEntry.version} + 1`,
      embeddingStatus: "pending",
    })
    .where(
      and(
        inArray(ragEntry.id, ids),
        isNull(ragEntry.deletedAt),
        isNull(ragEntry.personalForUserId),
        customAdminRagEntryCondition(),
      ),
    )
    .returning();
  await Promise.all(
    updated.map(async (entry) => {
      await writeVersion({
        entry,
        actorId,
        diff: { fields: { status: { before: null, after: status } } },
        changeSummary: `Status changed to ${status}`,
      });
      await indexRagEntry(entry.id);
    }),
  );
  return updated.map(toSanitizedEntry);
}

export async function deleteRagEntries({
  customOnly = false,
  ids,
  actorId,
}: {
  customOnly?: boolean;
  ids: string[];
  actorId: string;
}) {
  if (!ids.length) {
    return;
  }
  const condition = customOnly
    ? and(
        inArray(ragEntry.id, ids),
        isNull(ragEntry.deletedAt),
        isNull(ragEntry.personalForUserId),
        customAdminRagEntryCondition(),
      )
    : inArray(ragEntry.id, ids);
  const updated = await db
    .update(ragEntry)
    .set({
      status: "archived",
      deletedAt: new Date(),
      updatedAt: new Date(),
      version: sql`${ragEntry.version} + 1`,
      embeddingStatus: "pending",
    })
    .where(condition)
    .returning();
  await Promise.all(
    updated.map(async (entry) => {
      await writeVersion({
        entry,
        actorId,
        diff: { fields: { status: { before: null, after: "archived" } } },
        changeSummary: "Entry archived",
      });
      await indexRagEntry(entry.id);
    }),
  );
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
      embeddingStatus: "pending",
    })
    .where(eq(ragEntry.id, id))
    .returning();
  if (updated) {
    await writeVersion({
      entry: updated,
      actorId,
      diff: { fields: { deletedAt: { before: true, after: false } } },
      changeSummary: "Entry restored",
    });
    await indexRagEntry(updated.id);
  }
}

export function getRagVersions(entryId: string) {
  return db
    .select({
      id: ragEntryVersion.id,
      version: ragEntryVersion.version,
      title: ragEntryVersion.title,
      status: ragEntryVersion.status,
      createdAt: ragEntryVersion.createdAt,
      changeSummary: ragEntryVersion.changeSummary,
      editorName: sql<
        string | null
      >`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
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
  const [snapshot] = await db
    .select()
    .from(ragEntryVersion)
    .where(eq(ragEntryVersion.id, versionId))
    .limit(1);
  const existing = await getEntryById(entryId);
  if (!snapshot || !existing) {
    throw new ChatSDKError("not_found:chat", "RAG version not found");
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
      language: snapshot.language,
      priority: snapshot.priority,
      metadata: snapshot.metadata,
      version: existing.version + 1,
      updatedAt: new Date(),
      embeddingStatus: "pending",
    })
    .where(eq(ragEntry.id, entryId))
    .returning();
  if (updated) {
    await writeVersion({
      entry: updated,
      actorId,
      diff: buildVersionDiff(existing, updated),
      changeSummary: `Restored version ${snapshot.version}`,
    });
    await indexRagEntry(updated.id);
  }
}

export async function listPersonalKnowledgeForUser(userId: string) {
  const rows = await db
    .select()
    .from(ragEntry)
    .where(
      and(eq(ragEntry.personalForUserId, userId), isNull(ragEntry.deletedAt)),
    )
    .orderBy(desc(ragEntry.updatedAt));
  return rows.map(toSanitizedEntry);
}

export function createPersonalKnowledgeEntry({
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
      metadata: { personalKnowledge: true, chatScope: "default" },
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
  return updateRagEntry({
    id: entryId,
    actorId: userId,
    input: {
      title,
      content,
      type: existing.type,
      status: "inactive",
      approvalStatus: "pending",
      tags: existing.tags,
      models: existing.models,
      sourceUrl: existing.sourceUrl,
      language: detectQueryLanguage(content),
      priority: existing.priority,
      metadata: { ...toMetadataRecord(existing.metadata), personalKnowledge: true },
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
  if (!existing?.personalForUserId) {
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
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.personalForUserId))
    .where(and(...conditions))
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    entry: toSanitizedEntry(row.entry),
    creator: {
      id: row.ownerId ?? "",
      name: row.ownerName,
      email: row.ownerEmail,
    },
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
  if (!existing?.personalForUserId || existing.deletedAt) {
    throw new ChatSDKError("not_found:chat", "Personal knowledge not found");
  }
  const status: RagEntryStatus =
    approvalStatus === "approved" ? "active" : "inactive";
  const [updated] = await db
    .update(ragEntry)
    .set({
      approvalStatus,
      status,
      approvedBy: approvalStatus === "pending" ? null : actorId,
      updatedAt: new Date(),
      version: existing.version + 1,
      embeddingStatus: "pending",
    })
    .where(eq(ragEntry.id, entryId))
    .returning();
  if (!updated) {
    throw new ChatSDKError("bad_request:api", "Unable to review entry");
  }
  await writeVersion({
    entry: updated,
    actorId,
    diff: {
      fields: {
        approvalStatus: {
          before: existing.approvalStatus,
          after: approvalStatus,
        },
        status: { before: existing.status, after: status },
      },
    },
    changeSummary: `Approval set to ${approvalStatus}`,
  });
  await indexRagEntry(updated.id);
  return toSanitizedEntry((await getEntryById(updated.id)) ?? updated);
}

export async function listAdminRagEntries(
  limit = 120,
): Promise<AdminRagEntry[]> {
  const rows = await db
    .select({
      entry: ragEntry,
      creatorId: user.id,
      creatorName: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      creatorEmail: user.email,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.addedBy))
    .where(
      and(
        isNull(ragEntry.deletedAt),
        isNull(ragEntry.personalForUserId),
        customAdminRagEntryCondition(),
      ),
    )
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    entry: toSanitizedEntry(row.entry),
    creator: {
      id: row.creatorId ?? "",
      name: row.creatorName,
      email: row.creatorEmail,
    },
  }));
}

export async function getRagAnalyticsSummary(): Promise<RagAnalyticsSummary> {
  const condition = and(
    isNull(ragEntry.deletedAt),
    isNull(ragEntry.personalForUserId),
    customAdminRagEntryCondition(),
  );
  const [statusCounts, creatorStats] = await Promise.all([
    db
      .select({
        totalEntries: sql<number>`COUNT(*)`,
        activeEntries: sql<number>`COUNT(*) FILTER (WHERE ${ragEntry.status} = 'active')`,
        inactiveEntries: sql<number>`COUNT(*) FILTER (WHERE ${ragEntry.status} = 'inactive')`,
        archivedEntries: sql<number>`COUNT(*) FILTER (WHERE ${ragEntry.status} = 'archived')`,
        pendingEmbeddings: sql<number>`COUNT(*) FILTER (WHERE ${ragEntry.embeddingStatus} <> 'ready')`,
      })
      .from(ragEntry)
      .where(condition),
    db
      .select({
        id: user.id,
        name: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
        email: user.email,
        entryCount: sql<number>`COUNT(${ragEntry.id})`,
        activeEntries: sql<number>`COUNT(*) FILTER (WHERE ${ragEntry.status} = 'active')`,
      })
      .from(ragEntry)
      .leftJoin(user, eq(user.id, ragEntry.addedBy))
      .where(condition)
      .groupBy(user.id, user.firstName, user.lastName, user.email)
      .orderBy(desc(sql<number>`COUNT(${ragEntry.id})`))
      .limit(6),
  ]);
  const counts = statusCounts[0];
  return {
    totalEntries: Number(counts?.totalEntries ?? 0),
    activeEntries: Number(counts?.activeEntries ?? 0),
    inactiveEntries: Number(counts?.inactiveEntries ?? 0),
    archivedEntries: Number(counts?.archivedEntries ?? 0),
    pendingEmbeddings: Number(counts?.pendingEmbeddings ?? 0),
    creatorStats: creatorStats.map((creator) => ({
      ...creator,
      id: creator.id ?? "",
      entryCount: Number(creator.entryCount),
      activeEntries: Number(creator.activeEntries),
    })),
  };
}

export async function listActiveRagEntryIdsForModel({
  modelConfigId,
  modelKey,
}: {
  modelConfigId: string;
  modelKey?: string | null;
}): Promise<string[]> {
  const modelCondition = modelKey
    ? sql`(
        cardinality(${ragEntry.models}) = 0
        OR ${modelConfigId} = ANY(${ragEntry.models})
        OR ${modelKey} = ANY(${ragEntry.models})
      )`
    : or(
        sql`cardinality(${ragEntry.models}) = 0`,
        sql`${modelConfigId} = ANY(${ragEntry.models})`,
      );
  const rows = await db
    .select({ id: ragEntry.id })
    .from(ragEntry)
    .where(
      and(
        isNull(ragEntry.deletedAt),
        eq(ragEntry.status, "active"),
        eq(ragEntry.approvalStatus, "approved"),
        modelCondition,
      ),
    )
    .orderBy(desc(ragEntry.updatedAt));
  return rows.map((row) => row.id);
}

export async function rebuildAllRagIndexes() {
  const entries = await db
    .select({ id: ragEntry.id })
    .from(ragEntry)
    .where(
      and(
        isNull(ragEntry.deletedAt),
        isNull(ragEntry.personalForUserId),
        customAdminRagEntryCondition(),
      ),
    );
  let reindexed = 0;
  let failed = 0;
  for (let index = 0; index < entries.length; index += 3) {
    const results = await Promise.all(
      entries
        .slice(index, index + 3)
        .map((entry) => indexRagEntry(entry.id)),
    );
    reindexed += results.filter((result) => result.status === "ready").length;
    failed += results.filter((result) => result.status === "failed").length;
  }
  return {
    processed: entries.length,
    reindexed,
    failed,
    scope: "custom_rag",
  };
}
