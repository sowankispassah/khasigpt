import { formatDistanceToNow } from "date-fns";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminDataPanel } from "@/components/admin-data-panel";
import { AdminForumConfirmForm } from "@/components/admin-forum-confirm-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
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
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const THREAD_LIMIT = 40;
const POST_LIMIT = 80;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

function authorLabel(row: {
  authorFirstName: string | null;
  authorLastName: string | null;
  authorEmail: string | null;
}) {
  const name = [row.authorFirstName, row.authorLastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || row.authorEmail || "Unknown user";
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "default" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 font-semibold text-xs",
        tone === "success" && "border-emerald-300 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-300 bg-amber-50 text-amber-700",
        tone === "danger" && "border-red-300 bg-red-50 text-red-700",
        tone === "default" && "border-slate-300 bg-slate-50 text-slate-700"
      )}
    >
      {children}
    </span>
  );
}

function AdminTable({
  children,
  minWidth = "min-w-[1100px]",
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", minWidth)}>
        {children}
      </table>
    </div>
  );
}

const tableHeadClass =
  "sticky top-0 z-10 whitespace-nowrap border-b bg-muted/70 px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide";
const tableCellClass = "whitespace-nowrap border-b px-3 py-2 align-middle";
const tableActionCellClass =
  "sticky right-0 z-10 whitespace-nowrap border-b bg-background px-3 py-2 text-right align-middle shadow-[-12px_0_18px_-18px_rgba(15,23,42,0.9)]";
const tableInputClass =
  "h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const tableSelectClass =
  "h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function AdminForumPage() {
  await requireAdmin();
  const { categories, threads, posts, metrics } = await getAdminForumData();
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const discussionPosts = posts.filter((post) => !post.parentPostId);
  const comments = posts.filter((post) => post.parentPostId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          Community Forum
        </p>
        <h2 className="font-semibold text-3xl tracking-tight">
          Forum moderation
        </h2>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Manage categories, discussions, comments, visibility, moderation state,
          and destructive cleanup from one admin-only control surface.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total threads" value={metrics.totalThreads} />
        <MetricCard label="Archived" value={metrics.archivedThreads} />
        <MetricCard label="Locked / flagged" value={metrics.lockedThreads} />
        <MetricCard label="Hidden posts" value={metrics.hiddenPosts} />
      </section>

      <AdminDataPanel title="Create category">
        <form action={createCategoryAction} className="grid gap-4 p-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Name</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              name="name"
              placeholder="Product Help"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Slug</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              name="slug"
              placeholder="product-help"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Position</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              defaultValue="0"
              min={0}
              name="position"
              type="number"
            />
          </label>
          <div className="flex items-end">
            <ActionSubmitButton className="w-full" successMessage="Category created">
              Add category
            </ActionSubmitButton>
          </div>
          <label className="flex flex-col gap-1 text-sm md:col-span-3">
            <span className="font-medium">Description</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              name="description"
              placeholder="Describe when users should use this category."
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isLocked" type="checkbox" />
            Disabled / locked
          </label>
        </form>
      </AdminDataPanel>

      <AdminDataPanel title="Categories">
        <AdminTable minWidth="min-w-[980px]">
          <thead><tr><th className={tableHeadClass}>Status</th><th className={tableHeadClass}>Name</th><th className={tableHeadClass}>Description</th><th className={tableHeadClass}>Position</th><th className={tableHeadClass}>Slug</th><th className={tableHeadClass}>Threads</th><th className={tableHeadClass}>Disable</th><th className={cn(tableHeadClass, "right-0 bg-muted text-right")}>Actions</th></tr></thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td className={tableCellClass}><form action={updateCategoryAction} id={`category-${category.id}`} /><input form={`category-${category.id}`} name="id" type="hidden" value={category.id} /><StatusBadge tone={category.isLocked ? "warning" : "success"}>{category.isLocked ? "Disabled" : "Active"}</StatusBadge></td>
                <td className={tableCellClass}><input className={cn(tableInputClass, "w-56")} defaultValue={category.name} form={`category-${category.id}`} name="name" required /></td>
                <td className={tableCellClass}><input className={cn(tableInputClass, "w-[28rem]")} defaultValue={category.description ?? ""} form={`category-${category.id}`} name="description" /></td>
                <td className={tableCellClass}><input className={cn(tableInputClass, "w-24")} defaultValue={category.position} form={`category-${category.id}`} name="position" type="number" /></td>
                <td className={tableCellClass}><span className="text-muted-foreground">{category.slug}</span></td>
                <td className={tableCellClass}>{category.threadCount}</td>
                <td className={tableCellClass}><label className="inline-flex items-center gap-2"><input defaultChecked={category.isLocked} form={`category-${category.id}`} name="isLocked" type="checkbox" /><span className="text-muted-foreground text-xs">Disabled</span></label></td>
                <td className={tableActionCellClass}><div className="inline-flex items-center justify-end gap-2"><ActionSubmitButton form={`category-${category.id}`} size="sm" successMessage="Category updated" variant="outline">Save</ActionSubmitButton><AdminForumConfirmForm action={deleteCategoryAction} confirmMessage="Delete this category? This only works when it has no threads."><input name="id" type="hidden" value={category.id} /><ActionSubmitButton disabled={Number(category.threadCount) > 0} size="sm" successMessage="Category deleted" variant="destructive">Delete</ActionSubmitButton></AdminForumConfirmForm></div></td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </AdminDataPanel>

      <AdminDataPanel title="Posts / discussions">
        <AdminTable minWidth="min-w-[1500px]">
          <thead><tr><th className={tableHeadClass}>Status</th><th className={tableHeadClass}>Title</th><th className={tableHeadClass}>Summary</th><th className={tableHeadClass}>Category</th><th className={tableHeadClass}>Author</th><th className={tableHeadClass}>Replies</th><th className={tableHeadClass}>Views</th><th className={tableHeadClass}>Updated</th><th className={tableHeadClass}>Status edit</th><th className={tableHeadClass}>Lock</th><th className={tableHeadClass}>Pin</th><th className={cn(tableHeadClass, "right-0 bg-muted text-right")}>Actions</th></tr></thead>
          <tbody>
            {threads.map((thread) => (
              <tr key={thread.id}>
                <td className={tableCellClass}><form action={updateThreadAction} id={`thread-${thread.id}`} /><input form={`thread-${thread.id}`} name="id" type="hidden" value={thread.id} /><StatusBadge tone={thread.status === "archived" ? "danger" : thread.isLocked ? "warning" : "success"}>{thread.status}</StatusBadge>{thread.isLocked ? <Badge variant="secondary">Flagged</Badge> : null}{thread.isPinned ? <Badge variant="secondary">Pinned</Badge> : null}</td>
                <td className={tableCellClass}><input className={cn(tableInputClass, "w-72")} defaultValue={thread.title} form={`thread-${thread.id}`} name="title" required /></td>
                <td className={tableCellClass}><input className={cn(tableInputClass, "w-[34rem]")} defaultValue={thread.summary} form={`thread-${thread.id}`} name="summary" required /></td>
                <td className={tableCellClass}><select className={cn(tableSelectClass, "w-48")} defaultValue={thread.categoryId} form={`thread-${thread.id}`} name="categoryId">{categoryOptions.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}</select></td>
                <td className={tableCellClass}>{authorLabel(thread)}</td><td className={tableCellClass}>{thread.totalReplies}</td><td className={tableCellClass}>{thread.viewCount}</td><td className={tableCellClass}>{formatDistanceToNow(thread.updatedAt, { addSuffix: true })}</td>
                <td className={tableCellClass}><select className={cn(tableSelectClass, "w-32")} defaultValue={thread.status} form={`thread-${thread.id}`} name="status">{forumThreadStatusEnum.enumValues.map((status) => (<option key={status} value={status}>{status}</option>))}</select></td>
                <td className={tableCellClass}><label className="inline-flex items-center gap-2"><input defaultChecked={thread.isLocked} form={`thread-${thread.id}`} name="isLocked" type="checkbox" />Lock</label></td>
                <td className={tableCellClass}><label className="inline-flex items-center gap-2"><input defaultChecked={thread.isPinned} form={`thread-${thread.id}`} name="isPinned" type="checkbox" />Pin</label></td>
                <td className={tableActionCellClass}><div className="inline-flex items-center justify-end gap-2"><ActionSubmitButton form={`thread-${thread.id}`} size="sm" successMessage="Thread updated" variant="outline">Save</ActionSubmitButton><Button asChild size="sm" variant="secondary"><Link href={`/forum/${thread.slug}`}>View</Link></Button><AdminForumConfirmForm action={deleteThreadAction} confirmMessage="Permanently delete this discussion and all comments?"><input name="id" type="hidden" value={thread.id} /><input name="slug" type="hidden" value={thread.slug} /><ActionSubmitButton size="sm" successMessage="Thread deleted" variant="destructive">Delete</ActionSubmitButton></AdminForumConfirmForm></div></td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </AdminDataPanel>

      <AdminDataPanel title="Posts">
        <AdminTable minWidth="min-w-[1350px]">
          <thead><tr><th className={tableHeadClass}>Status</th><th className={tableHeadClass}>Thread</th><th className={tableHeadClass}>Category</th><th className={tableHeadClass}>Author</th><th className={tableHeadClass}>Content</th><th className={tableHeadClass}>Created</th><th className={tableHeadClass}>Updated</th><th className={tableHeadClass}>Hide</th><th className={cn(tableHeadClass, "right-0 bg-muted text-right")}>Actions</th></tr></thead>
          <tbody>{discussionPosts.map((post) => (<tr key={post.id}><td className={tableCellClass}><form action={updatePostAction} id={`post-${post.id}`} /><input form={`post-${post.id}`} name="id" type="hidden" value={post.id} /><input form={`post-${post.id}`} name="threadId" type="hidden" value={post.threadId} /><input form={`post-${post.id}`} name="slug" type="hidden" value={post.threadSlug} /><StatusBadge tone={post.isDeleted ? "danger" : "success"}>{post.isDeleted ? "Inactive / hidden" : "Active"}</StatusBadge>{post.isEdited ? <Badge variant="outline">Edited</Badge> : null}</td><td className={tableCellClass}>{post.threadTitle}</td><td className={tableCellClass}>{post.categoryName}</td><td className={tableCellClass}>{authorLabel(post)}</td><td className={tableCellClass}><input className={cn(tableInputClass, "w-[36rem]")} defaultValue={post.content} form={`post-${post.id}`} name="content" /></td><td className={tableCellClass}>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</td><td className={tableCellClass}>{formatDistanceToNow(post.updatedAt, { addSuffix: true })}</td><td className={tableCellClass}><label className="inline-flex items-center gap-2"><input defaultChecked={post.isDeleted} form={`post-${post.id}`} name="isDeleted" type="checkbox" />Hidden</label></td><td className={tableActionCellClass}><div className="inline-flex items-center justify-end gap-2"><ActionSubmitButton form={`post-${post.id}`} size="sm" successMessage="Post updated" variant="outline">Save</ActionSubmitButton><Button asChild size="sm" variant="secondary"><Link href={`/forum/${post.threadSlug}`}>View</Link></Button><AdminForumConfirmForm action={deletePostAction} confirmMessage="Permanently delete this post?"><input name="id" type="hidden" value={post.id} /><input name="threadId" type="hidden" value={post.threadId} /><input name="slug" type="hidden" value={post.threadSlug} /><ActionSubmitButton size="sm" successMessage="Post deleted" variant="destructive">Delete</ActionSubmitButton></AdminForumConfirmForm></div></td></tr>))}</tbody>
        </AdminTable>
      </AdminDataPanel>

      <AdminDataPanel title="Comments">
        <AdminTable minWidth="min-w-[1350px]">
          <thead><tr><th className={tableHeadClass}>Status</th><th className={tableHeadClass}>Thread</th><th className={tableHeadClass}>Category</th><th className={tableHeadClass}>Author</th><th className={tableHeadClass}>Comment</th><th className={tableHeadClass}>Created</th><th className={tableHeadClass}>Updated</th><th className={tableHeadClass}>Hide</th><th className={cn(tableHeadClass, "right-0 bg-muted text-right")}>Actions</th></tr></thead>
          <tbody>{comments.map((post) => (<tr key={post.id}><td className={tableCellClass}><form action={updatePostAction} id={`comment-${post.id}`} /><input form={`comment-${post.id}`} name="id" type="hidden" value={post.id} /><input form={`comment-${post.id}`} name="threadId" type="hidden" value={post.threadId} /><input form={`comment-${post.id}`} name="slug" type="hidden" value={post.threadSlug} /><StatusBadge tone={post.isDeleted ? "danger" : "success"}>{post.isDeleted ? "Inactive / hidden" : "Active"}</StatusBadge>{post.isEdited ? <Badge variant="outline">Edited</Badge> : null}</td><td className={tableCellClass}>{post.threadTitle}</td><td className={tableCellClass}>{post.categoryName}</td><td className={tableCellClass}>{authorLabel(post)}</td><td className={tableCellClass}><input className={cn(tableInputClass, "w-[36rem]")} defaultValue={post.content} form={`comment-${post.id}`} name="content" /></td><td className={tableCellClass}>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</td><td className={tableCellClass}>{formatDistanceToNow(post.updatedAt, { addSuffix: true })}</td><td className={tableCellClass}><label className="inline-flex items-center gap-2"><input defaultChecked={post.isDeleted} form={`comment-${post.id}`} name="isDeleted" type="checkbox" />Hidden</label></td><td className={tableActionCellClass}><div className="inline-flex items-center justify-end gap-2"><ActionSubmitButton form={`comment-${post.id}`} size="sm" successMessage="Comment updated" variant="outline">Save</ActionSubmitButton><Button asChild size="sm" variant="secondary"><Link href={`/forum/${post.threadSlug}`}>View</Link></Button><AdminForumConfirmForm action={deletePostAction} confirmMessage="Permanently delete this comment?"><input name="id" type="hidden" value={post.id} /><input name="threadId" type="hidden" value={post.threadId} /><input name="slug" type="hidden" value={post.threadSlug} /><ActionSubmitButton size="sm" successMessage="Comment deleted" variant="destructive">Delete</ActionSubmitButton></AdminForumConfirmForm></div></td></tr>))}</tbody>
        </AdminTable>
      </AdminDataPanel>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card/80 p-5 shadow-sm">
      <p className="font-medium text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 font-semibold text-3xl">{value}</p>
    </div>
  );
}
