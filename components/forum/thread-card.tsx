"use client";

import Link from "next/link";
import { MessageSquare, Eye, Clock, Bookmark } from "lucide-react";
import { memo, useMemo, type MouseEvent } from "react";

import type { ForumThreadListItemPayload } from "@/lib/forum/types";
import { cn, sanitizeText } from "@/lib/utils";
import { useTranslation } from "@/components/language-provider";

type ThreadCardProps = {
  thread: ForumThreadListItemPayload;
  isSubscribed?: boolean;
  onNavigateStart?: () => void;
};

function formatRelativeTime(
  value: string | null,
  locale: string,
  fallback: string
) {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  const now = Date.now();
  const diff = date.getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"],
  ];

  let duration = Math.abs(diff / 1000);
  for (const [amount, unit] of divisions) {
    if (duration < amount) {
      return rtf.format(Math.round(diff / 1000 / (duration || 1)), unit);
    }
    duration /= amount;
  }
  return rtf.format(0, "seconds");
}

function ThreadCardComponent({
  thread,
  isSubscribed = false,
  onNavigateStart,
}: ThreadCardProps) {
  const { translate, activeLanguage } = useTranslation();
  const categoryLabel = useMemo(
    () =>
      translate(
        `forum.category.${thread.category.slug}.name`,
        thread.category.name
      ),
    [thread.category.slug, thread.category.name, translate]
  );
  const excerpt = useMemo(
    () => sanitizeText(thread.excerpt),
    [thread.excerpt]
  );
  const lastActivity = useMemo(() => {
    return formatRelativeTime(
      thread.lastRepliedAt ?? thread.updatedAt,
      activeLanguage.code,
      translate("forum.thread.relative.just_now", "just now")
    );
  }, [thread.lastRepliedAt, thread.updatedAt, activeLanguage.code, translate]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onNavigateStart ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    onNavigateStart();
  };

  return (
    <Link
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      href={`/forum/${thread.slug}`}
      onClick={handleClick}
      prefetch
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="rounded-full border border-primary/30 px-2 py-0.5 text-primary">
          {categoryLabel}
        </span>
        {thread.isPinned ? (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-amber-700 text-[11px]">
            {translate("forum.thread.pinned", "Pinned")}
          </span>
        ) : null}
        {thread.status === "resolved" ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 text-[11px]">
            {translate("forum.thread.resolved", "Resolved")}
          </span>
        ) : null}
        {thread.isLocked ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-600 text-[11px]">
            {translate("forum.thread.locked", "Locked")}
          </span>
        ) : null}
        {isSubscribed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-600 text-[11px]">
            <Bookmark className="h-3.5 w-3.5" />
            {translate("forum.thread.subscribed", "Subscribed")}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground transition group-hover:text-primary">
          {thread.title}
        </h3>
        <p className="text-muted-foreground text-sm leading-snug line-clamp-3">
          {excerpt.length > 0
            ? excerpt
            : translate(
                "forum.thread.no_excerpt",
                "This discussion does not include a preview yet."
              )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {thread.tags.map((tag) => (
          <span
            key={tag.id}
            className="cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition group-hover:border-primary/30 group-hover:bg-primary/5"
          >
            #{tag.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          {translate("forum.thread.meta.replies", "{count} replies").replace(
            "{count}",
            thread.totalReplies.toString()
          )}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Eye className="h-4 w-4" />
          {translate("forum.thread.meta.views", "{count} views").replace(
            "{count}",
            thread.viewCount.toString()
          )}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          {lastActivity}
        </div>
      </div>
    </Link>
  );
}

export const ThreadCard = memo(ThreadCardComponent);
