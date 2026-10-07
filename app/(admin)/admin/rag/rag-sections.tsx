import { AdminNotice, AdminPanel } from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { CustomKnowledgeToggle } from "./custom-knowledge-toggle";
import { RebuildRagIndexButton } from "./rebuild-rag-index-button";

/** Retrieval switch and index rebuild, side by side on wide screens. */
export function RagSettingsPanels({
  customKnowledgeEnabled,
  degraded,
}: {
  customKnowledgeEnabled: boolean;
  degraded: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminPanel
        bodyClassName="p-5"
        description="Enable or disable custom knowledge for chats."
        title="Custom knowledge (RAG)"
      >
        {degraded ? (
          <AdminNotice className="mb-4">
            Custom knowledge status could not be confirmed. The saved value is
            not being shown as authoritative; retry before changing it.
          </AdminNotice>
        ) : null}
        <CustomKnowledgeToggle
          initialEnabled={customKnowledgeEnabled}
          isDegraded={degraded}
        />
      </AdminPanel>
      <AdminPanel
        bodyClassName="flex flex-1 flex-col justify-between gap-4 p-5"
        description="Rebuild multilingual search chunks and embeddings for all custom knowledge entries."
        title="Rebuild knowledge index"
      >
        <p className="text-muted-foreground text-xs">
          <EditableTranslation
            defaultText="Run this after bulk edits or when an entry shows a failed index status."
            description="Hint in the admin knowledge index rebuild panel."
            translationKey="admin.rag.rebuild.hint"
          />
        </p>
        <div>
          <RebuildRagIndexButton />
        </div>
      </AdminPanel>
    </div>
  );
}
