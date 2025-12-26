"use client";

import {
  ArrowLeft,
  Bell,
  BellOff,
  Clock,
  EllipsisVertical,
  Eye,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OfficialBadge } from "@/components/forum/official-badge";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useForumActions } from "@/hooks/use-forum-actions";
import type { ForumPostReactionType } from "@/lib/db/schema";
import type {
  ForumPostListItemPayload,
  ForumThreadDetailPayload,
  ForumThreadListItemPayload,
  ForumUserSummary,
} from "@/lib/forum/types";
import { formatForumUserName } from "@/lib/forum/utils";
import { cn, sanitizeText } from "@/lib/utils";

type ThreadDetailClientProps = {
  initialDetail: ForumThreadDetailPayload;
  viewer: {
    id: string | null;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: "admin" | "regular" | null;
    imageVersion: string | null;
  };
};

type ReplyComposerProps = {
  disabled: boolean;
  isSubmitting: boolean;
  onSubmit: (content: string) => Promise<void>;
  viewerName: string | null;
  strings: {
    placeholderSignedIn: string;
    placeholderSignedOut: string;
    submit: string;
    submitPending: string;
    errorTooShort: string;
  };
};

function ReplyComposer({
  disabled,
  isSubmitting,
  onSubmit,
  viewerName,
  strings,
}: ReplyComposerProps) {
  const [value, setValue] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const normalized = value.trim();
    if (normalized.length < 8) {
      toast.error(strings.errorTooShort);
      return;
    }
    await onSubmit(normalized);
    setValue("");
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Textarea
        className="min-h-[140px] resize-none"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder={
          viewerName
            ? strings.placeholderSignedIn.replace(
                "{name}",
                (viewerName.split(" ")[0] ?? "").trim()
              )
            : strings.placeholderSignedOut
        }
        value={value}
      />
      <div className="flex justify-end">
        <Button
          className="cursor-pointer"
          disabled={disabled || isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderIcon className="animate-spin" size={16} />
              {strings.submitPending}
            </span>
          ) : (
            <span>{strings.submit}</span>
          )}
        </Button>
      </div>
    </form>
  );
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelative(value: string, locale: string) {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diff = new Date(value).getTime() - Date.now();
  const minutes = diff / 1000 / 60;
  if (Math.abs(minutes) < 60) {
    return formatter.format(Math.round(minutes), "minutes");
  }
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) {
    return formatter.format(Math.round(hours), "hours");
  }
  const days = hours / 24;
  return formatter.format(Math.round(days), "days");
}

function initialsFromUser(user: ForumUserSummary) {
  const base =
    user.displayName || user.firstName || user.lastName || user.email || "F";
  const letters = base
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "F";
}

const PARAGRAPH_SPLIT_REGEX = /\n{2,}/;

function renderPostContent(content: string, fallback: string) {
  const sanitized = sanitizeText(content);
  const paragraphs = sanitized.split(PARAGRAPH_SPLIT_REGEX).filter(Boolean);
  if (paragraphs.length === 0) {
    return <p className="text-muted-foreground text-sm">{fallback}</p>;
  }
  return paragraphs.map((paragraph, index) => (
    <p
      className="text-foreground text-sm leading-6"
      key={`${paragraph.slice(0, 32)}-${index}`}
    >
      {paragraph}
    </p>
  ));
}

export function ThreadDetailClient({
  initialDetail,
  viewer,
}: ThreadDetailClientProps) {
  const router = useRouter();
  const { translate, activeLanguage } = useTranslation();
  const [thread, setThread] = useState<ForumThreadListItemPayload>(
    initialDetail.thread
  );
  const [posts, setPosts] = useState<ForumPostListItemPayload[]>(
    initialDetail.posts
  );
  const [viewerReactions, setViewerReactions] = useState<
    Record<string, ForumPostReactionType[]>
  >(initialDetail.viewerReactions);
  const [isSubscribed, setIsSubscribed] = useState(initialDetail.isSubscribed);
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [isBackNavigating, setIsBackNavigating] = useState(false);
  const {
    createReply,
    isCreatingReply,
    toggleSubscription,
    isUpdatingSubscription,
    toggleReaction,
    busyPostIds,
    recordView,
    updateThreadStatus,
    deleteThread,
    isUpdatingThreadStatus,
    isDeletingThread,
  } = useForumActions();

  useEffect(() => {
    recordView(thread.slug).catch(() => {
      // best-effort
    });
  }, [recordView, thread.slug]);

  useEffect(() => {
    if (!viewer.id) {
      setViewerAvatarUrl(null);
      return;
    }
    let isMounted = true;
    const loadAvatar = async () => {
      try {
        const response = await fetch("/api/profile/avatar", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data: { image?: string | null } = await response.json();
        if (isMounted) {
          setViewerAvatarUrl(data.image ?? null);
        }
      } catch {
        // ignore
      }
    };
    loadAvatar();
    return () => {
      isMounted = false;
    };
  }, [viewer.id]);

  const handleSubscribe = async () => {
    if (!viewer.id) {
      router.push("/login?redirect=/forum");
      return;
    }
    try {
      await toggleSubscription(thread.slug, !isSubscribed);
      setIsSubscribed((prev) => !prev);
    } catch (error) {
      console.error(error);
      toast.error("Unable to update subscription right now.");
    }
  };

  const handleReplySubmit = async (content: string) => {
    if (!viewer.id) {
      router.push("/login?redirect=/forum");
      return;
    }
    try {
      const result = await createReply(thread.slug, { content });
      const viewerRole = viewer.role ?? null;
      const isAdmin = (viewerRole ?? "").toLowerCase() === "admin";
      const authorSummary: ForumUserSummary = {
        id: viewer.id,
        firstName: viewer.firstName,
        lastName: viewer.lastName,
        email: viewer.email,
        role: viewerRole,
        isAdmin,
        avatarUrl: viewerAvatarUrl,
        displayName: formatForumUserName(
          viewer.firstName,
          viewer.lastName,
          viewer.email
        ),
      };
      const timestamp = new Date().toISOString();
      const newPost: ForumPostListItemPayload = {
        id: result.id,
        threadId: result.threadId,
        author: authorSummary,
        content,
        isEdited: false,
        isDeleted: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        parentPostId: null,
        reactions: {
          like: 0,
          insightful: 0,
          support: 0,
        },
      };
      setPosts((prev) => [...prev, newPost]);
      setThread((prev) => ({
        ...prev,
        totalReplies: prev.totalReplies + 1,
        lastRepliedAt: timestamp,
        lastResponder: authorSummary,
      }));
      toast.success(
        translate("forum.thread.toast.reply_posted", "Reply posted!")
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleReactionToggle = async (
    postId: string,
    type: ForumPostReactionType
  ) => {
    if (!viewer.id) {
      router.push("/login?redirect=/forum");
      return;
    }
    try {
      const result = await toggleReaction({ postId, type });
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) {
            return post;
          }
          const nextCount = Math.max(
            0,
            post.reactions[type] + (result.active ? 1 : -1)
          );
          return {
            ...post,
            reactions: {
              ...post.reactions,
              [type]: nextCount,
            },
          };
        })
      );
      setViewerReactions((prev) => {
        const existing = new Set(prev[postId] ?? []);
        if (result.active) {
          existing.add(type);
        } else {
          existing.delete(type);
        }
        return {
          ...prev,
          [postId]: Array.from(existing),
        };
      });
    } catch (error) {
      console.error(error);
      toast.error(
        translate(
          "forum.thread.toast.reaction_error",
          "Unable to update reaction."
        )
      );
    }
  };

  const viewerName =
    viewer.name ??
    formatForumUserName(viewer.firstName, viewer.lastName, viewer.email);
  const translatedCategoryName = useMemo(
    () =>
      translate(
        `forum.category.${thread.category.slug}.name`,
        thread.category.name
      ),
    [thread.category.slug, thread.category.name, translate]
  );
  const officialLabel = translate("forum.badge.official", "Official");
  const backToForumLabel = translate(
    "forum.thread.back_to_forum",
    "Back to forum"
  );
  const viewerIsAdmin = (viewer.role ?? "").toLowerCase() === "admin";
  const canManageThread = viewerIsAdmin || viewer.id === thread.author.id;
  const actionErrorMessage = translate(
    "forum.thread.toast.action_error",
    "Unable to update the thread. Please try again."
  );
  const reactionKeys: ForumPostReactionType[] = [
    "like",
    "insightful",
    "support",
  ];
  const initialPost = posts[0] ?? null;
  const replyPosts = posts.slice(1);
  const initialPostUserReactions = initialPost
    ? new Set(viewerReactions[initialPost.id] ?? [])
    : null;
  const initialPostIsBusy = initialPost
    ? busyPostIds.has(initialPost.id)
    : false;
  const postNoContentCopy = translate(
    "forum.thread.post.no_content",
    "This post does not include any content."
  );
  const noRepliesCopy = translate(
    "forum.thread.replies.empty",
    "No replies yet. Be the first to respond."
  );

  const handleResolveThread = async () => {
    try {
      await updateThreadStatus(thread.slug, "resolve");
      setThread((prev) => ({ ...prev, status: "resolved" }));
      toast.success(
        translate(
          "forum.thread.toast.resolve_success",
          "Thread marked as solved."
        )
      );
    } catch (error) {
      console.error(error);
      toast.error(actionErrorMessage);
    }
  };

  const handleReopenThread = async () => {
    try {
      await updateThreadStatus(thread.slug, "reopen");
      setThread((prev) => ({ ...prev, status: "open" }));
      toast.success(
        translate("forum.thread.toast.reopen_success", "Thread reopened.")
      );
    } catch (error) {
      console.error(error);
      toast.error(actionErrorMessage);
    }
  };

  const handleDeleteThread = async () => {
    const confirmed = window.confirm(
      translate(
        "forum.thread.actions.delete_confirm",
        "Are you sure you want to delete this thread? This action cannot be undone."
      )
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteThread(thread.slug);
      toast.success(
        translate("forum.thread.toast.delete_success", "Thread deleted.")
      );
      router.push("/forum");
    } catch (error) {
      console.error(error);
      toast.error(actionErrorMessage);
    }
  };

  const handleBackToForum = async () => {
    if (isBackNavigating) {
      return;
    }
    setIsBackNavigating(true);
    try {
      await router.push("/forum");
    } catch {
      setIsBackNavigating(false);
      toast.error(
        translate(
          "forum.thread.toast.action_error",
          "Unable to update the thread. Please try again."
        )
      );
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <Button
          className="cursor-pointer gap-2 px-0 text-muted-foreground text-sm hover:text-foreground"
          disabled={isBackNavigating}
          onClick={handleBackToForum}
          size="sm"
          variant="ghost"
        >
          {isBackNavigating ? (
            <span className="inline-flex items-center gap-2">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              {translate("forum.thread.action.updating", "Updating…")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {backToForumLabel}
            </span>
          )}
        </Button>
      </div>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
              <Avatar className="h-8 w-8">
                {thread.author.avatarUrl ? (
                  <AvatarImage
                    alt={thread.author.displayName}
                    src={thread.author.avatarUrl}
                  />
                ) : null}
                <AvatarFallback className="text-[11px]">
                  {initialsFromUser(thread.author)}
                </AvatarFallback>
              </Avatar>
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                {thread.author.displayName}
                {thread.author.isAdmin ? (
                  <OfficialBadge size="sm" srLabel={officialLabel} />
                ) : null}
              </span>
              <span className="rounded-full border border-primary/30 px-2 py-0.5 font-semibold text-primary text-xs uppercase tracking-widest">
                {translatedCategoryName}
              </span>
            </div>
            <h1 className="mt-2 font-semibold text-3xl">{thread.title}</h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {translate("forum.thread.meta.started", "Started {date}").replace(
                "{date}",
                formatDate(thread.createdAt, activeLanguage.code)
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {thread.tags.map((tag) => (
                <Link
                  className="cursor-pointer rounded-full border border-border px-3 py-1 text-muted-foreground text-xs transition hover:border-primary/30 hover:bg-primary/5"
                  href={`/forum?tag=${tag.slug}`}
                  key={tag.id}
                >
                  #{tag.label}
                </Link>
              ))}
            </div>
            {initialPost ? (
              <div className="mt-6 space-y-4">
                <div className="space-y-3">
                  {renderPostContent(initialPost.content, postNoContentCopy)}
                </div>
                <div className="flex flex-wrap gap-2 pt-2 text-xs">
                  {reactionKeys.map((reaction) => (
                    <button
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 transition",
                        initialPostUserReactions?.has(reaction)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5",
                        initialPostIsBusy && "opacity-70"
                      )}
                      disabled={initialPostIsBusy}
                      key={`initial-${reaction}`}
                      onClick={() =>
                        initialPost &&
                        handleReactionToggle(initialPost.id, reaction)
                      }
                      type="button"
                    >
                      {reaction === "like"
                        ? translate("forum.thread.reaction.like", "Helpful")
                        : reaction === "insightful"
                          ? translate(
                              "forum.thread.reaction.insightful",
                              "Insightful"
                            )
                          : translate(
                              "forum.thread.reaction.support",
                              "Support"
                            )}
                      ({initialPost.reactions[reaction]})
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="cursor-pointer"
              disabled={isUpdatingSubscription}
              onClick={handleSubscribe}
              variant={isSubscribed ? "secondary" : "default"}
            >
              {isUpdatingSubscription ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderIcon className="animate-spin" size={16} />
                  {translate("forum.thread.action.updating", "Updating…")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {isSubscribed ? (
                    <>
                      <BellOff className="h-4 w-4" />
                      {translate("forum.thread.action.unfollow", "Unfollow")}
                    </>
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      {translate("forum.thread.action.follow", "Follow")}
                    </>
                  )}
                </span>
              )}
            </Button>
            {canManageThread ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={translate(
                      "forum.thread.actions.menu",
                      "Thread actions"
                    )}
                    disabled={isUpdatingThreadStatus || isDeletingThread}
                    size="icon"
                    variant="ghost"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {thread.status !== "resolved" ? (
                    <DropdownMenuItem
                      disabled={isUpdatingThreadStatus}
                      onSelect={async (event) => {
                        event.preventDefault();
                        await handleResolveThread();
                      }}
                    >
                      {translate(
                        "forum.thread.actions.resolve",
                        "Mark as solved"
                      )}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={isUpdatingThreadStatus}
                      onSelect={(event) => {
                        event.preventDefault();
                        handleReopenThread();
                      }}
                    >
                      {translate(
                        "forum.thread.actions.reopen",
                        "Reopen discussion"
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    disabled={isDeletingThread}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleDeleteThread();
                    }}
                  >
                    {translate("forum.thread.actions.delete", "Delete thread")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {translate("forum.thread.meta.replies", "{count} replies").replace(
              "{count}",
              thread.totalReplies.toString()
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-4 w-4" />
            {translate("forum.thread.meta.views", "{count} views").replace(
              "{count}",
              thread.viewCount.toString()
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {translate(
              "forum.thread.meta.updated",
              "Updated {timestamp}"
            ).replace(
              "{timestamp}",
              formatRelative(
                thread.lastRepliedAt ?? thread.updatedAt,
                activeLanguage.code
              )
            )}
          </span>
        </div>
      </section>

      <section className="space-y-4">
        {replyPosts.length === 0 ? (
          <div className="rounded-2xl border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
            {noRepliesCopy}
          </div>
        ) : (
          replyPosts.map((post) => {
            const userReactions = new Set(viewerReactions[post.id] ?? []);
            const isBusy = busyPostIds.has(post.id);
            return (
              <article
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                key={post.id}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    {post.author.avatarUrl ? (
                      <AvatarImage
                        alt={post.author.displayName}
                        src={post.author.avatarUrl}
                      />
                    ) : null}
                    <AvatarFallback>
                      {initialsFromUser(post.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {post.author.displayName}
                        {post.author.isAdmin ? (
                          <OfficialBadge size="sm" srLabel={officialLabel} />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatRelative(post.createdAt, activeLanguage.code)}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {renderPostContent(post.content, postNoContentCopy)}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-3 text-xs">
                      {reactionKeys.map((reaction) => (
                        <button
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 transition",
                            userReactions.has(reaction)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5",
                            isBusy && "opacity-70"
                          )}
                          disabled={isBusy}
                          key={`${post.id}-${reaction}`}
                          onClick={() =>
                            handleReactionToggle(post.id, reaction)
                          }
                          type="button"
                        >
                          {reaction === "like"
                            ? translate("forum.thread.reaction.like", "Helpful")
                            : reaction === "insightful"
                              ? translate(
                                  "forum.thread.reaction.insightful",
                                  "Insightful"
                                )
                              : translate(
                                  "forum.thread.reaction.support",
                                  "Support"
                                )}
                          ({post.reactions[reaction]})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold text-lg">
          {translate("forum.thread.section.add_reply", "Add a reply")}
        </h2>
        <ReplyComposer
          disabled={!viewer.id}
          isSubmitting={isCreatingReply}
          onSubmit={handleReplySubmit}
          strings={{
            placeholderSignedIn: translate(
              "forum.thread.reply.placeholder_signed_in",
              "Share your insights, {name}…"
            ),
            placeholderSignedOut: translate(
              "forum.thread.reply.placeholder_signed_out",
              "Sign in to join the conversation."
            ),
            submit: translate("forum.thread.reply.submit", "Post reply"),
            submitPending: translate(
              "forum.thread.reply.submit_pending",
              "Posting…"
            ),
            errorTooShort: translate(
              "forum.thread.reply.error_too_short",
              "Replies should be at least 8 characters."
            ),
          }}
          viewerName={viewerName}
        />
      </section>
    </div>
  );
}
