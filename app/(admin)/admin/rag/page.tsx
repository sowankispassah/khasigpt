import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import type { SerializedAdminRagEntry } from "@/components/admin-rag/admin-rag-manager";
import type { SerializedUserKnowledgeEntry } from "@/components/admin-user-knowledge-table";
import { getAdminQueryTimeoutMs } from "@/lib/admin/safe-query";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import { getLiteAppSettingUncached } from "@/lib/db/app-settings-lite";
import { getRagChatScope } from "@/lib/rag/chat-scope";
import {
  getRagAnalyticsSummary,
  listAdminRagEntries,
  listRagCategories,
  listUserAddedKnowledgeEntries,
} from "@/lib/rag/service";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import { withTimeout } from "@/lib/utils/async";
import { CustomKnowledgeToggle } from "./custom-knowledge-toggle";
import { RebuildFileSearchButton } from "./rebuild-file-search-button";

export const dynamic = "force-dynamic";

const AdminRagManager = nextDynamic(
  () =>
    import("@/components/admin-rag/admin-rag-manager").then(
      (module) => module.AdminRagManager
    ),
  {
    loading: () => <AdminPageLoading rows={6} summaryCards={4} titleWidth="w-28" />,
  }
);

const AdminUserKnowledgeTable = nextDynamic(
  () =>
    import("@/components/admin-user-knowledge-table").then(
      (module) => module.AdminUserKnowledgeTable
    ),
  {
    loading: () => <AdminPageLoading rows={5} titleWidth="w-52" />,
  }
);

const QUERY_TIMEOUT_MS = getAdminQueryTimeoutMs(4000);

async function safeQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T
): Promise<{ data: T; degraded: boolean; label: string }> {
  try {
    const data = await withTimeout(promise, QUERY_TIMEOUT_MS, () => {
      console.warn(`[admin] Query "${label}" timed out after ${QUERY_TIMEOUT_MS}ms.`);
    });
    return { data, degraded: false, label };
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return { data: fallback, degraded: true, label };
    }
    console.error(`[admin] Failed to load "${label}"`, error);
    return { data: fallback, degraded: true, label };
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

  const customKnowledgeEnabledSetting = await safeQuery(
    "custom knowledge setting",
    getLiteAppSettingUncached<string | boolean>(
      CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY
    ),
    null
  );
  const categoriesPromise = safeQuery("RAG categories", listRagCategories(), []);
  const modelConfigsPromise = safeQuery(
    "model registry",
    getModelRegistry().then((registry) => registry.configs),
    []
  );
  const entriesPromise = safeQuery("RAG entries", listAdminRagEntries(), []);
  const analyticsPromise = safeQuery(
    "RAG analytics",
    getRagAnalyticsSummary(),
    fallbackAnalytics
  );
  const userAddedKnowledgePromise = safeQuery(
    "user added knowledge",
    listUserAddedKnowledgeEntries({ limit: 240 }),
    []
  );

  const currentUser = {
    id: session.user.id,
    name:
      session.user.firstName && session.user.lastName
        ? `${session.user.firstName} ${session.user.lastName}`
        : (session.user.email ?? null),
    email: session.user.email ?? null,
  };

  const customKnowledgeEnabled = parseBooleanSetting(
    customKnowledgeEnabledSetting.data,
    false
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">Custom knowledge (RAG)</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Enable or disable custom knowledge for chats.
        </p>
        {customKnowledgeEnabledSetting.degraded ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
            Custom knowledge status could not be confirmed. The saved value is
            not being shown as authoritative; retry before changing it.
          </p>
        ) : null}
        <CustomKnowledgeToggle
          initialEnabled={customKnowledgeEnabled}
          isDegraded={customKnowledgeEnabledSetting.degraded}
        />
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-base">Rebuild File Search index</h3>
          <p className="text-muted-foreground text-sm">
            Re-index all knowledge entries into Gemini File Search.
          </p>
          <div className="flex justify-start">
            <RebuildFileSearchButton />
          </div>
        </div>
      </section>

      <Suspense fallback={<AdminPageLoading rows={6} summaryCards={4} titleWidth="w-28" />}>
        <RagManagerSection
          analyticsPromise={analyticsPromise}
          categoriesPromise={categoriesPromise}
          currentUser={currentUser}
          entriesPromise={entriesPromise}
          modelConfigsPromise={modelConfigsPromise}
        />
      </Suspense>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold text-lg">User Added Knowledge</h2>
          <p className="text-muted-foreground text-sm">
            Approve or reject knowledge submitted by users. Approved items
            become retrievable.
          </p>
        </div>
        <Suspense fallback={<AdminPageLoading rows={5} titleWidth="w-52" />}>
          <UserKnowledgeSection
            userAddedKnowledgePromise={userAddedKnowledgePromise}
          />
        </Suspense>
      </section>
    </div>
  );
}

async function RagManagerSection({
  analyticsPromise,
  categoriesPromise,
  currentUser,
  entriesPromise,
  modelConfigsPromise,
}: {
  analyticsPromise: Promise<{
    data: Awaited<ReturnType<typeof getRagAnalyticsSummary>>;
    degraded: boolean;
    label: string;
  }>;
  categoriesPromise: Promise<{
    data: Awaited<ReturnType<typeof listRagCategories>>;
    degraded: boolean;
    label: string;
  }>;
  currentUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  entriesPromise: Promise<{
    data: Awaited<ReturnType<typeof listAdminRagEntries>>;
    degraded: boolean;
    label: string;
  }>;
  modelConfigsPromise: Promise<
    {
      data: Awaited<ReturnType<typeof getModelRegistry>>["configs"];
      degraded: boolean;
      label: string;
    }
  >;
}) {
  const [
    categoriesState,
    modelConfigsState,
    entriesState,
    analyticsState,
  ] = await Promise.all([
    categoriesPromise,
    modelConfigsPromise,
    entriesPromise,
    analyticsPromise,
  ]);

  const serializedEntries: SerializedAdminRagEntry[] = entriesState.data.map((entry) => ({
    entry: {
      id: entry.entry.id,
      title: entry.entry.title,
      content: entry.entry.content,
      type: entry.entry.type,
      status: entry.entry.status,
      tags: entry.entry.tags,
      models: entry.entry.models,
      chatScope: getRagChatScope(entry.entry.metadata),
      sourceUrl: entry.entry.sourceUrl ?? null,
      categoryId: entry.entry.categoryId ?? null,
      categoryName: entry.entry.categoryName ?? null,
      createdAt: serializeDate(entry.entry.createdAt),
      updatedAt: serializeDate(entry.entry.updatedAt),
    },
    creator: entry.creator,
  }));

  const modelOptions = modelConfigsState.data
    .filter((config) => config.isEnabled)
    .map((config) => ({
      id: config.id,
      label: config.displayName,
      provider: config.provider,
    }));

  const tagOptions = Array.from(
    new Set(serializedEntries.flatMap((entry) => entry.entry.tags))
  ).sort();
  const degradedSections = [
    analyticsState.degraded ? analyticsState.label : null,
    categoriesState.degraded ? categoriesState.label : null,
    entriesState.degraded ? entriesState.label : null,
    modelConfigsState.degraded ? modelConfigsState.label : null,
  ].filter((section): section is string => Boolean(section));

  return (
    <AdminRagManager
      analytics={analyticsState.data}
      categories={categoriesState.data}
      currentUser={currentUser}
      degradedSections={degradedSections}
      entries={serializedEntries}
      modelOptions={modelOptions}
      tagOptions={tagOptions}
    />
  );
}

async function UserKnowledgeSection({
  userAddedKnowledgePromise,
}: {
  userAddedKnowledgePromise: Promise<
    {
      data: Awaited<ReturnType<typeof listUserAddedKnowledgeEntries>>;
      degraded: boolean;
      label: string;
    }
  >;
}) {
  const userAddedKnowledgeState = await userAddedKnowledgePromise;
  const serializedUserKnowledge: SerializedUserKnowledgeEntry[] =
    userAddedKnowledgeState.data.map((row) => ({
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

  return (
    <>
      {userAddedKnowledgeState.degraded ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
          User-added knowledge could not be confirmed. Retry before treating
          this list as complete.
        </p>
      ) : null}
      <AdminUserKnowledgeTable entries={serializedUserKnowledge} />
    </>
  );
}
