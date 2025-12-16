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

  const [
    entries,
    analytics,
    registry,
    categories,
    customKnowledgeEnabledSetting,
    userAddedKnowledge,
  ] = await Promise.all([
    listAdminRagEntries(),
    getRagAnalyticsSummary(),
    getModelRegistry(),
    listRagCategories(),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    listUserAddedKnowledgeEntries({ limit: 240 }),
  ]);

  const serializedEntries: SerializedAdminRagEntry[] = entries.map((entry) => ({
    entry: {
      ...entry.entry,
      createdAt: serializeDate(entry.entry.createdAt),
      updatedAt: serializeDate(entry.entry.updatedAt),
    },
    creator: entry.creator,
  }));

  const serializedUserKnowledge: SerializedUserKnowledgeEntry[] =
    userAddedKnowledge.map((row) => ({
      entry: {
        ...row.entry,
        createdAt:
          row.entry.createdAt instanceof Date
            ? row.entry.createdAt.toISOString()
            : (row.entry.createdAt as unknown as string),
        updatedAt:
          row.entry.updatedAt instanceof Date
            ? row.entry.updatedAt.toISOString()
            : (row.entry.updatedAt as unknown as string),
      },
      creator: row.creator,
    }));

  const modelOptions = registry.configs
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
