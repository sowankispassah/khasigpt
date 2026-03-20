"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { useTranslation } from "@/components/language-provider";
import {
  SESSION_SORT_DEFAULT,
  SESSION_SORT_VALUES,
  type SessionSortOption,
} from "@/lib/subscriptions/session-sort";

type SessionUsagePaginationProps = {
  range: number;
  sessionsPage: number;
  totalPages: number;
  sessionSort: SessionSortOption;
};

const sortOptions = [
  {
    value: "latest" as SessionSortOption,
    labelKey: "subscriptions.session_usage.sort.latest",
    fallback: "Latest activity",
  },
  {
    value: "usage" as SessionSortOption,
    labelKey: "subscriptions.session_usage.sort.usage",
    fallback: "Highest credits used",
  },
];

export function SessionUsagePagination({
  range,
  sessionsPage,
  totalPages,
  sessionSort,
}: SessionUsagePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { translate } = useTranslation();

  const paramsSnapshot = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  const handleSortChange = useCallback(
    (nextSort: SessionSortOption) => {
      if (!SESSION_SORT_VALUES.includes(nextSort)) {
        return;
      }

      const nextParams = new URLSearchParams(paramsSnapshot);
      nextParams.set("range", String(range));

      if (nextSort === SESSION_SORT_DEFAULT) {
        nextParams.delete("sessionSort");
      } else {
        nextParams.set("sessionSort", nextSort);
      }

      nextParams.delete("sessionsPage");

      const query = nextParams.toString();

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [paramsSnapshot, pathname, range, router]
  );

  const navigateToPage = useCallback(
    (nextPage: number) => {
      const nextParams = new URLSearchParams(paramsSnapshot);
      nextParams.set("range", String(range));

      if (nextPage > 1) {
        nextParams.set("sessionsPage", String(nextPage));
      } else {
        nextParams.delete("sessionsPage");
      }

      const query = nextParams.toString();

      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [paramsSnapshot, pathname, range, router]
  );

  const canGoBack = sessionsPage > 1;
  const canGoForward = sessionsPage < totalPages;
  const showPagination = totalPages > 1;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <label
          className="text-muted-foreground text-xs uppercase"
          htmlFor="session-usage-sort"
        >
          {translate("subscriptions.session_usage.sort.label", "Sort sessions")}
        </label>
        <select
          className="cursor-pointer rounded-md border bg-background px-3 py-1 text-sm"
          id="session-usage-sort"
          onChange={(event) =>
            handleSortChange(event.target.value as SessionSortOption)
          }
          value={sessionSort}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {translate(option.labelKey, option.fallback)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {isPending ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
            {translate("subscriptions.pagination.updating", "Updating...")}
          </span>
        ) : null}

        {showPagination ? (
          <div className="flex items-center gap-2">
            <button
              className="cursor-pointer text-muted-foreground underline-offset-4 transition hover:underline disabled:pointer-events-none disabled:opacity-50"
              disabled={!canGoBack || isPending}
              onClick={() => navigateToPage(sessionsPage - 1)}
              type="button"
            >
              {translate(
                "subscriptions.pagination.prev",
                "View fewer sessions"
              )}
            </button>

            <span className="text-muted-foreground text-xs">
              {translate(
                "subscriptions.pagination.page",
                "Page {current} of {total}"
              )
                .replace("{current}", String(sessionsPage))
                .replace("{total}", String(totalPages))}
            </span>

            {canGoForward ? (
              <button
                className="cursor-pointer text-primary underline-offset-4 transition hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={isPending}
                onClick={() => navigateToPage(sessionsPage + 1)}
                type="button"
              >
                {translate(
                  "subscriptions.pagination.next",
                  "View more sessions"
                )}
              </button>
            ) : (
              <span className="text-muted-foreground text-xs">
                {translate("subscriptions.pagination.no_more", "No more data")}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
