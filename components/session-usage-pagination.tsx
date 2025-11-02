"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import { useTranslation } from "@/components/language-provider";

type SessionUsagePaginationProps = {
  range: number;
  sessionsPage: number;
  totalPages: number;
};

export function SessionUsagePagination({
  range,
  sessionsPage,
  totalPages,
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

  if (totalPages <= 1) {
    return null;
  }

  const canGoBack = sessionsPage > 1;
  const canGoForward = sessionsPage < totalPages;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm">
      {isPending ? (
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
          {translate("subscriptions.pagination.updating", "Updating...")}
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          className="cursor-pointer text-muted-foreground underline-offset-4 transition hover:underline disabled:pointer-events-none disabled:opacity-50"
          disabled={!canGoBack || isPending}
          onClick={() => navigateToPage(sessionsPage - 1)}
          type="button"
        >
          {translate("subscriptions.pagination.prev", "View fewer sessions")}
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
            {translate("subscriptions.pagination.next", "View more sessions")}
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">
            {translate("subscriptions.pagination.no_more", "No more data")}
          </span>
        )}
      </div>
    </div>
  );
}
