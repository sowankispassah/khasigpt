"use client";

import { Filter, Search as SearchIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ForumCategoryManager } from "@/components/forum/forum-category-manager";
import { ForumSidebar } from "@/components/forum/forum-sidebar";
import { ThreadCard } from "@/components/forum/thread-card";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ForumCategorySummaryPayload,
  ForumOverviewPayload,
  ForumTagSummary,
  ForumThreadListItemPayload,
} from "@/lib/forum/types";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { fetchWithErrorHandlers } from "@/lib/utils";

const ForumComposer = dynamic(() =>
  import("./forum-composer").then((mod) => mod.ForumComposer)
);

type ComposerCategory = {
  id: string;
  slug: string;
  name: string;
  isLocked: boolean;
};

type ComposerTag = {
  id: string;
  slug: string;
  label: string;
};

type ForumClientProps = {
  initialThreads: ForumThreadListItemPayload[];
  initialCategories: ForumCategorySummaryPayload[];
  initialTags: ForumTagSummary[];
  initialError?: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  subscribedThreadIds: string[];
  filters: {
    category?: string | null;
    tag?: string | null;
    search?: string | null;
  };
  viewer: {
    id: string | null;
    name: string | null;
    role: "admin" | "regular" | null;
  };
};

export function ForumClient({
  initialThreads,
  initialCategories,
  initialTags,
  initialError = null,
  hasMore,
  nextCursor,
  subscribedThreadIds,
  filters,
  viewer,
}: ForumClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { translate } = useTranslation();
  const searchPlaceholder = useEditableTranslation(
    "forum.search.placeholder",
    "Search discussions, tags, or keywords"
  );
  const isAdmin = viewer.role === "admin";
  const [threads, setThreads] = useState(initialThreads);
  const [categories, setCategories] = useState(initialCategories);
  const [tags, setTags] = useState(initialTags);
  const [loadError, setLoadError] = useState(initialError);
  const [isRecoveringInitialLoad, setIsRecoveringInitialLoad] = useState(
    Boolean(initialError)
  );
  const [cursor, setCursor] = useState(nextCursor);
  const [hasMoreState, setHasMoreState] = useState(hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search ?? "");
  const [isSearching, startSearching] = useTransition();
  const [subscribedSet, setSubscribedSet] = useState(
    new Set(subscribedThreadIds)
  );

  useEffect(() => {
    setThreads(initialThreads);
    setCategories(initialCategories);
    setTags(initialTags);
    setLoadError(initialError);
    setIsRecoveringInitialLoad(Boolean(initialError));
    setCursor(nextCursor);
    setHasMoreState(hasMore);
    setSubscribedSet(new Set(subscribedThreadIds));
    setSearchTerm(filters.search ?? "");
  }, [
    initialCategories,
    initialError,
    initialTags,
    initialThreads,
    nextCursor,
    hasMore,
    subscribedThreadIds,
    filters.search,
  ]);

  const overviewQueryString = useMemo(() => {
    const query = new URLSearchParams();
    if (filters.category) {
      query.set("category", filters.category);
    }
    if (filters.tag) {
      query.set("tag", filters.tag);
    }
    if (filters.search) {
      query.set("search", filters.search);
    }
    return query.toString();
  }, [filters.category, filters.tag, filters.search]);

  useEffect(() => {
    if (!initialError) {
      return;
    }

    let cancelled = false;

    async function recoverForumOverview() {
      setIsRecoveringInitialLoad(true);
      try {
        const endpoint = overviewQueryString
          ? `/api/forum/threads?${overviewQueryString}`
          : "/api/forum/threads";
        const response = await fetchWithErrorHandlers(endpoint);
        const data = (await response.json()) as ForumOverviewPayload;
        if (cancelled) {
          return;
        }
        setThreads(data.threads);
        setCategories(data.categories);
        setTags(data.tags);
        setCursor(data.nextCursor);
        setHasMoreState(data.hasMore);
        setSubscribedSet(new Set(data.subscribedThreadIds));
        setLoadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("[forum-client] Unable to recover forum overview.", error);
        setLoadError("Unable to load forum right now. Please try again.");
      } finally {
        if (!cancelled) {
          setIsRecoveringInitialLoad(false);
        }
      }
    }

    void recoverForumOverview();

    return () => {
      cancelled = true;
    };
  }, [initialError, overviewQueryString]);

  const handleThreadNavigateStart = () => {
    startGlobalProgress();
  };

  const activeFilters = useMemo(() => {
    const list: string[] = [];
    if (filters.category) {
      list.push(
        translate("forum.filters.category", "Category: {value}").replace(
          "{value}",
          filters.category
        )
      );
    }
    if (filters.tag) {
      list.push(
        translate("forum.filters.tag", "Tag: #{value}").replace(
          "{value}",
          filters.tag
        )
      );
    }
    if (filters.search) {
      list.push(
        translate("forum.filters.search", 'Search: "{value}"').replace(
          "{value}",
          filters.search
        )
      );
    }
    return list;
  }, [filters.category, filters.tag, filters.search, translate]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (filters.category) {
      query.set("category", filters.category);
    }
    if (filters.tag) {
      query.set("tag", filters.tag);
    }
    if (searchTerm.trim().length > 0) {
      query.set("search", searchTerm.trim());
    }
    const nextUrl = query.toString().length
      ? `${pathname}?${query.toString()}`
      : pathname;
    startSearching(() => {
      startGlobalProgress();
      router.push(nextUrl);
    });
  };

  const loadMore = async () => {
    if (isLoadingMore || !cursor) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const query = new URLSearchParams();
      if (filters.category) {
        query.set("category", filters.category);
      }
      if (filters.tag) {
        query.set("tag", filters.tag);
      }
      if (filters.search) {
        query.set("search", filters.search);
      }
      query.set("cursor", cursor);
      const response = await fetchWithErrorHandlers(
        `/api/forum/threads?${query.toString()}`
      );
      const data = (await response.json()) as ForumOverviewPayload;
      setThreads((prev) => {
        const existingIds = new Set(prev.map((thread) => thread.id));
        const merged = [...prev];
        for (const thread of data.threads) {
          if (!existingIds.has(thread.id)) {
            merged.push(thread);
          }
        }
        return merged;
      });
      setCursor(data.nextCursor);
      setHasMoreState(data.hasMore);
      setSubscribedSet((prev) => {
        const next = new Set(prev);
        for (const id of data.subscribedThreadIds) {
          next.add(id);
        }
        return next;
      });
    } catch (error) {
      console.error(error);
      toast.error(
        translate(
          "forum.toast.load_more_error",
          "Unable to load more discussions right now."
        )
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const retryInitialLoad = async () => {
    setIsRecoveringInitialLoad(true);
    try {
      const endpoint = overviewQueryString
        ? `/api/forum/threads?${overviewQueryString}`
        : "/api/forum/threads";
      const response = await fetchWithErrorHandlers(endpoint);
      const data = (await response.json()) as ForumOverviewPayload;
      setThreads(data.threads);
      setCategories(data.categories);
      setTags(data.tags);
      setCursor(data.nextCursor);
      setHasMoreState(data.hasMore);
      setSubscribedSet(new Set(data.subscribedThreadIds));
      setLoadError(null);
    } catch (error) {
      console.error("[forum-client] Forum retry failed.", error);
      setLoadError("Unable to load forum right now. Please try again.");
    } finally {
      setIsRecoveringInitialLoad(false);
    }
  };

  const categoriesForComposer: ComposerCategory[] = categories.map(
    (category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      isLocked: category.isLocked,
    })
  );
  const tagsForComposer: ComposerTag[] = tags.map((tag) => ({
    id: tag.id,
    slug: tag.slug,
    label: tag.label,
  }));
  const totalThreads = categories.reduce(
    (total, category) => total + Number(category.threadCount ?? 0),
    0
  );
  const totalActiveThreads = threads.length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 lg:flex-row">
      <div className="flex-1 space-y-8">
        <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-background to-background p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-4">
              <p className="font-semibold text-primary text-sm uppercase tracking-wider">
                <EditableTranslation
                  defaultText="Community Forum"
                  translationKey="forum.hero.tagline"
                />
              </p>
              <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
                <EditableTranslation
                  defaultText="Discuss product ideas with KhasiGPT builders"
                  translationKey="forum.hero.title"
                />
              </h1>
              <p className="text-muted-foreground text-sm md:text-base">
                <EditableTranslation
                  defaultText="Ask for help, share language resources, or report issues. Our team and community reply quickly with actionable guidance."
                  translationKey="forum.hero.subtitle"
                />
              </p>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="font-semibold text-2xl">{totalThreads}</p>
                  <p className="text-muted-foreground text-xs">
                    <EditableTranslation
                      defaultText="Total topics"
                      translationKey="forum.hero.stats.total_label"
                    />
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-2xl">{totalActiveThreads}</p>
                  <p className="text-muted-foreground text-xs">
                    <EditableTranslation
                      defaultText="Visible now"
                      translationKey="forum.hero.stats.visible_label"
                    />
                  </p>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col items-center gap-4 md:w-auto">
              <div className="relative hidden h-16 w-16 overflow-hidden rounded-2xl border border-border bg-card md:block">
                <Image
                  alt={translate(
                    "forum.hero.image_alt",
                    "KhasiGPT community badge"
                  )}
                  className="object-contain p-2"
                  height={64}
                  priority
                  src="/images/khasigptlogo.png"
                  width={64}
                />
              </div>
              <ForumComposer
                categories={categoriesForComposer}
                tags={tagsForComposer}
                viewerId={viewer.id}
                viewerName={viewer.name}
              />
              {isAdmin ? (
                <ForumCategoryManager className="w-full justify-center" />
              ) : null}
            </div>
          </div>
          <form
            className="mt-8 flex flex-col gap-3 md:flex-row"
            onSubmit={handleSearchSubmit}
          >
            <div className="relative flex-1">
              <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              {searchPlaceholder.editButton ? (
                <div className="absolute top-1/2 right-3 z-10 -translate-y-1/2">
                  {searchPlaceholder.editButton}
                </div>
              ) : null}
              <Input
                className="pl-9 pr-16"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={searchPlaceholder.text}
                value={searchTerm}
              />
            </div>
            <Button
              className="cursor-pointer"
              disabled={isSearching}
              type="submit"
              variant="secondary"
            >
              {isSearching ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderIcon className="animate-spin" size={16} />
                  <EditableTranslation
                    defaultText="Searching..."
                    translationKey="forum.search.pending"
                  />
                </span>
              ) : (
                <EditableTranslation
                  defaultText="Search"
                  translationKey="forum.search.submit"
                />
              )}
            </Button>
          </form>
          {activeFilters.length > 0 ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 border-dashed px-3 py-1 text-muted-foreground text-xs">
              <Filter className="h-3.5 w-3.5" />
              <EditableTranslation
                defaultText="Active filters:"
                translationKey="forum.filters.label"
              />
              {activeFilters.map((filter) => (
                <span className="font-medium text-foreground" key={filter}>
                  {filter}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          {loadError && isRecoveringInitialLoad ? (
            <div className="rounded-2xl border border-border border-dashed p-10 text-center">
              <p className="font-semibold text-lg">
                <EditableTranslation
                  defaultText="Loading forum discussions..."
                  translationKey="forum.list.loading"
                />
              </p>
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center">
              <p className="font-semibold text-lg">
                <EditableTranslation
                  defaultText="Unable to load forum"
                  translationKey="forum.error.load"
                />
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {loadError}
              </p>
              <Button
                className="mt-4 cursor-pointer"
                disabled={isRecoveringInitialLoad}
                onClick={retryInitialLoad}
                variant="outline"
              >
                <EditableTranslation
                  defaultText="Retry"
                  translationKey="common.retry"
                />
              </Button>
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-2xl border border-border border-dashed p-10 text-center">
              <p className="font-semibold text-lg">
                <EditableTranslation
                  defaultText="No discussions yet"
                  translationKey="forum.empty.title"
                />
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                <EditableTranslation
                  defaultText="Be the first to start a topic in this category."
                  translationKey="forum.empty.subtitle"
                />
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {threads.map((thread) => (
                <ThreadCard
                  isSubscribed={subscribedSet.has(thread.id)}
                  key={thread.id}
                  onNavigateStart={handleThreadNavigateStart}
                  thread={thread}
                />
              ))}
            </div>
          )}

          {hasMoreState ? (
            <div className="flex justify-center pt-4">
              <Button
                className="cursor-pointer"
                disabled={isLoadingMore}
                onClick={loadMore}
                variant="outline"
              >
                {isLoadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderIcon className="animate-spin" size={16} />
                    <EditableTranslation
                      defaultText="Loading..."
                      translationKey="forum.list.loading_more"
                    />
                  </span>
                ) : (
                  <EditableTranslation
                    defaultText="Load more discussions"
                    translationKey="forum.list.load_more"
                  />
                )}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      <div className="w-full lg:w-80">
        <ForumSidebar
          activeCategorySlug={filters.category}
          activeTagSlug={filters.tag}
          categories={categories}
          search={filters.search}
          tags={tags}
        />
      </div>
    </div>
  );
}
