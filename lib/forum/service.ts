import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/queries";
import {
  forumCategory,
  forumPost,
  forumPostReaction,
  forumTag,
  forumThread,
  forumThreadSubscription,
  forumThreadTag,
  type ForumPostReactionType,
  type ForumThreadStatus,
  user,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  buildForumExcerpt,
  formatForumUserName,
  getForumSlugBase,
  sanitizeForumContent,
} from "./utils";
import { registerTranslationKeys } from "@/lib/i18n/dictionary";
import type {
  ForumCategorySummary,
  ForumOverviewResult,
  ForumPostListItem,
  ForumTagSummary,
  ForumThreadDetailResult,
  ForumThreadListItem,
  ForumUserSummary,
} from "./types";
export type {
  ForumCategorySummary,
  ForumOverviewResult,
  ForumOverviewPayload,
  ForumPostListItem,
  ForumPostListItemPayload,
  ForumTagSummary,
  ForumThreadDetailResult,
  ForumThreadDetailPayload,
  ForumThreadListItem,
  ForumThreadListItemPayload,
  ForumUserSummary,
  CreateForumCategoryInput,
} from "./types";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
const MIN_LIMIT = 5;

type CategoryTranslationTarget = {
  slug: string;
  name: string;
  description: string | null;
};

function buildCategoryTranslationDefinitions(
  category: CategoryTranslationTarget
) {
  const normalizedDescription = category.description?.trim() ?? "";

  return [
    {
      key: `forum.category.${category.slug}.name`,
      defaultText: category.name,
      description: `Display name for the "${category.name}" forum category.`,
    },
    {
      key: `forum.category.${category.slug}.description`,
      defaultText: normalizedDescription,
      description: `Description for the "${category.name}" forum category.`,
    },
  ];
}

export type ForumOverviewFilters = {
  categorySlug?: string | null;
  tagSlug?: string | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number;
  viewerUserId?: string | null;
};

export type CreateForumThreadInput = {
  authorId: string;
  title: string;
  content: string;
  summary?: string | null;
  categorySlug: string;
  tagSlugs?: string[];
};

export type CreateForumPostInput = {
  threadSlug: string;
  authorId: string;
  content: string;
  parentPostId?: string | null;
};

async function ensureThreadOwner({
  slug,
  userId,
  isAdmin,
}: {
  slug: string;
  userId: string;
  isAdmin: boolean;
}) {
  const [thread] = await db
    .select({ id: forumThread.id, authorId: forumThread.authorId })
    .from(forumThread)
    .where(eq(forumThread.slug, slug))
    .limit(1);

  if (!thread) {
    throw new ChatSDKError("not_found:forum", "Thread not found");
  }

  if (!isAdmin && thread.authorId !== userId) {
    throw new ChatSDKError(
      "forbidden:forum",
      "Only the thread owner can perform this action"
    );
  }

  return thread;
}

function mapUser(row: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  image?: string | null;
  role?: string | null;
}): ForumUserSummary {
  const role = row.role ?? null;
  const isAdmin = (role ?? "").toLowerCase() === "admin";
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    avatarUrl: row.image ?? null,
    role,
    isAdmin,
    displayName: formatForumUserName(row.firstName, row.lastName, row.email),
  };
}

function parseCursor(cursor?: string | null) {
  if (!cursor) {
    return null;
  }
  const [timestamp, id] = cursor.split("_");
  if (!timestamp || !id) {
    return null;
  }
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : { date, id };
}

function buildCursor(row: { updatedAt: Date; id: string }) {
  return `${row.updatedAt.toISOString()}_${row.id}`;
}

export async function getForumOverview(
  params: ForumOverviewFilters = {}
): Promise<ForumOverviewResult> {
  try {
  const [categories, tags] = await Promise.all([
    db
      .select({
        id: forumCategory.id,
        slug: forumCategory.slug,
          name: forumCategory.name,
          description: forumCategory.description,
          icon: forumCategory.icon,
          position: forumCategory.position,
          isLocked: forumCategory.isLocked,
          threadCount: sql<number>`COUNT(${forumThread.id})`,
          lastActivityAt: sql<Date | null>`MAX(${forumThread.updatedAt})`,
        })
        .from(forumCategory)
        .leftJoin(
          forumThread,
          eq(forumThread.categoryId, forumCategory.id)
        )
        .groupBy(
          forumCategory.id,
          forumCategory.slug,
          forumCategory.name,
          forumCategory.description,
          forumCategory.icon,
          forumCategory.position,
          forumCategory.isLocked
        )
        .orderBy(asc(forumCategory.position), asc(forumCategory.name)),
      db
        .select({
          id: forumTag.id,
          slug: forumTag.slug,
          label: forumTag.label,
          description: forumTag.description,
          usageCount: sql<number>`COUNT(${forumThreadTag.threadId})`,
        })
        .from(forumTag)
        .leftJoin(
          forumThreadTag,
          eq(forumThreadTag.tagId, forumTag.id)
        )
        .groupBy(
          forumTag.id,
          forumTag.slug,
          forumTag.label,
          forumTag.description
        )
        .orderBy(desc(sql`COUNT(${forumThreadTag.threadId})`), asc(forumTag.label)),
  ]);

  if (categories.length > 0) {
    await registerTranslationKeys(
      categories.flatMap((category) =>
        buildCategoryTranslationDefinitions({
          slug: category.slug,
          name: category.name,
          description: category.description ?? null,
        })
      )
    );
  }

  const activeCategory =
    params.categorySlug &&
    categories.find((category) => category.slug === params.categorySlug);
  const activeTag =
    params.tagSlug && tags.find((tag) => tag.slug === params.tagSlug);

    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_LIMIT, MIN_LIMIT),
      MAX_LIMIT
    );

    const lastReplyUser = alias(user, "lastReplyUser");
    const filteredThreadTag = alias(forumThreadTag, "filteredThreadTag");
    let baseQuery = db
      .select({
        id: forumThread.id,
        slug: forumThread.slug,
        title: forumThread.title,
        summary: forumThread.summary,
        status: forumThread.status,
        isPinned: forumThread.isPinned,
        isLocked: forumThread.isLocked,
        totalReplies: forumThread.totalReplies,
        viewCount: forumThread.viewCount,
        createdAt: forumThread.createdAt,
        updatedAt: forumThread.updatedAt,
        lastRepliedAt: forumThread.lastRepliedAt,
        categoryId: forumCategory.id,
        categorySlug: forumCategory.slug,
        categoryName: forumCategory.name,
        authorId: user.id,
        authorFirstName: user.firstName,
        authorLastName: user.lastName,
        authorEmail: user.email,
        authorImage: user.image,
        authorRole: user.role,
        lastReplyUserId: forumThread.lastReplyUserId,
        lastReplyFirstName: lastReplyUser.firstName,
        lastReplyLastName: lastReplyUser.lastName,
        lastReplyEmail: lastReplyUser.email,
        lastReplyImage: lastReplyUser.image,
        lastReplyRole: lastReplyUser.role,
      })
      .from(forumThread)
      .innerJoin(user, eq(forumThread.authorId, user.id))
      .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
      .leftJoin(lastReplyUser, eq(forumThread.lastReplyUserId, lastReplyUser.id));

    let filtersClause: SQL<boolean> | undefined;

    if (activeCategory) {
      filtersClause = eq(forumThread.categoryId, activeCategory.id) as SQL<boolean>;
    }
    if (activeTag) {
      filtersClause = filtersClause
        ? (and(filtersClause, eq(filteredThreadTag.tagId, activeTag.id) as SQL<boolean>) as SQL<boolean>)
        : ((eq(filteredThreadTag.tagId, activeTag.id) as SQL<boolean>) as SQL<boolean>);
    }
    if (params.search && params.search.trim().length > 0) {
      const normalized = `%${params.search.trim().toLowerCase()}%`;
      const searchClause = sql<boolean>`
          (LOWER(${forumThread.title}) LIKE ${normalized}
          OR LOWER(${forumThread.summary}) LIKE ${normalized})
        `;
      filtersClause = filtersClause
        ? (and(filtersClause, searchClause) as SQL<boolean>)
        : searchClause;
    }

    const cursor = parseCursor(params.cursor);
    if (cursor) {
      const cursorClause = sql<boolean>`(
        ${forumThread.updatedAt} < ${cursor.date}
        OR (${forumThread.updatedAt} = ${cursor.date} AND ${forumThread.id} < ${cursor.id})
      )`;
      filtersClause = filtersClause
        ? (and(filtersClause, cursorClause) as SQL<boolean>)
        : cursorClause;
    }

    if (activeTag) {
      baseQuery = baseQuery.innerJoin(
        filteredThreadTag,
        eq(filteredThreadTag.threadId, forumThread.id)
      );
    }

    const queryWithFilters = filtersClause
      ? baseQuery.where(filtersClause)
      : baseQuery;

    const coalescedActivity = sql<Date>`
      COALESCE(${forumThread.lastRepliedAt}, ${forumThread.createdAt})
    `;

    const threadRows = await queryWithFilters
      .orderBy(
        desc(forumThread.isPinned),
        desc(coalescedActivity),
        desc(forumThread.createdAt)
      )
      .limit(limit + 1);

    const threadIds = threadRows.map((row) => row.id);
    const tagsByThread = new Map<
      string,
      Array<{ id: string; slug: string; label: string }>
    >();

    if (threadIds.length > 0) {
      const tagRows = await db
        .select({
          threadId: forumThreadTag.threadId,
          tagId: forumTag.id,
          slug: forumTag.slug,
          label: forumTag.label,
        })
        .from(forumThreadTag)
        .innerJoin(forumTag, eq(forumThreadTag.tagId, forumTag.id))
        .where(inArray(forumThreadTag.threadId, threadIds));

      for (const tagRow of tagRows) {
        const current = tagsByThread.get(tagRow.threadId) ?? [];
        current.push({
          id: tagRow.tagId,
          slug: tagRow.slug,
          label: tagRow.label,
        });
        tagsByThread.set(tagRow.threadId, current);
      }
    }

    let subscribedThreadIds: string[] = [];
    if (params.viewerUserId && threadIds.length > 0) {
      const subscriptionRows = await db
        .select({ threadId: forumThreadSubscription.threadId })
        .from(forumThreadSubscription)
        .where(
          and(
            eq(forumThreadSubscription.userId, params.viewerUserId),
            inArray(forumThreadSubscription.threadId, threadIds)
          )
        );
      subscribedThreadIds = subscriptionRows.map((row) => row.threadId);
    }

    const hasMore = threadRows.length > limit;
    const visibleThreads = hasMore ? threadRows.slice(0, -1) : threadRows;
    const threads: ForumThreadListItem[] = visibleThreads.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      excerpt: buildForumExcerpt(row.summary),
      status: row.status,
      isPinned: row.isPinned,
      isLocked: row.isLocked,
      totalReplies: row.totalReplies,
      viewCount: row.viewCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastRepliedAt: row.lastRepliedAt,
      category: {
        id: row.categoryId,
        slug: row.categorySlug,
        name: row.categoryName,
      },
      author: mapUser({
        id: row.authorId,
        firstName: row.authorFirstName,
        lastName: row.authorLastName,
        email: row.authorEmail,
        image: row.authorImage ?? null,
        role: row.authorRole ?? null,
      }),
      lastResponder: row.lastReplyUserId
        ? mapUser({
            id: row.lastReplyUserId,
            firstName: row.lastReplyFirstName,
            lastName: row.lastReplyLastName,
            email: row.lastReplyEmail,
            image: row.lastReplyImage ?? null,
            role: row.lastReplyRole ?? null,
          })
        : null,
      tags: tagsByThread.get(row.id) ?? [],
    }));

    const nextCursor =
      hasMore && visibleThreads.length > 0
        ? buildCursor(visibleThreads[visibleThreads.length - 1])
        : null;

    return {
      categories,
      tags,
      threads,
      hasMore,
      nextCursor,
      activeCategoryId: activeCategory?.id ?? null,
      activeTagId: activeTag?.id ?? null,
      subscribedThreadIds,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load forum overview"
    );
  }
}

export async function getForumThreadDetail({
  slug,
  viewerUserId,
}: {
  slug: string;
  viewerUserId?: string | null;
}): Promise<ForumThreadDetailResult | null> {
  try {
    const lastReplyUser = alias(user, "threadLastReplyUser");
    const [threadRow] = await db
      .select({
        id: forumThread.id,
        slug: forumThread.slug,
        title: forumThread.title,
        summary: forumThread.summary,
        status: forumThread.status,
        isPinned: forumThread.isPinned,
        isLocked: forumThread.isLocked,
        totalReplies: forumThread.totalReplies,
        viewCount: forumThread.viewCount,
        createdAt: forumThread.createdAt,
        updatedAt: forumThread.updatedAt,
        lastRepliedAt: forumThread.lastRepliedAt,
        categoryId: forumCategory.id,
        categorySlug: forumCategory.slug,
        categoryName: forumCategory.name,
        authorId: user.id,
        authorFirstName: user.firstName,
        authorLastName: user.lastName,
        authorEmail: user.email,
        authorImage: user.image,
        authorRole: user.role,
        lastReplyUserId: forumThread.lastReplyUserId,
        lastReplyFirstName: lastReplyUser.firstName,
        lastReplyLastName: lastReplyUser.lastName,
        lastReplyEmail: lastReplyUser.email,
        lastReplyImage: lastReplyUser.image,
        lastReplyRole: lastReplyUser.role,
      })
      .from(forumThread)
      .innerJoin(user, eq(forumThread.authorId, user.id))
      .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
      .leftJoin(lastReplyUser, eq(forumThread.lastReplyUserId, lastReplyUser.id))
      .where(eq(forumThread.slug, slug))
      .limit(1);

    if (!threadRow) {
      return null;
    }

    const [tagRows, postRows, subscriptionRow] = await Promise.all([
      db
        .select({
          tagId: forumTag.id,
          slug: forumTag.slug,
          label: forumTag.label,
        })
        .from(forumThreadTag)
        .innerJoin(forumTag, eq(forumThreadTag.tagId, forumTag.id))
        .where(eq(forumThreadTag.threadId, threadRow.id)),
      db
        .select({
          id: forumPost.id,
          threadId: forumPost.threadId,
        authorId: forumPost.authorId,
        authorFirstName: user.firstName,
        authorLastName: user.lastName,
        authorEmail: user.email,
        authorImage: user.image,
        authorRole: user.role,
          content: forumPost.content,
          isEdited: forumPost.isEdited,
          isDeleted: forumPost.isDeleted,
          createdAt: forumPost.createdAt,
          updatedAt: forumPost.updatedAt,
          parentPostId: forumPost.parentPostId,
        })
        .from(forumPost)
        .innerJoin(user, eq(forumPost.authorId, user.id))
        .where(eq(forumPost.threadId, threadRow.id))
        .orderBy(asc(forumPost.createdAt)),
      viewerUserId
        ? db
            .select({
              threadId: forumThreadSubscription.threadId,
            })
            .from(forumThreadSubscription)
            .where(
              and(
                eq(forumThreadSubscription.threadId, threadRow.id),
                eq(forumThreadSubscription.userId, viewerUserId)
              )
            )
            .limit(1)
        : Promise.resolve([]),
    ]);

    const reactionCounts = new Map<
      string,
      Record<ForumPostReactionType, number>
    >();

    if (postRows.length > 0) {
      const reactionAggregation = await db
        .select({
          postId: forumPostReaction.postId,
          type: forumPostReaction.type,
          total: count(forumPostReaction.id),
        })
        .from(forumPostReaction)
        .where(
          inArray(
            forumPostReaction.postId,
            postRows.map((row) => row.id)
          )
        )
        .groupBy(forumPostReaction.postId, forumPostReaction.type);

      for (const reaction of reactionAggregation) {
        const bucket =
          reactionCounts.get(reaction.postId) ?? {
            like: 0,
            insightful: 0,
            support: 0,
          };
        bucket[reaction.type] = reaction.total;
        reactionCounts.set(reaction.postId, bucket);
      }
    }

    const viewerReactionsMap: Record<string, ForumPostReactionType[]> = {};
    if (viewerUserId && postRows.length > 0) {
      const viewerReactions = await db
        .select({
          postId: forumPostReaction.postId,
          type: forumPostReaction.type,
        })
        .from(forumPostReaction)
        .where(
          and(
            eq(forumPostReaction.userId, viewerUserId),
            inArray(
              forumPostReaction.postId,
              postRows.map((row) => row.id)
            )
          )
        );
      for (const entry of viewerReactions) {
        if (!viewerReactionsMap[entry.postId]) {
          viewerReactionsMap[entry.postId] = [];
        }
        viewerReactionsMap[entry.postId].push(entry.type);
      }
    }

    const posts: ForumPostListItem[] = postRows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      author: mapUser({
        id: row.authorId,
        firstName: row.authorFirstName,
        lastName: row.authorLastName,
        email: row.authorEmail,
        image: row.authorImage ?? null,
        role: row.authorRole ?? null,
      }),
      content: row.content,
      isEdited: row.isEdited,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      parentPostId: row.parentPostId,
      reactions:
        reactionCounts.get(row.id) ?? { like: 0, insightful: 0, support: 0 },
    }));

    const thread: ForumThreadListItem = {
      id: threadRow.id,
      slug: threadRow.slug,
      title: threadRow.title,
      summary: threadRow.summary,
      excerpt: buildForumExcerpt(threadRow.summary),
      status: threadRow.status,
      isPinned: threadRow.isPinned,
      isLocked: threadRow.isLocked,
      totalReplies: threadRow.totalReplies,
      viewCount: threadRow.viewCount,
      createdAt: threadRow.createdAt,
      updatedAt: threadRow.updatedAt,
      lastRepliedAt: threadRow.lastRepliedAt,
      category: {
        id: threadRow.categoryId,
        slug: threadRow.categorySlug,
        name: threadRow.categoryName,
      },
      author: mapUser({
        id: threadRow.authorId,
        firstName: threadRow.authorFirstName,
        lastName: threadRow.authorLastName,
        email: threadRow.authorEmail,
        image: threadRow.authorImage ?? null,
        role: threadRow.authorRole ?? null,
      }),
      lastResponder: threadRow.lastReplyUserId
        ? mapUser({
            id: threadRow.lastReplyUserId,
            firstName: threadRow.lastReplyFirstName,
            lastName: threadRow.lastReplyLastName,
            email: threadRow.lastReplyEmail,
            image: threadRow.lastReplyImage ?? null,
            role: threadRow.lastReplyRole ?? null,
          })
        : null,
      tags: tagRows.map((tag) => ({
        id: tag.tagId,
        slug: tag.slug,
        label: tag.label,
      })),
    };

    return {
      thread,
      posts,
      isSubscribed: subscriptionRow.length > 0,
      viewerReactions: viewerReactionsMap,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load forum thread"
    );
  }
}

async function ensureCategory(slug: string) {
  const [category] = await db
    .select()
    .from(forumCategory)
    .where(eq(forumCategory.slug, slug))
    .limit(1);

  if (!category) {
    throw new ChatSDKError("bad_request:validation", "Unknown forum category");
  }
  if (category.isLocked) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Category is locked for new discussions"
    );
  }
  return category;
}

async function ensureThreadBySlug(slug: string) {
  const [thread] = await db
    .select()
    .from(forumThread)
    .where(eq(forumThread.slug, slug))
    .limit(1);

  if (!thread) {
    throw new ChatSDKError("not_found:forum", "Thread not found");
  }

  return thread;
}

export async function resolveForumThreadId(slug: string) {
  const [thread] = await db
    .select({ id: forumThread.id })
    .from(forumThread)
    .where(eq(forumThread.slug, slug))
    .limit(1);

  return thread?.id ?? null;
}

async function findTagIds(slugs?: string[]) {
  if (!slugs || slugs.length === 0) {
    return [];
  }
  const unique = Array.from(
    new Set(
      slugs
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => slug.length > 0)
    )
  ).slice(0, 5);
  if (unique.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: forumTag.id,
      slug: forumTag.slug,
    })
    .from(forumTag)
    .where(inArray(forumTag.slug, unique));

  return rows.map((row) => row.id);
}

export async function createForumThread(input: CreateForumThreadInput) {
  const title = sanitizeForumContent(input.title).replace(/\s+/g, " ").trim();
  const content = sanitizeForumContent(input.content);
  const summarySource =
    typeof input.summary === "string" && input.summary.trim().length > 0
      ? input.summary
      : content;
  const summary = sanitizeForumContent(summarySource);

  if (title.length < 8) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Title must be at least 8 characters long"
    );
  }

  if (content.length < 24) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Post content must be at least 24 characters long"
    );
  }

  const category = await ensureCategory(input.categorySlug);
  const tagIds = await findTagIds(input.tagSlugs);
  const slugBase = getForumSlugBase(title);

  const slugCandidate = await generateUniqueThreadSlug(slugBase);
  const now = new Date();

  try {
    const createdThread = await db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(forumThread)
        .values({
          authorId: input.authorId,
          categoryId: category.id,
          title,
          slug: slugCandidate,
          summary,
          status: "open",
          isLocked: false,
          isPinned: false,
          totalReplies: 0,
          viewCount: 0,
          lastReplyUserId: input.authorId,
          lastRepliedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!thread) {
        throw new ChatSDKError(
          "bad_request:database",
          "Failed to create forum thread"
        );
      }

      await tx.insert(forumPost).values({
        threadId: thread.id,
        authorId: input.authorId,
        content,
        isEdited: false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });

      if (tagIds.length > 0) {
        await tx
          .insert(forumThreadTag)
          .values(
            tagIds.map((tagId) => ({
              threadId: thread.id,
              tagId,
              createdAt: now,
            }))
          )
          .onConflictDoNothing();
      }

      await tx
        .insert(forumThreadSubscription)
        .values({
          threadId: thread.id,
          userId: input.authorId,
          notifyByEmail: true,
          createdAt: now,
        })
        .onConflictDoNothing();

      return thread;
    });

    return createdThread;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to create forum thread"
    );
  }
}

async function generateUniqueThreadSlug(base: string) {
  let slug = base;
  let attempt = 0;

  while (attempt < 8) {
    const existing = await db
      .select({ id: forumThread.id })
      .from(forumThread)
      .where(eq(forumThread.slug, slug))
      .limit(1);

    if (existing.length === 0) {
      return slug;
    }

    attempt += 1;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  return `${base}-${Date.now()}`;
}

export async function createForumPost(input: CreateForumPostInput) {
  const content = sanitizeForumContent(input.content);
  if (content.length < 8) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Reply must be at least 8 characters long"
    );
  }

  const thread = await ensureThreadBySlug(input.threadSlug);
  if (thread.isLocked) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Thread is locked. New replies are disabled."
    );
  }

  if (thread.status === "archived") {
    throw new ChatSDKError(
      "bad_request:validation",
      "Thread is archived and cannot accept replies"
    );
  }

  const parentPostId =
    input.parentPostId && input.parentPostId.trim().length > 0
      ? input.parentPostId
      : null;

  if (parentPostId) {
    const [parentPost] = await db
      .select({
        id: forumPost.id,
        threadId: forumPost.threadId,
      })
      .from(forumPost)
      .where(eq(forumPost.id, parentPostId))
      .limit(1);

    if (!parentPost || parentPost.threadId !== thread.id) {
      throw new ChatSDKError(
        "bad_request:validation",
        "Reply must reference a post within the same thread"
      );
    }
  }

  const now = new Date();

  try {
    const createdPost = await db.transaction(async (tx) => {
      const [post] = await tx
        .insert(forumPost)
        .values({
          threadId: thread.id,
          authorId: input.authorId,
          parentPostId,
          content,
          isEdited: false,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!post) {
        throw new ChatSDKError(
          "bad_request:database",
          "Failed to create forum reply"
        );
      }

      await tx
        .update(forumThread)
        .set({
          totalReplies: sql`${forumThread.totalReplies} + 1`,
          lastReplyUserId: input.authorId,
          lastRepliedAt: now,
          updatedAt: now,
        })
        .where(eq(forumThread.id, thread.id));

      await tx
        .insert(forumThreadSubscription)
        .values({
          threadId: thread.id,
          userId: input.authorId,
          notifyByEmail: true,
          createdAt: now,
        })
        .onConflictDoNothing();

      return post;
    });

    return createdPost;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to create forum reply"
    );
  }
}

export async function toggleForumSubscription({
  threadId,
  userId,
  subscribe,
}: {
  threadId: string;
  userId: string;
  subscribe: boolean;
}) {
  try {
    if (subscribe) {
      await db
        .insert(forumThreadSubscription)
        .values({
          threadId,
          userId,
          notifyByEmail: true,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(forumThreadSubscription)
        .where(
          and(
            eq(forumThreadSubscription.threadId, threadId),
            eq(forumThreadSubscription.userId, userId)
          )
        );
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to update thread subscription"
    );
  }
}

export async function toggleForumPostReaction({
  postId,
  userId,
  type,
}: {
  postId: string;
  userId: string;
  type: ForumPostReactionType;
}) {
  try {
    const [existing] = await db
      .select({
        id: forumPostReaction.id,
      })
      .from(forumPostReaction)
      .where(
        and(
          eq(forumPostReaction.postId, postId),
          eq(forumPostReaction.userId, userId),
          eq(forumPostReaction.type, type)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .delete(forumPostReaction)
        .where(
          and(
            eq(forumPostReaction.id, existing.id),
            eq(forumPostReaction.userId, userId)
          )
        );
      return { active: false };
    }

    await db.insert(forumPostReaction).values({
      postId,
      userId,
      type,
    });

    return { active: true };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to toggle reaction"
    );
  }
}

export async function recordForumThreadView(threadId: string) {
  try {
    await db
      .update(forumThread)
      .set({
        viewCount: sql`${forumThread.viewCount} + 1`,
        updatedAt: sql`GREATEST(${forumThread.updatedAt}, now())`,
      })
      .where(eq(forumThread.id, threadId));
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to record thread view"
    );
  }
}

export async function updateForumThreadStatus({
  slug,
  userId,
  isAdmin,
  status,
}: {
  slug: string;
  userId: string;
  isAdmin: boolean;
  status: ForumThreadStatus;
}) {
  const validStatus = new Set(forumThreadStatusEnum.enumValues);
  if (!validStatus.has(status)) {
    throw new ChatSDKError("bad_request:forum", "Invalid status value");
  }

  const thread = await ensureThreadOwner({ slug, userId, isAdmin });
  const now = new Date();

  await db
    .update(forumThread)
    .set({
      status,
      updatedAt: now,
      lastRepliedAt:
        status === "resolved" ? now : forumThread.lastRepliedAt,
    })
    .where(eq(forumThread.id, thread.id));
}

export async function deleteForumThread({
  slug,
  userId,
  isAdmin,
}: {
  slug: string;
  userId: string;
  isAdmin: boolean;
}) {
  const thread = await ensureThreadOwner({ slug, userId, isAdmin });
  await db.delete(forumThread).where(eq(forumThread.id, thread.id));
}

export async function createForumCategory(input: CreateForumCategoryInput) {
  const name = sanitizeForumContent(input.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 3) {
    throw new ChatSDKError(
      "bad_request:validation",
      "Category name must be at least 3 characters long"
    );
  }

  const description =
    typeof input.description === "string"
      ? sanitizeForumContent(input.description)
      : null;
  const providedSlug =
    typeof input.slug === "string"
      ? input.slug.trim()
      : "";
  const position =
    typeof input.position === "number" && Number.isFinite(input.position)
      ? Math.max(0, Math.floor(input.position))
      : 0;
  const isLocked = Boolean(input.isLocked);
  const slug = getForumSlugBase(
    providedSlug.length > 0 ? providedSlug : name
  );
  const now = new Date();

  try {
    const [category] = await db
      .insert(forumCategory)
      .values({
        name,
        slug,
        description,
        position,
        isLocked,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (!category) {
      throw new ChatSDKError(
        "bad_request:database",
        "A category with this slug already exists"
      );
    }

    await registerTranslationKeys(
      buildCategoryTranslationDefinitions({
        slug: category.slug,
        name: category.name,
        description: category.description ?? null,
      })
    );

    return category;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Unable to create forum category"
    );
  }
}
