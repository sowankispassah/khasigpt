import "server-only";

import { diff_match_patch } from "diff-match-patch";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { db } from "@/lib/db/queries";
import {
  type RagEntryApprovalStatus,
  type RagEntry as RagEntryModel,
  type RagEntryStatus,
  ragCategory,
  ragEntry,
  ragEntryVersion,
  user,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { DEFAULT_RAG_VERSION_HISTORY_LIMIT } from "./constants";
import {
  deleteFileSearchDocument,
  deleteGeminiFile,
  extractDocumentNameFromOperation,
  findFileSearchDocumentNameByRagEntryId,
  type GeminiFileSearchCustomMetadata,
  getGeminiApiKey,
  getGeminiFileSearchStoreName,
  importFileToSearchStore,
  normalizeFileSearchDocumentName,
  uploadFileResumable,
  waitForFileSearchOperation,
} from "./gemini-file-search";
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
const GEMINI_FILE_SEARCH_METADATA_KEY = "geminiFileSearch";

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

export function listRagCategories() {
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
    throw new ChatSDKError("bad_request:api", "Category name is required");
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
    throw new ChatSDKError("bad_request:api", "Unable to create category");
  }

  return record;
}

function buildIndexableText(entry: RagEntryModel) {
  const tags =
    Array.isArray(entry.tags) && entry.tags.length
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

function readGeminiFileSearchDocumentName(
  entry: RagEntryModel
): string | null {
  const metadata =
    (entry.metadata as Record<string, unknown> | null | undefined) ?? {};
  const geminiMetadata = metadata[GEMINI_FILE_SEARCH_METADATA_KEY] as any;
  const documentName =
    typeof geminiMetadata?.documentName === "string"
      ? geminiMetadata.documentName
      : null;
  return normalizeFileSearchDocumentName(documentName);
}

async function syncGeminiFileSearchIndex(entry: RagEntryModel) {
  const storeName = getGeminiFileSearchStoreName();
  const apiKey = getGeminiApiKey();
  const canUseGemini = Boolean(storeName && apiKey);

  const shouldIndex =
    entry.status === "active" &&
    entry.approvalStatus === "approved" &&
    !entry.deletedAt;

  const existingDocumentName = readGeminiFileSearchDocumentName(entry);
  const metadata =
    (entry.metadata as Record<string, unknown> | null | undefined) ?? {};
  const removeGeminiMetadata = () => {
    const { [GEMINI_FILE_SEARCH_METADATA_KEY]: _omit, ...rest } = metadata;
    return rest;
  };

  const markFailed = async (error: unknown) => {
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "failed",
        embeddingError:
          error instanceof Error ? error.message : "File Search indexing failed",
        embeddingUpdatedAt: new Date(),
      })
      .where(eq(ragEntry.id, entry.id));
  };

  if (!shouldIndex) {
    if (!canUseGemini) {
      await db
        .update(ragEntry)
        .set({
          metadata: removeGeminiMetadata(),
          embeddingStatus: "ready",
          embeddingModel: "gemini-file-search",
          embeddingDimensions: null,
          embeddingError: null,
          embeddingUpdatedAt: new Date(),
        })
        .where(eq(ragEntry.id, entry.id));
      return;
    }

    const documentNamesToDelete = new Set<string>();
    if (existingDocumentName) {
      documentNamesToDelete.add(existingDocumentName);
    } else if (storeName) {
      const discovered = await findFileSearchDocumentNameByRagEntryId({
        fileSearchStoreName: storeName,
        ragEntryId: entry.id,
      });
      if (discovered) {
        documentNamesToDelete.add(
          normalizeFileSearchDocumentName(discovered) ?? discovered
        );
      }
    }

    if (documentNamesToDelete.size === 0) {
      await db
        .update(ragEntry)
        .set({
          metadata: removeGeminiMetadata(),
          embeddingStatus: "ready",
          embeddingModel: "gemini-file-search",
          embeddingDimensions: null,
          embeddingError: null,
          embeddingUpdatedAt: new Date(),
        })
        .where(eq(ragEntry.id, entry.id));
      return;
    }

    try {
      for (const documentName of documentNamesToDelete) {
        await deleteFileSearchDocument(documentName);
      }

      await db
        .update(ragEntry)
        .set({
          metadata: removeGeminiMetadata(),
          embeddingStatus: "ready",
          embeddingModel: "gemini-file-search",
          embeddingDimensions: null,
          embeddingError: null,
          embeddingUpdatedAt: new Date(),
        })
        .where(eq(ragEntry.id, entry.id));
    } catch (error) {
      console.warn("[rag] failed to de-index File Search document", {
        entryId: entry.id,
        documentName: existingDocumentName,
        error,
      });
      await markFailed(error);
    }
    return;
  }

  if (!storeName) {
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "failed",
        embeddingError:
          "Missing GEMINI_FILE_SEARCH_STORE_NAME. Cannot index custom knowledge into Gemini File Search.",
        embeddingUpdatedAt: new Date(),
      })
      .where(eq(ragEntry.id, entry.id));
    return;
  }
  if (!apiKey) {
    await db
      .update(ragEntry)
      .set({
        embeddingStatus: "failed",
        embeddingError:
          "Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).",
        embeddingUpdatedAt: new Date(),
      })
      .where(eq(ragEntry.id, entry.id));
    return;
  }

  await db
    .update(ragEntry)
    .set({
      embeddingStatus: "pending",
      embeddingError: null,
    })
    .where(eq(ragEntry.id, entry.id));

  try {
    if (existingDocumentName) {
      await deleteFileSearchDocument(existingDocumentName);
    }

    const title = entry.title?.trim() ?? "";
    const displayNameBase = title.length > 0 ? title : `RAG ${entry.id}`;
    const displayName = `${displayNameBase}`.slice(0, 512);

    const rawModels = Array.isArray(entry.models) ? entry.models : [];
    const modelValues = new Set<string>();
    for (const value of rawModels) {
      if (typeof value === "string" && value.trim().length > 0) {
        modelValues.add(value.trim());
      }
    }
    if (modelValues.size === 0) {
      modelValues.add("*");
    } else {
      const registry = await getModelRegistry();
      const idToKey = new Map(registry.configs.map((config) => [config.id, config.key]));
      for (const value of rawModels) {
        const key = idToKey.get(value);
        if (key) {
          modelValues.add(key);
        }
      }
    }

    const customMetadata: GeminiFileSearchCustomMetadata[] = [
      { key: "rag_entry_id", stringValue: entry.id },
      { key: "models", stringListValue: { values: Array.from(modelValues) } },
    ];

    const bytes = new TextEncoder().encode(buildIndexableText(entry));
    const uploadedFile = await uploadFileResumable({
      bytes,
      mimeType: "text/plain",
      displayName,
    });

    let documentName: string | null = null;
    try {
      const operation = await importFileToSearchStore({
        fileSearchStoreName: storeName,
        fileName: uploadedFile.name,
        customMetadata,
      });

      const finished = await waitForFileSearchOperation({
        operationName: operation.name,
      });

      documentName =
        extractDocumentNameFromOperation(finished) ??
        (await findFileSearchDocumentNameByRagEntryId({
          fileSearchStoreName: storeName,
          ragEntryId: entry.id,
        }));
      if (!documentName) {
        throw new Error(
          `Gemini importFile operation finished without a document name (${operation.name}).`
        );
      }
    } finally {
      deleteGeminiFile(uploadedFile.name).catch((error) => {
        console.warn("[rag] failed to delete temporary Gemini file", {
          entryId: entry.id,
          fileName: uploadedFile.name,
          error,
        });
      });
    }

    const nextMetadata = {
      ...removeGeminiMetadata(),
      [GEMINI_FILE_SEARCH_METADATA_KEY]: {
        storeName,
        documentName,
        indexedAt: new Date().toISOString(),
      },
    };

    await db
      .update(ragEntry)
      .set({
        metadata: nextMetadata,
        embeddingStatus: "ready",
        embeddingModel: "gemini-file-search",
        embeddingDimensions: null,
        embeddingError: null,
        embeddingUpdatedAt: new Date(),
        supabaseVectorId: null,
      })
      .where(eq(ragEntry.id, entry.id));
  } catch (error) {
    console.warn("[rag] Gemini File Search index sync failed", {
      entryId: entry.id,
      error,
    });
    await markFailed(error);
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
  const models = await normalizeModelAssignments(
    normalizeModels(parsed.models)
  );
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
      approvedBy:
        parsed.approvedBy ??
        (parsed.approvalStatus === "approved" ? actorId : null),
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
    await syncGeminiFileSearchIndex(created);
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
    input.approvedBy ?? (approvalStatus === "approved" ? actorId : null);

  const parsed = ragEntrySchema.parse({
    ...input,
    id,
    approvalStatus,
    personalForUserId,
    approvedBy,
  });
  const tags = normalizeTags(parsed.tags);
  const models = await normalizeModelAssignments(
    normalizeModels(parsed.models)
  );
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
          ? (parsed.approvedBy ?? existing.approvedBy ?? actorId)
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
      await syncGeminiFileSearchIndex(updated);
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
    await syncGeminiFileSearchIndex(updated);
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

    await syncGeminiFileSearchIndex(entry);
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

    await syncGeminiFileSearchIndex(entry);
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

  await syncGeminiFileSearchIndex(updated);
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

  await syncGeminiFileSearchIndex(updated);
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
      and(eq(ragEntry.personalForUserId, userId), isNull(ragEntry.deletedAt))
    )
    .orderBy(desc(ragEntry.updatedAt));

  return rows.map((row) =>
    toSanitizedEntry(row.entry, { categoryName: row.categoryName ?? null })
  );
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
  if (
    !existing ||
    existing.personalForUserId !== userId ||
    existing.deletedAt
  ) {
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
      categoryName: ragCategory.name,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.personalForUserId))
    .leftJoin(ragCategory, eq(ragCategory.id, ragEntry.categoryId))
    .where(and(...conditions))
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);

  return rows.map((row) => {
    return {
      entry: toSanitizedEntry(row.entry, {
        categoryName: row.categoryName ?? null,
      }),
      creator: {
        id: row.ownerId ?? "",
        name: row.ownerName,
        email: row.ownerEmail,
      },
    };
  });
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
    approvalStatus === "approved" || approvalStatus === "rejected"
      ? actorId
      : null;

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

  await syncGeminiFileSearchIndex(updated);

  const categoryName = await getCategoryNameById(updated.categoryId);
  return toSanitizedEntry(updated, { categoryName });
}

export async function listAdminRagEntries(
  limit = 120
): Promise<AdminRagEntry[]> {
  const rows = await db
    .select({
      entry: ragEntry,
      creatorId: user.id,
      creatorName: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      creatorEmail: user.email,
      categoryName: ragCategory.name,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.addedBy))
    .leftJoin(ragCategory, eq(ragCategory.id, ragEntry.categoryId))
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)))
    .orderBy(desc(ragEntry.updatedAt))
    .limit(limit);

  return rows.map((row) => {
    return {
      entry: toSanitizedEntry(row.entry, {
        categoryName: row.categoryName ?? null,
      }),
      creator: {
        id: row.creatorId ?? "",
        name: row.creatorName,
        email: row.creatorEmail,
      },
    };
  });
}

export async function getRagAnalyticsSummary(): Promise<RagAnalyticsSummary> {
  const [statusCounts] = await db
    .select({
      totalEntries: sql<number>`COUNT(*)`,
      activeEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'active' THEN 1 ELSE 0 END)`,
      inactiveEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'inactive' THEN 1 ELSE 0 END)`,
      archivedEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'archived' THEN 1 ELSE 0 END)`,
      pendingEmbeddings: sql<number>`SUM(CASE WHEN ${ragEntry.embeddingStatus} <> 'ready' THEN 1 ELSE 0 END)`,
    })
    .from(ragEntry)
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)));

  const creatorStats = await db
    .select({
      id: user.id,
      name: sql<string>`COALESCE(${user.firstName} || ' ' || ${user.lastName}, ${user.email})`,
      email: user.email,
      entryCount: sql<number>`COUNT(${ragEntry.id})`,
      activeEntries: sql<number>`SUM(CASE WHEN ${ragEntry.status} = 'active' THEN 1 ELSE 0 END)`,
    })
    .from(ragEntry)
    .leftJoin(user, eq(user.id, ragEntry.addedBy))
    .where(and(isNull(ragEntry.deletedAt), isNull(ragEntry.personalForUserId)))
    .groupBy(user.id, user.firstName, user.lastName, user.email)
    .orderBy(desc(sql<number>`COUNT(${ragEntry.id})`))
    .limit(6);

  return {
    totalEntries: statusCounts?.totalEntries ?? 0,
    activeEntries: statusCounts?.activeEntries ?? 0,
    inactiveEntries: statusCounts?.inactiveEntries ?? 0,
    archivedEntries: statusCounts?.archivedEntries ?? 0,
    pendingEmbeddings: statusCounts?.pendingEmbeddings ?? 0,
    creatorStats: creatorStats.map((creator) => ({
      ...creator,
      id: creator.id ?? "",
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
  const rows = await db
    .select({
      id: ragEntry.id,
      models: ragEntry.models,
    })
    .from(ragEntry)
    .where(
      and(
        isNull(ragEntry.deletedAt),
        eq(ragEntry.status, "active"),
        eq(ragEntry.approvalStatus, "approved")
      )
    )
    .orderBy(desc(ragEntry.updatedAt));

  const normalizedKey = modelKey?.trim() ?? null;

  return rows
    .filter((row) => {
      const models = Array.isArray(row.models) ? row.models : [];
      if (models.length === 0) {
        return true;
      }
      if (models.includes(modelConfigId)) {
        return true;
      }
      if (normalizedKey && models.includes(normalizedKey)) {
        return true;
      }
      return false;
    })
    .map((row) => row.id);
}

export async function rebuildAllRagFileSearchIndexes() {
  const entries = await db
    .select()
    .from(ragEntry)
    .where(isNull(ragEntry.deletedAt));

  for (const entry of entries) {
    try {
      await syncGeminiFileSearchIndex(entry);
    } catch (error) {
      await db
        .update(ragEntry)
        .set({
          embeddingStatus: "failed",
          embeddingError:
            error instanceof Error
              ? error.message
              : "File Search re-index failed",
        })
        .where(eq(ragEntry.id, entry.id));
      console.warn("[rag] rebuild File Search index failed", {
        entryId: entry.id,
        error,
      });
    }
  }
}
