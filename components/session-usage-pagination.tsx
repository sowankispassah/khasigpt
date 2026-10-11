"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
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

/** Replaces the subscriptions query string without scrolling or a full reload. */
function useSessionQueryNavigation(range: number) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const paramsSnapshot = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams]
  );

  const navigate = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const nextParams = new URLSearchParams(paramsSnapshot);
      nextParams.set("range", String(range));
      update(nextParams);
      const query = nextParams.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [paramsSnapshot, pathname, range, router]
  );

  return { isPending, navigate };
}

export function SessionUsageSortSelect({
  range,
  sessionSort,
}: {
  range: number;
  sessionSort: SessionSortOption;
}) {
  const { translate } = useTranslation();
  const { isPending, navigate } = useSessionQueryNavigation(range);

  const handleSortChange = useCallback(
    (nextSort: SessionSortOption) => {
      if (!SESSION_SORT_VALUES.includes(nextSort)) {
        return;
      }
      navigate((params) => {
        if (nextSort === SESSION_SORT_DEFAULT) {
          params.delete("sessionSort");
        } else {
          params.set("sessionSort", nextSort);
        }
        params.delete("sessionsPage");
      });
    },
    [navigate]
  );

  return (
    <div className="flex items-center gap-2">
      <label
        className="whitespace-nowrap font-medium text-muted-foreground text-xs"
        htmlFor="session-usage-sort"
      >
        <EditableTranslation
          defaultText="Sort sessions"
          translationKey="subscriptions.session_usage.sort.label"
        />
      </label>
      <select
        aria-busy={isPending}
        className="h-10 cursor-pointer rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
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
      {isPending ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}

export function SessionUsagePagination({
  range,
  sessionsPage,
  totalPages,
}: SessionUsagePaginationProps) {
  const { translate } = useTranslation();
  const { isPending, navigate } = useSessionQueryNavigation(range);

  const navigateToPage = useCallback(
    (nextPage: number) => {
      navigate((params) => {
        if (nextPage > 1) {
          params.set("sessionsPage", String(nextPage));
        } else {
          params.delete("sessionsPage");
        }
      });
    },
    [navigate]
  );

  const canGoBack = sessionsPage > 1;
  const canGoForward = sessionsPage < totalPages;

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm sm:px-6">
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        {isPending ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            {translate("subscriptions.pagination.updating", "Updating...")}
          </>
        ) : (
          <EditableTranslation
            defaultText="Page {current} of {total}"
            translationKey="subscriptions.pagination.page"
            values={{ current: sessionsPage, total: totalPages }}
          />
        )}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {canGoBack ? (
          <Button
            className="h-10 cursor-pointer"
            disabled={isPending}
            onClick={() => navigateToPage(sessionsPage - 1)}
            type="button"
            variant="ghost"
          >
            <EditableTranslation
              defaultText="View fewer sessions"
              translationKey="subscriptions.pagination.prev"
            />
          </Button>
        ) : null}
        {canGoForward ? (
          <Button
            className="h-10 cursor-pointer"
            disabled={isPending}
            onClick={() => navigateToPage(sessionsPage + 1)}
            type="button"
            variant="outline"
          >
            <EditableTranslation
              defaultText="View more sessions"
              translationKey="subscriptions.pagination.next"
            />
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="No more data"
              translationKey="subscriptions.pagination.no_more"
            />
          </span>
        )}
      </div>
    </div>
  );
}
