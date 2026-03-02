import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ForumClient } from "@/components/forum/forum-client";
import { ForumSidebar } from "@/components/forum/forum-sidebar";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  type ForumThreadListItem,
  getForumOverview,
} from "@/lib/forum/service";
import type { ForumThreadListItemPayload } from "@/lib/forum/types";

export const metadata: Metadata = {
  title: "Community Forum",
  description:
    "Discuss product ideas, report issues, and learn from other KhasiGPT builders.",
};

export const dynamic = "force-dynamic";

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

  const overview = await getForumOverview({
    categorySlug,
    tagSlug,
    search: searchQuery,
    viewerUserId: session?.user?.id ?? null,
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
