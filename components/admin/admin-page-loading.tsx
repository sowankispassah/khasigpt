import { cn } from "@/lib/utils";

/** Route-level skeleton shaped like AdminPageHeader + stat cards + a panel. */
export function AdminPageLoading({
  titleWidth = "w-56",
  summaryCards = 0,
  rows = 6,
}: {
  titleWidth?: string;
  summaryCards?: number;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="hidden size-10 shrink-0 animate-pulse rounded-xl bg-muted sm:block" />
        <div className="space-y-2">
          <div className={cn("h-7 animate-pulse rounded-md bg-muted", titleWidth)} />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/70" />
        </div>
      </div>

      {summaryCards > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: summaryCards }, (_, index) => (
            <div
              className="h-[7.5rem] animate-pulse rounded-xl border bg-card"
              key={`summary-${index + 1}`}
            />
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <div className="h-5 w-40 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }, (_, index) => (
            <div className="flex items-center gap-3 px-5 py-3" key={`row-${index + 1}`}>
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted/60" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted/50" />
              <div className="hidden h-4 w-24 animate-pulse rounded bg-muted/40 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
