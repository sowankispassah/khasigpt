"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const REBUILD_ENDPOINT = "/api/admin/rag/rebuild";
const REBUILD_CLIENT_TIMEOUT_MS = 50_000;

type RebuildResponse = {
  message?: string;
  ok?: boolean;
  summary?: {
    failed?: number;
    processed?: number;
    reindexed?: number;
  };
};

class RebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RebuildError";
  }
}

async function rebuildFileSearchIndex() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REBUILD_CLIENT_TIMEOUT_MS
  );

  try {
    const response = await fetch(REBUILD_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as
      | RebuildResponse
      | null;

    if (!response.ok || !body?.ok) {
      throw new RebuildError(
        typeof body?.message === "string"
          ? body.message
          : `Rebuild failed (${response.status}).`
      );
    }

    return body.summary ?? {};
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RebuildError("Rebuild timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function RebuildFileSearchButton() {
  const [isRebuilding, setIsRebuilding] = useState(false);

  const handleClick = async () => {
    if (isRebuilding) {
      return;
    }

    setIsRebuilding(true);
    try {
      const summary = await rebuildFileSearchIndex();
      const failed = summary.failed ?? 0;
      const reindexed = summary.reindexed ?? 0;
      const processed = summary.processed ?? reindexed + failed;
      toast({
        type: failed > 0 ? "error" : "success",
        description:
          failed > 0
            ? `Rebuild finished with ${failed} failed of ${processed} entries.`
            : `Rebuilt ${reindexed} custom RAG entries.`,
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Unable to rebuild File Search index.",
      });
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <Button disabled={isRebuilding} onClick={handleClick} type="button">
      {isRebuilding ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>Rebuilding...</span>
        </span>
      ) : (
        "Rebuild now"
      )}
    </Button>
  );
}
