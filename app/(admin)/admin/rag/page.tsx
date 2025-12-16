import { redirect } from "next/navigation";
import {
  rebuildRagFileSearchIndexAction,
  updateCustomKnowledgeSettingsAction,
} from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import {
  AdminRagManager,
  type SerializedAdminRagEntry,
} from "@/components/admin-rag/admin-rag-manager";
import {
  AdminUserKnowledgeTable,
  type SerializedUserKnowledgeEntry,
} from "@/components/admin-user-knowledge-table";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  getRagAnalyticsSummary,
  listAdminRagEntries,
  listRagCategories,
  listUserAddedKnowledgeEntries,
} from "@/lib/rag/service";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";

const queryTimeoutRaw = Number.parseInt(
  process.env.ADMIN_QUERY_TIMEOUT_MS ?? "",
  10
);
const QUERY_TIMEOUT_MS =
  Number.isFinite(queryTimeoutRaw) && queryTimeoutRaw > 0
    ? queryTimeoutRaw
    : 4000;

async function safeQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(promise, QUERY_TIMEOUT_MS, () => {
      console.warn(`[admin] Query "${label}" timed out after ${QUERY_TIMEOUT_MS}ms.`);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return fallback;
    }
    console.error(`[admin] Failed to load "${label}"`, error);
    return fallback;
  }
}

function serializeDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

export default async function AdminRagPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const fallbackAnalytics = {
    totalEntries: 0,
    activeEntries: 0,
    inactiveEntries: 0,
    archivedEntries: 0,
    pendingEmbeddings: 0,
    creatorStats: [],
  };

  const [customKnowledgeEnabledSetting, categories, modelConfigs] =
    await Promise.all([
      safeQuery(
        "custom knowledge setting",
        getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
        null
      ),
      safeQuery("RAG categories", listRagCategories(), []),
      safeQuery(
        "model registry",
        getModelRegistry().then((registry) => registry.configs),
        []
      ),
    ]);

  const [entries, analytics, userAddedKnowledge] = await Promise.all([
    safeQuery("RAG entries", listAdminRagEntries(), []),
    safeQuery("RAG analytics", getRagAnalyticsSummary(), fallbackAnalytics),
    safeQuery(
      "user added knowledge",
      listUserAddedKnowledgeEntries({ limit: 240 }),
      []
    ),
  ]);

  const serializedEntries: SerializedAdminRagEntry[] = entries.map((entry) => ({
    entry: {
      id: entry.entry.id,
      title: entry.entry.title,
      content: entry.entry.content,
      type: entry.entry.type,
      status: entry.entry.status,
      tags: entry.entry.tags,
      models: entry.entry.models,
      sourceUrl: entry.entry.sourceUrl ?? null,
      categoryId: entry.entry.categoryId ?? null,
      categoryName: entry.entry.categoryName ?? null,
      createdAt: serializeDate(entry.entry.createdAt),
      updatedAt: serializeDate(entry.entry.updatedAt),
    },
    creator: entry.creator,
  }));

  const serializedUserKnowledge: SerializedUserKnowledgeEntry[] =
    userAddedKnowledge.map((row) => ({
      entry: {
        id: row.entry.id,
        title: row.entry.title,
        content: row.entry.content,
        approvalStatus: row.entry.approvalStatus,
        status: row.entry.status,
        createdAt: serializeDate(row.entry.createdAt),
        updatedAt: serializeDate(row.entry.updatedAt),
        personalForUserId: row.entry.personalForUserId ?? null,
      },
      creator: row.creator,
    }));

  const modelOptions = modelConfigs
    .filter((config) => config.isEnabled)
    .map((config) => ({
      id: config.id,
      label: config.displayName,
      provider: config.provider,
    }));

  const tagOptions = Array.from(
    new Set(serializedEntries.flatMap((entry) => entry.entry.tags))
  ).sort();

  const currentUser = {
    id: session.user.id,
    name:
      session.user.firstName && session.user.lastName
        ? `${session.user.firstName} ${session.user.lastName}`
        : (session.user.email ?? null),
    email: session.user.email ?? null,
  };

  const customKnowledgeEnabled =
    customKnowledgeEnabledSetting === true ||
    (typeof customKnowledgeEnabledSetting === "string" &&
      customKnowledgeEnabledSetting.toLowerCase() === "true");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">Custom knowledge (RAG)</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Enable or disable custom knowledge for chats.
        </p>
        <form
          action={updateCustomKnowledgeSettingsAction}
          className="mt-4 grid gap-4"
        >
          <label className="flex items-center gap-3 font-medium text-sm">
            <input
              className="h-4 w-4 cursor-pointer"
              defaultChecked={customKnowledgeEnabled}
              name="customKnowledgeEnabled"
              type="checkbox"
            />
            Enable custom knowledge for chats
          </label>
          <div className="flex justify-end">
            <ActionSubmitButton pendingLabel="Saving...">
              Save RAG settings
            </ActionSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-base">Rebuild File Search index</h3>
          <p className="text-muted-foreground text-sm">
            Re-index all knowledge entries into Gemini File Search.
          </p>
          <form
            action={rebuildRagFileSearchIndexAction}
            className="flex justify-start"
          >
            <ActionSubmitButton pendingLabel="Rebuilding...">
              Rebuild now
            </ActionSubmitButton>
          </form>
        </div>
      </section>

      <AdminRagManager
        analytics={analytics}
        categories={categories}
        currentUser={currentUser}
        entries={serializedEntries}
        modelOptions={modelOptions}
        tagOptions={tagOptions}
      />

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-lg">User Added Knowledge</h2>
          <p className="text-muted-foreground text-sm">
            Approve or reject knowledge submitted by users. Approved items
            become retrievable.
          </p>
        </div>
        <AdminUserKnowledgeTable entries={serializedUserKnowledge} />
      </section>
    </div>
  );
}
