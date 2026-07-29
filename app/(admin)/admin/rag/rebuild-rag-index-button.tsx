"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const REBUILD_ENDPOINT = "/api/admin/rag/rebuild";

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

async function rebuildRagIndex() {
  const response = await fetch(REBUILD_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | RebuildResponse
    | null;

  if (!response.ok || !body?.ok) {
    throw new RebuildError(
      typeof body?.message === "string"
        ? body.message
        : `Rebuild failed (${response.status}).`,
    );
  }

  return body.summary ?? {};
}

export function RebuildRagIndexButton() {
  const [isRebuilding, setIsRebuilding] = useState(false);

  const handleClick = async () => {
    if (isRebuilding) {
      return;
    }

    setIsRebuilding(true);
    try {
      const summary = await rebuildRagIndex();
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
            : "Unable to rebuild the knowledge index.",
      });
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <Button
      className="cursor-pointer"
      disabled={isRebuilding}
      onClick={handleClick}
      type="button"
    >
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
