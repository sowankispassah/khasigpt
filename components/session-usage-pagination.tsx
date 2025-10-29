"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

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
          Updating...
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          className="cursor-pointer text-muted-foreground underline-offset-4 transition hover:underline disabled:pointer-events-none disabled:opacity-50"
          disabled={!canGoBack || isPending}
          onClick={() => navigateToPage(sessionsPage - 1)}
          type="button"
        >
          View fewer sessions
        </button>

        <span className="text-muted-foreground text-xs">
          Page {sessionsPage} of {totalPages}
        </span>

        {canGoForward ? (
          <button
            className="cursor-pointer text-primary underline-offset-4 transition hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={isPending}
            onClick={() => navigateToPage(sessionsPage + 1)}
            type="button"
          >
            View more sessions
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">
            No more data
          </span>
        )}
      </div>
    </div>
  );
}
