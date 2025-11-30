import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import {
  listAdminRagEntries,
  getRagAnalyticsSummary,
  listRagCategories,
} from "@/lib/rag/service";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { AdminRagManager, type SerializedAdminRagEntry } from "@/components/admin-rag/admin-rag-manager";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DEFAULT_RAG_TIMEOUT_MS,
  RAG_MATCH_THRESHOLD_SETTING_KEY,
  RAG_TIMEOUT_MS_SETTING_KEY,
} from "@/lib/constants";
import { DEFAULT_RAG_MATCH_THRESHOLD } from "@/lib/rag/constants";
import { getAppSetting } from "@/lib/db/queries";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { rebuildRagEmbeddingsAction, updateCustomKnowledgeSettingsAction } from "@/app/(admin)/actions";

function serializeDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
    ragTimeoutSetting,
    ragMatchThresholdSetting,
  ] = await Promise.all([
    listAdminRagEntries(),
    getRagAnalyticsSummary(),
    getModelRegistry(),
    listRagCategories(),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getAppSetting<number | string>(RAG_TIMEOUT_MS_SETTING_KEY),
    getAppSetting<number | string>(RAG_MATCH_THRESHOLD_SETTING_KEY),
  ]);

  const serializedEntries: SerializedAdminRagEntry[] = entries.map((entry) => ({
    creator: entry.creator,
    retrievalCount: entry.retrievalCount,
    avgScore: entry.avgScore,
    lastRetrievedAt: entry.lastRetrievedAt,
    entry: {
      ...entry.entry,
      createdAt: serializeDate(entry.entry.createdAt),
      updatedAt: serializeDate(entry.entry.updatedAt),
    },
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
        : session.user.email ?? null,
    email: session.user.email ?? null,
  };

  const customKnowledgeEnabled =
    customKnowledgeEnabledSetting === true ||
    (typeof customKnowledgeEnabledSetting === "string" &&
      customKnowledgeEnabledSetting.toLowerCase() === "true");
  const ragTimeoutMs =
    typeof ragTimeoutSetting === "number"
      ? ragTimeoutSetting
      : typeof ragTimeoutSetting === "string"
        ? Number.parseInt(ragTimeoutSetting, 10)
        : DEFAULT_RAG_TIMEOUT_MS;
  const ragTimeoutSeconds = Math.min(
    Math.max(
      1,
      Math.round(
        (Number.isFinite(ragTimeoutMs) ? ragTimeoutMs : DEFAULT_RAG_TIMEOUT_MS) / 1000
      )
    ),
    60
  );
  const ragMatchThresholdRaw =
    typeof ragMatchThresholdSetting === "number"
      ? ragMatchThresholdSetting
      : typeof ragMatchThresholdSetting === "string"
        ? Number.parseFloat(ragMatchThresholdSetting)
        : DEFAULT_RAG_MATCH_THRESHOLD;
  const ragMatchThreshold = Math.min(
    Math.max(0.01, Number.isFinite(ragMatchThresholdRaw) ? ragMatchThresholdRaw : DEFAULT_RAG_MATCH_THRESHOLD),
    1
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Custom knowledge (RAG)</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Enable or disable custom knowledge and tune retrieval latency and match sensitivity.
        </p>
        <form
          action={updateCustomKnowledgeSettingsAction}
          className="mt-4 grid gap-4 md:grid-cols-3"
        >
          <label className="flex items-center gap-3 text-sm font-medium md:col-span-3">
            <input
              className="h-4 w-4 cursor-pointer"
              defaultChecked={customKnowledgeEnabled}
              name="customKnowledgeEnabled"
              type="checkbox"
            />
            Enable custom knowledge for chats
          </label>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="ragTimeoutSeconds">
              Retrieval timeout (seconds)
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={ragTimeoutSeconds}
              id="ragTimeoutSeconds"
              min={1}
              max={60}
              name="ragTimeoutSeconds"
              step={1}
              type="number"
            />
            <p className="text-muted-foreground text-xs">
              Limits how long we wait for knowledge retrieval before falling back to model-only.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="ragMatchThreshold">
              Match threshold (0.01 - 1)
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={ragMatchThreshold}
              id="ragMatchThreshold"
              max={1}
              min={0.01}
              name="ragMatchThreshold"
              step={0.01}
              type="number"
            />
            <p className="text-muted-foreground text-xs">
              Higher values require closer matches; lower values return more results.
            </p>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <ActionSubmitButton pendingLabel="Saving...">
              Save RAG settings
            </ActionSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">Rebuild embeddings</h3>
          <p className="text-muted-foreground text-sm">
            Regenerate RAG chunks and embeddings for all entries. Use after schema changes or missing results.
          </p>
          <form action={rebuildRagEmbeddingsAction} className="flex justify-start">
            <ActionSubmitButton pendingLabel="Rebuilding...">
              Rebuild now
            </ActionSubmitButton>
          </form>
        </div>
      </section>

      <AdminRagManager
        analytics={analytics}
        currentUser={currentUser}
        entries={serializedEntries}
        modelOptions={modelOptions}
        tagOptions={tagOptions}
        categories={categories}
      />
    </div>
  );
}
