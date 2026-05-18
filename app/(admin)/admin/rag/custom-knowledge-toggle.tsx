"use client";

import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const RAG_SETTINGS_ENDPOINT = "/api/admin/rag/settings";
const SAVE_TIMEOUT_MS = 15_000;

type RagSettingsResponse = {
  enabled: boolean;
  ok?: boolean;
};

class RagSettingsError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RagSettingsError";
    this.status = status;
  }
}

async function saveCustomKnowledgeSetting(enabled: boolean) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);

  try {
    const response = await fetch(RAG_SETTINGS_ENDPOINT, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ enabled }),
    });
    const body = (await response.json().catch(() => null)) as
      | (RagSettingsResponse & { message?: unknown })
      | null;

    if (!response.ok || typeof body?.enabled !== "boolean") {
      throw new RagSettingsError(
        typeof body?.message === "string"
          ? body.message
          : `Failed to save RAG setting (${response.status}).`,
        response.status
      );
    }

    return body.enabled;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RagSettingsError("Save timed out. Please try again.", 504);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function CustomKnowledgeToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [lastSavedEnabled, setLastSavedEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isSaving) {
      return;
    }
    setEnabled(initialEnabled);
    setLastSavedEnabled(initialEnabled);
  }, [initialEnabled, isSaving]);

  const isDirty = enabled !== lastSavedEnabled;

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCustomKnowledgeSetting(enabled);
      setEnabled(saved);
      setLastSavedEnabled(saved);
      toast({
        type: "success",
        description: "RAG settings updated.",
      });
    } catch (error) {
      setEnabled(lastSavedEnabled);
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save RAG settings. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 grid gap-4">
      <label className="flex cursor-pointer items-center gap-3 font-medium text-sm">
        <input
          checked={enabled}
          className="h-4 w-4 cursor-pointer"
          disabled={isSaving}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        Enable custom knowledge for chats
      </label>
      <div className="flex justify-end">
        <Button
          disabled={isSaving || !isDirty}
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>Saving...</span>
            </span>
          ) : (
            "Save RAG settings"
          )}
        </Button>
      </div>
    </div>
  );
}
