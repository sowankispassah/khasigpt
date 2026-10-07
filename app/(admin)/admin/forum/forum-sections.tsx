import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  ChevronDown,
  EyeOff,
  Lock,
  MessagesSquare,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionSubmitButton } from "@/components/action-submit-button";
import {
  AdminEmptyState,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
  type AdminStatusTone,
} from "@/components/admin/admin-ui";
import { AdminForumConfirmForm } from "@/components/admin-forum-confirm-form";
import { Button } from "@/components/ui/button";
import type { ForumThreadStatus } from "@/lib/db/schema";

type FormAction = (formData: FormData) => Promise<void>;

type AuthorFields = {
  authorEmail: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
};

export type ForumCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  isLocked: boolean;
  threadCount: number;
};

export type ForumThreadRow = AuthorFields & {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: ForumThreadStatus;
  isPinned: boolean;
  isLocked: boolean;
  totalReplies: number;
  viewCount: number;
  updatedAt: Date;
  categoryId: string;
  categoryName: string;
};

export type ForumPostRow = AuthorFields & {
  id: string;
  threadId: string;
  content: string;
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
  threadSlug: string;
  threadTitle: string;
  categoryName: string;
};

export type ForumMetrics = {
  totalThreads: number;
  archivedThreads: number;
  lockedThreads: number;
  hiddenPosts: number;
};

const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const integerFormatter = new Intl.NumberFormat("en-IN");

const THREAD_STATUS_TONES: Record<ForumThreadStatus, AdminStatusTone> = {
  archived: "neutral",
  locked: "warning",
  open: "success",
  resolved: "info",
};

function authorLabel(row: AuthorFields) {
  const name = [row.authorFirstName, row.authorLastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || row.authorEmail || "Unknown user";
}

function relative(date: Date) {
  return formatDistanceToNow(date, { addSuffix: true });
}

function FieldLabel({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: every caller passes its input, select or textarea as children.
    <label className={`flex min-w-0 flex-col gap-1.5 text-sm ${className ?? ""}`}>
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

function CheckboxField({
  defaultChecked,
  label,
  name,
}: {
  defaultChecked: boolean;
  label: string;
  name: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        className="size-4 cursor-pointer"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function MetaLine({ items }: { items: ReactNode[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered metadata
        <span key={index}>{item}</span>
      ))}
    </div>
  );
}

/** A list row whose summary stays readable and whose editor opens inline. */
function ExpandableRow({
  children,
  summary,
}: {
  children: ReactNode;
  summary: ReactNode;
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 transition hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">{summary}</div>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
            <span className="hidden sm:inline group-open:hidden">Manage</span>
            <span className="hidden sm:group-open:inline">Close</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform duration-150 group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="border-t bg-muted/20 px-5 py-4">{children}</div>
      </details>
    </li>
  );
}

function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
      {children}
    </div>
  );
}

function UnavailableOrEmpty({
  confirmed,
  emptyTitle,
  unavailableTitle,
}: {
  confirmed: boolean;
  emptyTitle: string;
  unavailableTitle: string;
}) {
  return confirmed ? (
    <AdminEmptyState title={emptyTitle} />
  ) : (
    <AdminEmptyState
      description="Refresh this section to retry."
      title={unavailableTitle}
    />
  );
}

export function ForumMetricsRow({
  confirmed,
  metrics,
}: {
  confirmed: boolean;
  metrics: ForumMetrics;
}) {
  const value = (count: number) =>
    confirmed ? integerFormatter.format(count) : null;
  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <AdminStatCard
        hint="Across every category"
        icon={MessagesSquare}
        label="Total threads"
        value={value(metrics.totalThreads)}
      />
      <AdminStatCard
        hint="No longer active"
        icon={Archive}
        label="Archived"
        value={value(metrics.archivedThreads)}
      />
      <AdminStatCard
        hint="Locked or flagged threads"
        icon={Lock}
        label="Locked / flagged"
        value={value(metrics.lockedThreads)}
      />
      <AdminStatCard
        hint="Posts and comments hidden"
        icon={EyeOff}
        label="Hidden posts"
        value={value(metrics.hiddenPosts)}
      />
    </section>
  );
}

export function ForumDiscussionsPanel({
  categoryOptions,
  className,
  confirmed,
  deleteThreadAction,
  limit,
  statusOptions,
  threads,
  updateThreadAction,
}: {
  categoryOptions: { id: string; name: string }[];
  className?: string;
  confirmed: boolean;
  deleteThreadAction: FormAction;
  limit: number;
  statusOptions: readonly ForumThreadStatus[];
  threads: ForumThreadRow[];
  updateThreadAction: FormAction;
}) {
  return (
    <AdminPanel
      className={`min-w-0 ${className ?? ""}`}
      description={`The ${limit} most recently updated threads. Open a thread to edit, move, lock, pin or delete it.`}
      title="Discussions"
    >
      {!confirmed || threads.length === 0 ? (
        <UnavailableOrEmpty
          confirmed={confirmed}
          emptyTitle="No forum discussions found"
          unavailableTitle="Unable to load forum discussions"
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {threads.map((thread) => (
            <ExpandableRow
              key={thread.id}
              summary={
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {thread.title}
                    </span>
                    <AdminStatusPill
                      className="capitalize"
                      tone={THREAD_STATUS_TONES[thread.status] ?? "neutral"}
                    >
                      {thread.status}
                    </AdminStatusPill>
                    {thread.isLocked ? (
                      <AdminStatusPill tone="warning">Flagged</AdminStatusPill>
                    ) : null}
                    {thread.isPinned ? (
                      <AdminStatusPill tone="info">Pinned</AdminStatusPill>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
                    {thread.summary}
                  </p>
                  <MetaLine
                    items={[
                      thread.categoryName,
                      `by ${authorLabel(thread)}`,
                      `${integerFormatter.format(thread.totalReplies)} replies`,
                      `${integerFormatter.format(thread.viewCount)} views`,
                      `updated ${relative(thread.updatedAt)}`,
                    ]}
                  />
                </>
              }
            >
              <form
                action={updateThreadAction}
                className="grid gap-3 md:grid-cols-2"
              >
                <input name="id" type="hidden" value={thread.id} />
                <FieldLabel className="md:col-span-2" label="Title">
                  <input
                    className={inputClass}
                    defaultValue={thread.title}
                    name="title"
                    required
                  />
                </FieldLabel>
                <FieldLabel className="md:col-span-2" label="Summary">
                  <textarea
                    className={textareaClass}
                    defaultValue={thread.summary}
                    name="summary"
                    required
                    rows={2}
                  />
                </FieldLabel>
                <FieldLabel label="Category">
                  <select
                    className={`${inputClass} cursor-pointer`}
                    defaultValue={thread.categoryId}
                    name="categoryId"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel label="Status">
                  <select
                    className={`${inputClass} cursor-pointer capitalize`}
                    defaultValue={thread.status}
                    name="status"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                  <CheckboxField
                    defaultChecked={thread.isLocked}
                    label="Locked / flagged"
                    name="isLocked"
                  />
                  <CheckboxField
                    defaultChecked={thread.isPinned}
                    label="Pinned"
                    name="isPinned"
                  />
                  <ActionSubmitButton
                    className="ml-auto"
                    size="sm"
                    successMessage="Thread updated"
                  >
                    Save changes
                  </ActionSubmitButton>
                </div>
              </form>
              <RowActions>
                <Button asChild className="cursor-pointer" size="sm" variant="outline">
                  <Link href={`/forum/${thread.slug}`}>View thread</Link>
                </Button>
                <AdminForumConfirmForm
                  action={deleteThreadAction}
                  confirmMessage="Permanently delete this discussion and all comments?"
                >
                  <input name="id" type="hidden" value={thread.id} />
                  <input name="slug" type="hidden" value={thread.slug} />
                  <ActionSubmitButton
                    size="sm"
                    successMessage="Thread deleted"
                    variant="destructive"
                  >
                    Delete thread
                  </ActionSubmitButton>
                </AdminForumConfirmForm>
              </RowActions>
            </ExpandableRow>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

export function ForumPostsPanel({
  confirmed,
  deletePostAction,
  kind,
  limit,
  posts,
  updatePostAction,
}: {
  confirmed: boolean;
  deletePostAction: FormAction;
  kind: "post" | "comment";
  limit: number;
  posts: ForumPostRow[];
  updatePostAction: FormAction;
}) {
  const isComment = kind === "comment";
  const noun = isComment ? "comment" : "post";
  const Noun = isComment ? "Comment" : "Post";

  return (
    <AdminPanel
      className="min-w-0"
      description={
        isComment
          ? "Replies to posts, from the latest updated forum activity."
          : `Top-level posts, from the ${limit} most recently updated posts and comments.`
      }
      title={isComment ? "Comments" : "Posts"}
    >
      {!confirmed || posts.length === 0 ? (
        <UnavailableOrEmpty
          confirmed={confirmed}
          emptyTitle={`No forum ${noun}s found`}
          unavailableTitle={`Unable to load forum ${noun}s`}
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {posts.map((post) => (
            <ExpandableRow
              key={post.id}
              summary={
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AdminStatusPill tone={post.isDeleted ? "danger" : "success"}>
                      {post.isDeleted ? "Hidden" : "Visible"}
                    </AdminStatusPill>
                    {post.isEdited ? <AdminStatusPill>Edited</AdminStatusPill> : null}
                    <span className="min-w-0 truncate text-muted-foreground text-xs">
                      in {post.threadTitle}
                    </span>
                  </div>
                  <p
                    className={`mt-1 line-clamp-2 whitespace-pre-line break-words text-sm ${post.isDeleted ? "text-muted-foreground" : ""}`}
                  >
                    {post.content}
                  </p>
                  <MetaLine
                    items={[
                      post.categoryName,
                      `by ${authorLabel(post)}`,
                      `posted ${relative(post.createdAt)}`,
                      `updated ${relative(post.updatedAt)}`,
                    ]}
                  />
                </>
              }
            >
              <form action={updatePostAction} className="grid gap-3">
                <input name="id" type="hidden" value={post.id} />
                <input name="threadId" type="hidden" value={post.threadId} />
                <input name="slug" type="hidden" value={post.threadSlug} />
                <FieldLabel label={Noun}>
                  <textarea
                    className={textareaClass}
                    defaultValue={post.content}
                    name="content"
                    rows={4}
                  />
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-4">
                  <CheckboxField
                    defaultChecked={post.isDeleted}
                    label={`Hide this ${noun}`}
                    name="isDeleted"
                  />
                  <ActionSubmitButton
                    className="ml-auto"
                    size="sm"
                    successMessage={`${Noun} updated`}
                  >
                    Save changes
                  </ActionSubmitButton>
                </div>
              </form>
              <RowActions>
                <Button asChild className="cursor-pointer" size="sm" variant="outline">
                  <Link href={`/forum/${post.threadSlug}`}>View thread</Link>
                </Button>
                <AdminForumConfirmForm
                  action={deletePostAction}
                  confirmMessage={`Permanently delete this ${noun}?`}
                >
                  <input name="id" type="hidden" value={post.id} />
                  <input name="threadId" type="hidden" value={post.threadId} />
                  <input name="slug" type="hidden" value={post.threadSlug} />
                  <ActionSubmitButton
                    size="sm"
                    successMessage={`${Noun} deleted`}
                    variant="destructive"
                  >
                    Delete {noun}
                  </ActionSubmitButton>
                </AdminForumConfirmForm>
              </RowActions>
            </ExpandableRow>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

export function ForumCategoriesPanel({
  categories,
  confirmed,
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
}: {
  categories: ForumCategoryRow[];
  confirmed: boolean;
  createCategoryAction: FormAction;
  deleteCategoryAction: FormAction;
  updateCategoryAction: FormAction;
}) {
  return (
    <AdminPanel
      className="min-w-0"
      description="Order, describe, disable or remove forum categories."
      title="Categories"
    >
      <details className="group border-b">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium text-primary text-sm transition hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
          Add a category
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-open:rotate-180"
          />
        </summary>
        <form
          action={createCategoryAction}
          className="grid gap-3 border-t bg-muted/20 px-5 py-4 sm:grid-cols-2"
        >
          <FieldLabel label="Name">
            <input
              className={inputClass}
              name="name"
              placeholder="Product Help"
              required
            />
          </FieldLabel>
          <FieldLabel label="Slug (optional)">
            <input className={inputClass} name="slug" placeholder="product-help" />
          </FieldLabel>
          <FieldLabel className="sm:col-span-2" label="Description">
            <input
              className={inputClass}
              name="description"
              placeholder="Describe when users should use this category."
            />
          </FieldLabel>
          <FieldLabel label="Position">
            <input
              className={inputClass}
              defaultValue="0"
              min={0}
              name="position"
              type="number"
            />
          </FieldLabel>
          <div className="flex items-end">
            <CheckboxField
              defaultChecked={false}
              label="Disabled / locked"
              name="isLocked"
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <ActionSubmitButton size="sm" successMessage="Category created">
              Add category
            </ActionSubmitButton>
          </div>
        </form>
      </details>

      {!confirmed || categories.length === 0 ? (
        <UnavailableOrEmpty
          confirmed={confirmed}
          emptyTitle="No forum categories created yet"
          unavailableTitle="Unable to load forum categories"
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {categories.map((category) => {
            const threadCount = Number(category.threadCount);
            return (
              <ExpandableRow
                key={category.id}
                summary={
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium">
                        {category.name}
                      </span>
                      <AdminStatusPill tone={category.isLocked ? "warning" : "success"}>
                        {category.isLocked ? "Disabled" : "Active"}
                      </AdminStatusPill>
                    </div>
                    {category.description ? (
                      <p className="mt-0.5 line-clamp-1 text-muted-foreground text-sm">
                        {category.description}
                      </p>
                    ) : null}
                    <MetaLine
                      items={[
                        <span className="font-mono" key="slug">
                          {category.slug}
                        </span>,
                        `${integerFormatter.format(threadCount)} threads`,
                        `position ${category.position}`,
                      ]}
                    />
                  </>
                }
              >
                <form
                  action={updateCategoryAction}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <input name="id" type="hidden" value={category.id} />
                  <FieldLabel label="Name">
                    <input
                      className={inputClass}
                      defaultValue={category.name}
                      name="name"
                      required
                    />
                  </FieldLabel>
                  <FieldLabel label="Position">
                    <input
                      className={inputClass}
                      defaultValue={category.position}
                      name="position"
                      type="number"
                    />
                  </FieldLabel>
                  <FieldLabel className="sm:col-span-2" label="Description">
                    <input
                      className={inputClass}
                      defaultValue={category.description ?? ""}
                      name="description"
                    />
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                    <CheckboxField
                      defaultChecked={category.isLocked}
                      label="Disabled / locked"
                      name="isLocked"
                    />
                    <ActionSubmitButton
                      className="ml-auto"
                      size="sm"
                      successMessage="Category updated"
                    >
                      Save changes
                    </ActionSubmitButton>
                  </div>
                </form>
                <RowActions>
                  {threadCount > 0 ? (
                    <span className="mr-auto text-muted-foreground text-xs">
                      Move or delete its threads before deleting this category.
                    </span>
                  ) : null}
                  <AdminForumConfirmForm
                    action={deleteCategoryAction}
                    confirmMessage="Delete this category? This only works when it has no threads."
                  >
                    <input name="id" type="hidden" value={category.id} />
                    <ActionSubmitButton
                      disabled={threadCount > 0}
                      size="sm"
                      successMessage="Category deleted"
                      variant="destructive"
                    >
                      Delete category
                    </ActionSubmitButton>
                  </AdminForumConfirmForm>
                </RowActions>
              </ExpandableRow>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
