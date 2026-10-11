import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdminNotice, AdminPageHeader } from "@/components/admin/admin-ui";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { db } from "@/lib/db/queries";
import {
  type ForumThreadStatus,
  forumCategory,
  forumPost,
  forumThread,
  forumThreadStatusEnum,
  user,
} from "@/lib/db/schema";
import {
  getForumSlugBase,
  sanitizeForumContent,
} from "@/lib/forum/utils";
import { registerTranslationKeys } from "@/lib/i18n/dictionary";
import {
  getActiveAdminSession,
  requireAdminPageSession,
} from "@/lib/security/admin-session";
import {
  ForumCategoriesPanel,
  ForumDiscussionsPanel,
  ForumMetricsRow,
  ForumPostsPanel,
} from "./forum-sections";

export const dynamic = "force-dynamic";

const THREAD_LIMIT = 40;
const POST_LIMIT = 80;

async function requireAdmin() {
  const session = await getActiveAdminSession();
  if (!session) {
    redirect("/");
  }
  return session;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function revalidateForumAdmin(source: string, threadSlug?: string) {
  invalidateAdminMutation({
    paths: [
      { path: "/admin/forum" },
      { path: "/forum" },
      ...(threadSlug ? [{ path: `/forum/${threadSlug}` }] : []),
    ],
    source,
  });
}

async function recalculateThreadReplies(threadId: string) {
  const [aggregate] = await db
    .select({
      total: count(forumPost.id),
      latest: sql<Date | null>`MAX(${forumPost.createdAt})`,
    })
    .from(forumPost)
    .where(and(eq(forumPost.threadId, threadId), eq(forumPost.isDeleted, false)));

  await db
    .update(forumThread)
    .set({
      totalReplies: Math.max(Number(aggregate?.total ?? 0) - 1, 0),
      lastRepliedAt: aggregate?.latest ?? null,
      updatedAt: new Date(),
    })
    .where(eq(forumThread.id, threadId));
}

async function createCategoryAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const name = sanitizeForumContent(textValue(formData, "name")).replace(
    /\s+/g,
    " "
  );
  if (name.length < 3) {
    return;
  }
  const description = sanitizeForumContent(textValue(formData, "description"));
  const providedSlug = textValue(formData, "slug");
  const position = Number.parseInt(textValue(formData, "position"), 10);
  const slug = getForumSlugBase(providedSlug || name);
  const now = new Date();

  const [category] = await db
    .insert(forumCategory)
    .values({
      name,
      slug,
      description: description || null,
      position: Number.isFinite(position) ? Math.max(0, position) : 0,
      isLocked: booleanValue(formData, "isLocked"),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (category) {
    await registerTranslationKeys([
      {
        key: `forum.category.${category.slug}.name`,
        defaultText: category.name,
        description: `Display name for the "${category.name}" forum category.`,
      },
      {
        key: `forum.category.${category.slug}.description`,
        defaultText: category.description ?? "",
        description: `Description for the "${category.name}" forum category.`,
      },
    ]);
  }

  revalidateForumAdmin("forum.category.create");
}

async function updateCategoryAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  const name = sanitizeForumContent(textValue(formData, "name")).replace(
    /\s+/g,
    " "
  );
  if (!id || name.length < 3) {
    return;
  }
  const description = sanitizeForumContent(textValue(formData, "description"));
  const position = Number.parseInt(textValue(formData, "position"), 10);

  const [category] = await db
    .update(forumCategory)
    .set({
      name,
      description: description || null,
      position: Number.isFinite(position) ? Math.max(0, position) : 0,
      isLocked: booleanValue(formData, "isLocked"),
      updatedAt: new Date(),
    })
    .where(eq(forumCategory.id, id))
    .returning();

  if (category) {
    await registerTranslationKeys([
      {
        key: `forum.category.${category.slug}.name`,
        defaultText: category.name,
        description: `Display name for the "${category.name}" forum category.`,
      },
      {
        key: `forum.category.${category.slug}.description`,
        defaultText: category.description ?? "",
        description: `Description for the "${category.name}" forum category.`,
      },
    ]);
  }

  revalidateForumAdmin("forum.category.update");
}

async function deleteCategoryAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  if (!id) {
    return;
  }
  const [usage] = await db
    .select({ total: count(forumThread.id) })
    .from(forumThread)
    .where(eq(forumThread.categoryId, id));
  if (Number(usage?.total ?? 0) > 0) {
    return;
  }

  await db.delete(forumCategory).where(eq(forumCategory.id, id));
  revalidateForumAdmin("forum.category.delete");
}

async function updateThreadAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  const title = sanitizeForumContent(textValue(formData, "title")).replace(
    /\s+/g,
    " "
  );
  const summary = sanitizeForumContent(textValue(formData, "summary"));
  const status = textValue(formData, "status") as ForumThreadStatus;
  const categoryId = textValue(formData, "categoryId");
  if (
    !id ||
    title.length < 3 ||
    summary.length < 3 ||
    !categoryId ||
    !forumThreadStatusEnum.enumValues.includes(status)
  ) {
    return;
  }

  const [thread] = await db
    .update(forumThread)
    .set({
      title,
      summary,
      status,
      categoryId,
      isPinned: booleanValue(formData, "isPinned"),
      isLocked: booleanValue(formData, "isLocked"),
      updatedAt: new Date(),
    })
    .where(eq(forumThread.id, id))
    .returning({ slug: forumThread.slug });

  revalidateForumAdmin("forum.thread.update", thread?.slug);
}

async function deleteThreadAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  const slug = textValue(formData, "slug");
  if (!id) {
    return;
  }

  await db.delete(forumThread).where(eq(forumThread.id, id));
  revalidateForumAdmin("forum.thread.delete", slug || undefined);
}

async function updatePostAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  const threadId = textValue(formData, "threadId");
  const slug = textValue(formData, "slug");
  const content = sanitizeForumContent(textValue(formData, "content"));
  if (!id || !threadId || content.length < 1) {
    return;
  }

  await db
    .update(forumPost)
    .set({
      content,
      isDeleted: booleanValue(formData, "isDeleted"),
      isEdited: true,
      updatedAt: new Date(),
    })
    .where(eq(forumPost.id, id));

  await recalculateThreadReplies(threadId);
  revalidateForumAdmin("forum.post.update", slug || undefined);
}

async function deletePostAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = textValue(formData, "id");
  const threadId = textValue(formData, "threadId");
  const slug = textValue(formData, "slug");
  if (!id || !threadId) {
    return;
  }

  await db.delete(forumPost).where(eq(forumPost.id, id));
  await recalculateThreadReplies(threadId);
  revalidateForumAdmin("forum.post.delete", slug || undefined);
}

async function getAdminForumData() {
  const author = user;
  const [
    categories,
    threads,
    posts,
    totalThreads,
    archivedThreads,
    lockedThreads,
    hiddenPosts,
  ] = await Promise.all([
    db
      .select({
        id: forumCategory.id,
        slug: forumCategory.slug,
        name: forumCategory.name,
        description: forumCategory.description,
        position: forumCategory.position,
        isLocked: forumCategory.isLocked,
        createdAt: forumCategory.createdAt,
        updatedAt: forumCategory.updatedAt,
        threadCount: count(forumThread.id),
      })
      .from(forumCategory)
      .leftJoin(forumThread, eq(forumThread.categoryId, forumCategory.id))
      .groupBy(forumCategory.id)
      .orderBy(asc(forumCategory.position), asc(forumCategory.name)),
    db
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
        categoryId: forumThread.categoryId,
        categoryName: forumCategory.name,
        authorEmail: author.email,
        authorFirstName: author.firstName,
        authorLastName: author.lastName,
      })
      .from(forumThread)
      .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
      .innerJoin(author, eq(forumThread.authorId, author.id))
      .orderBy(desc(forumThread.updatedAt))
      .limit(THREAD_LIMIT),
    db
      .select({
        id: forumPost.id,
        threadId: forumPost.threadId,
        parentPostId: forumPost.parentPostId,
        content: forumPost.content,
        isDeleted: forumPost.isDeleted,
        isEdited: forumPost.isEdited,
        createdAt: forumPost.createdAt,
        updatedAt: forumPost.updatedAt,
        threadSlug: forumThread.slug,
        threadTitle: forumThread.title,
        categoryName: forumCategory.name,
        authorEmail: author.email,
        authorFirstName: author.firstName,
        authorLastName: author.lastName,
      })
      .from(forumPost)
      .innerJoin(forumThread, eq(forumPost.threadId, forumThread.id))
      .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
      .innerJoin(author, eq(forumPost.authorId, author.id))
      .orderBy(desc(forumPost.updatedAt))
      .limit(POST_LIMIT),
    db.select({ total: count(forumThread.id) }).from(forumThread),
    db
      .select({ total: count(forumThread.id) })
      .from(forumThread)
      .where(eq(forumThread.status, "archived")),
    db
      .select({ total: count(forumThread.id) })
      .from(forumThread)
      .where(eq(forumThread.isLocked, true)),
    db
      .select({ total: count(forumPost.id) })
      .from(forumPost)
      .where(eq(forumPost.isDeleted, true)),
  ]);

  return {
    categories,
    threads,
    posts,
    metrics: {
      totalThreads: Number(totalThreads[0]?.total ?? 0),
      archivedThreads: Number(archivedThreads[0]?.total ?? 0),
      lockedThreads: Number(lockedThreads[0]?.total ?? 0),
      hiddenPosts: Number(hiddenPosts[0]?.total ?? 0),
    },
  };
}

export default async function AdminForumPage() {
  await requireAdminPageSession();
  const forumState = await adminQueryResult({
    fallback: {
      categories: [],
      threads: [],
      posts: [],
      metrics: {
        totalThreads: 0,
        archivedThreads: 0,
        lockedThreads: 0,
        hiddenPosts: 0,
      },
    } as Awaited<ReturnType<typeof getAdminForumData>>,
    label: "forum.snapshot",
    promise: getAdminForumData(),
  });
  const { categories, threads, posts, metrics } = forumState.data;
  const forumConfirmed = forumState.ok;
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const discussionPosts = posts.filter((post) => !post.parentPostId);
  const comments = posts.filter((post) => post.parentPostId);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Moderate discussions, posts and comments, and manage forum categories."
        navHref="/admin/forum"
        title="Forum moderation"
      />

      {!forumConfirmed ? (
        <AdminNotice>
          Forum admin data could not be confirmed. Lists are shown as
          unavailable instead of empty fallback data; refresh this section to
          retry.
        </AdminNotice>
      ) : null}

      <ForumMetricsRow confirmed={forumConfirmed} metrics={metrics} />

      <div className="grid gap-6 xl:grid-cols-3">
        <ForumDiscussionsPanel
          categoryOptions={categoryOptions}
          className="xl:col-span-2"
          confirmed={forumConfirmed}
          deleteThreadAction={deleteThreadAction}
          limit={THREAD_LIMIT}
          statusOptions={forumThreadStatusEnum.enumValues}
          threads={threads}
          updateThreadAction={updateThreadAction}
        />
        <ForumCategoriesPanel
          categories={categories}
          confirmed={forumConfirmed}
          createCategoryAction={createCategoryAction}
          deleteCategoryAction={deleteCategoryAction}
          updateCategoryAction={updateCategoryAction}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ForumPostsPanel
          confirmed={forumConfirmed}
          deletePostAction={deletePostAction}
          kind="post"
          limit={POST_LIMIT}
          posts={discussionPosts}
          updatePostAction={updatePostAction}
        />
        <ForumPostsPanel
          confirmed={forumConfirmed}
          deletePostAction={deletePostAction}
          kind="comment"
          limit={POST_LIMIT}
          posts={comments}
          updatePostAction={updatePostAction}
        />
      </div>
    </div>
  );
}
