"use client";

import { Bookmark, Clock, Eye, MessageSquare } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, memo, useMemo } from "react";
import { useTranslation } from "@/components/language-provider";
import type { ForumThreadListItemPayload } from "@/lib/forum/types";
import { sanitizeText } from "@/lib/utils";

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
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.345_24, "weeks"],
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
  const excerpt = useMemo(() => sanitizeText(thread.excerpt), [thread.excerpt]);
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
      className="group hover:-translate-y-0.5 flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
      href={`/forum/${thread.slug}`}
      onClick={handleClick}
      prefetch
    >
      <div className="flex flex-wrap items-center gap-2 font-medium text-muted-foreground text-xs">
        <span className="rounded-full border border-primary/30 px-2 py-0.5 text-primary">
          {categoryLabel}
        </span>
        {thread.isPinned ? (
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700">
            {translate("forum.thread.pinned", "Pinned")}
          </span>
        ) : null}
        {thread.status === "resolved" ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600">
            {translate("forum.thread.resolved", "Resolved")}
          </span>
        ) : null}
        {thread.isLocked ? (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600">
            {translate("forum.thread.locked", "Locked")}
          </span>
        ) : null}
        {isSubscribed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600">
            <Bookmark className="h-3.5 w-3.5" />
            {translate("forum.thread.subscribed", "Subscribed")}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-foreground text-lg transition group-hover:text-primary">
          {thread.title}
        </h3>
        <p className="line-clamp-3 text-muted-foreground text-sm leading-snug">
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
            className="cursor-pointer rounded-full border border-border px-3 py-1 text-muted-foreground text-xs transition group-hover:border-primary/30 group-hover:bg-primary/5"
            key={tag.id}
          >
            #{tag.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
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
