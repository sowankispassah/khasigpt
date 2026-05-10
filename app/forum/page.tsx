import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ForumClient } from "@/components/forum/forum-client";
import { ForumSidebar } from "@/components/forum/forum-sidebar";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  type ForumOverviewResult,
  type ForumThreadListItem,
  getForumOverview,
} from "@/lib/forum/service";
import type { ForumThreadListItemPayload } from "@/lib/forum/types";
import { withTimeout } from "@/lib/utils/async";

export const metadata: Metadata = {
  title: "Community Forum",
  description:
    "Discuss product ideas, report issues, and learn from other KhasiGPT builders.",
};

export const dynamic = "force-dynamic";

const FORUM_PAGE_READ_TIMEOUT_MS = 12_000;

const EMPTY_FORUM_OVERVIEW: ForumOverviewResult = {
  activeCategoryId: null,
  activeTagId: null,
  categories: [],
  hasMore: false,
  nextCursor: null,
  subscribedThreadIds: [],
  tags: [],
  threads: [],
};

function serializeThread(
  thread: ForumThreadListItem
): ForumThreadListItemPayload {
  return {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastRepliedAt: thread.lastRepliedAt
      ? thread.lastRepliedAt.toISOString()
      : null,
  };
}

type ForumPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const session = await auth();
  const forumEnabled = await isForumEnabledForRole(session?.user?.role ?? null);
  if (!forumEnabled) {
    notFound();
  }
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const categorySlug =
    typeof resolvedSearchParams?.category === "string"
      ? resolvedSearchParams.category
      : null;
  const tagSlug =
    typeof resolvedSearchParams?.tag === "string"
      ? resolvedSearchParams.tag
      : null;
  const searchQuery =
    typeof resolvedSearchParams?.search === "string"
      ? resolvedSearchParams.search
      : null;

  let loadError: string | null = null;
  const overview = await withTimeout(
    getForumOverview({
      categorySlug,
      tagSlug,
      search: searchQuery,
      viewerUserId: session?.user?.id ?? null,
    }),
    FORUM_PAGE_READ_TIMEOUT_MS,
    () => {
      console.warn("[forum/page] Forum overview timed out.");
    }
  ).catch((error) => {
    console.error("[forum/page] Unable to load forum overview.", error);
    loadError = "Unable to load forum right now. Please try again.";
    return EMPTY_FORUM_OVERVIEW;
  });

  const initialThreads = overview.threads.map(serializeThread);
  const composerCategories = overview.categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    isLocked: category.isLocked,
  }));
  const composerTags = overview.tags.map((tag) => ({
    id: tag.id,
    slug: tag.slug,
    label: tag.label,
  }));
  const totalThreads = overview.categories.reduce(
    (total, category) => total + category.threadCount,
    0
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 lg:flex-row">
      <div className="flex-1">
        <ForumClient
          categoriesForComposer={composerCategories}
          filters={{
            category: categorySlug,
            tag: tagSlug,
            search: searchQuery,
          }}
          hasMore={overview.hasMore}
          initialError={loadError}
          initialThreads={initialThreads}
          nextCursor={overview.nextCursor}
          subscribedThreadIds={overview.subscribedThreadIds}
          tagsForComposer={composerTags}
          totalThreads={totalThreads}
          viewer={{
            id: session?.user?.id ?? null,
            name: session?.user?.name ?? null,
            role: (session?.user?.role as "admin" | "regular" | null) ?? null,
          }}
        />
      </div>
      <div className="w-full lg:w-80">
        <ForumSidebar
          activeCategorySlug={categorySlug}
          activeTagSlug={tagSlug}
          categories={overview.categories}
          search={searchQuery}
          tags={overview.tags}
        />
      </div>
    </div>
  );
}
