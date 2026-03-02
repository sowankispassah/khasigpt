"use client";

import Link from "next/link";
import { useTranslation } from "@/components/language-provider";
import type { ForumCategorySummary, ForumTagSummary } from "@/lib/forum/types";
import { cn } from "@/lib/utils";

type ForumSidebarProps = {
  categories: ForumCategorySummary[];
  tags: ForumTagSummary[];
  activeCategorySlug?: string | null;
  activeTagSlug?: string | null;
  search?: string | null;
};

function buildQuery(params: {
  category?: string | null;
  tag?: string | null;
  search?: string | null;
}) {
  const query = new URLSearchParams();
  if (params.category) {
    query.set("category", params.category);
  }
  if (params.tag) {
    query.set("tag", params.tag);
  }
  if (params.search) {
    query.set("search", params.search);
  }
  const queryString = query.toString();
  return queryString.length > 0 ? `/forum?${queryString}` : "/forum";
}

export function ForumSidebar({
  categories,
  tags,
  activeCategorySlug,
  activeTagSlug,
  search,
}: ForumSidebarProps) {
  const { translate } = useTranslation();
  const showReset =
    Boolean(activeCategorySlug) ||
    Boolean(activeTagSlug) ||
    (search && search.length > 0);

  return (
    <aside className="space-y-10">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            {translate("forum.sidebar.categories.title", "Categories")}
          </h2>
          {showReset ? (
            <Link
              className="font-medium text-primary text-xs transition hover:text-primary/80"
              href="/forum"
            >
              {translate("forum.sidebar.categories.reset", "Reset")}
            </Link>
          ) : null}
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-lg border border-transparent px-3 py-2 transition hover:border-primary/30 hover:bg-primary/5",
                !activeCategorySlug &&
                  "border-primary/40 bg-primary/10 font-semibold"
              )}
              href={buildQuery({
                tag: activeTagSlug,
                search,
              })}
            >
              <span>
                {translate("forum.sidebar.categories.all", "All discussions")}
              </span>
              <span className="text-muted-foreground text-xs">
                {categories.reduce(
                  (acc, category) => acc + category.threadCount,
                  0
                )}
              </span>
            </Link>
          </li>
          {categories.map((category) => {
            const label = translate(
              `forum.category.${category.slug}.name`,
              category.name
            );
            return (
              <li key={category.id}>
                <Link
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg border border-transparent px-3 py-2 transition hover:border-primary/30 hover:bg-primary/5",
                    activeCategorySlug === category.slug &&
                      "border-primary/40 bg-primary/10 font-semibold"
                  )}
                  href={buildQuery({
                    category: category.slug,
                    tag: activeTagSlug,
                    search,
                  })}
                >
                  <span>{label}</span>
                  <span className="text-muted-foreground text-xs">
                    {category.threadCount}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
          {translate("forum.sidebar.tags.title", "Trending Tags")}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {translate("forum.sidebar.tags.empty", "No tags available yet.")}
            </p>
          ) : (
            tags.slice(0, 12).map((tag) => {
              const href = buildQuery({
                category: activeCategorySlug,
                tag: tag.slug,
                search,
              });
              const isActive = activeTagSlug === tag.slug;
              return (
                <Link
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 font-medium text-xs transition hover:border-primary/30 hover:bg-primary/5",
                    isActive && "border-primary bg-primary/10 text-primary"
                  )}
                  href={href}
                  key={tag.id}
                >
                  #{tag.label}
                </Link>
              );
            })
          )}
        </div>
      </section>
    </aside>
  );
}
