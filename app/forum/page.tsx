import type { Metadata } from "next";

import { auth } from "@/app/(auth)/auth";
import { ForumClient } from "@/components/forum/forum-client";
import {
  type ForumCategorySummary,
  type ForumOverviewResult,
  type ForumThreadListItem,
  getForumOverview,
} from "@/lib/forum/service";
import type {
  ForumCategorySummaryPayload,
  ForumThreadListItemPayload,
} from "@/lib/forum/types";
import { withTimeout } from "@/lib/utils/async";

export const metadata: Metadata = {
  title: "Community Forum",
  description:
    "Discuss product ideas, report issues, and learn from other KhasiGPT builders.",
};

export const dynamic = "force-dynamic";

const FORUM_PAGE_READ_TIMEOUT_MS = 12_000;
const OPTIONAL_FORUM_PAGE_AUTH_TIMEOUT_MS = 500;

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

function serializeCategory(
  category: ForumCategorySummary
): ForumCategorySummaryPayload {
  return {
    ...category,
    lastActivityAt: category.lastActivityAt
      ? category.lastActivityAt.toISOString()
      : null,
  };
}

type ForumPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForumPage({ searchParams }: ForumPageProps) {
  const session = await withTimeout(
    auth(),
    OPTIONAL_FORUM_PAGE_AUTH_TIMEOUT_MS
  ).catch(() => null);
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
  return (
    <ForumClient
      filters={{
        category: categorySlug,
        tag: tagSlug,
        search: searchQuery,
      }}
      hasMore={overview.hasMore}
      initialCategories={overview.categories.map(serializeCategory)}
      initialError={loadError}
      initialTags={overview.tags}
      initialThreads={initialThreads}
      nextCursor={overview.nextCursor}
      subscribedThreadIds={overview.subscribedThreadIds}
      viewer={{
        id: session?.user?.id ?? null,
        name: session?.user?.name ?? null,
        role: (session?.user?.role as "admin" | "regular" | null) ?? null,
      }}
    />
  );
}
