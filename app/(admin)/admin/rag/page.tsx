import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { listAdminRagEntries, getRagAnalyticsSummary } from "@/lib/rag/service";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { AdminRagManager } from "@/components/admin-rag/admin-rag-manager";

function serializeDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export default async function AdminRagPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const [entries, analytics, registry] = await Promise.all([
    listAdminRagEntries(),
    getRagAnalyticsSummary(),
    getModelRegistry(),
  ]);

  const serializedEntries = entries.map((entry) => ({
    ...entry,
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
        : session.user.email,
    email: session.user.email,
  };

  return (
    <AdminRagManager
      analytics={analytics}
      currentUser={currentUser}
      entries={serializedEntries}
      modelOptions={modelOptions}
      tagOptions={tagOptions}
    />
  );
}
