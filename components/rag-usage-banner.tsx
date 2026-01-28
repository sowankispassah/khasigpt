"use client";

import { Badge } from "@/components/ui/badge";
import type { RagUsageEvent } from "@/lib/rag/types";
import { SparklesIcon } from "./icons";

export function RagUsageBanner({ usage }: { usage: RagUsageEvent }) {
  if (!usage.entries.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-primary text-xs uppercase tracking-wide">
        <SparklesIcon size={16} />
        <span>
          Answer enriched using custom data ({usage.entries.length}{" "}
          {usage.entries.length === 1 ? "document" : "documents"})
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {usage.entries.map((entry) => (
          <Badge
            className="cursor-pointer bg-background/80 px-2 py-1 text-xs hover:bg-background"
            key={entry.id}
            title={entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : ""}
          >
            <span className="flex items-center gap-1">
              {entry.title}
              {entry.sourceUrl ? (
                <a
                  aria-label={`Open source for ${entry.title}`}
                  className="text-primary underline-offset-2 hover:underline"
                  href={entry.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  ↗
                </a>
              ) : null}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
