"use client";

import { useTranslation } from "@/components/language-provider";
import type { WebSearchSource } from "@/lib/web-search/types";

export function WebSearchSources({
  provider,
  sources,
}: {
  provider: string;
  sources: WebSearchSource[];
}) {
  const { translate } = useTranslation();
  const safeSources = sources.filter((source) => {
    try {
      const url = new URL(source.url);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
  if (safeSources.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm">
      <div className="mb-2 font-medium text-foreground">
        {translate("chat.web_search.sources", "Sources")}
        <span className="ml-2 font-normal text-muted-foreground text-xs">
          {provider}
        </span>
      </div>
      <ul className="space-y-1">
        {safeSources.map((source) => (
          <li key={source.url}>
            <a
              className="cursor-pointer break-words text-primary text-xs underline underline-offset-2"
              href={source.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {source.title || source.domain || source.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
