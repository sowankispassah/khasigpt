import { cn } from "@/lib/utils";

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
      <div className="space-y-2">
        <div className={cn("h-8 animate-pulse rounded bg-muted", titleWidth)} />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/70" />
      </div>

      {summaryCards > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: summaryCards }, (_, index) => (
            <div
              className="h-24 animate-pulse rounded-xl border bg-card"
              key={`summary-${index + 1}`}
            />
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-4">
          <div className="h-5 w-40 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: rows }, (_, index) => (
            <div
              className="h-12 animate-pulse rounded-lg bg-muted/50"
              key={`row-${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
