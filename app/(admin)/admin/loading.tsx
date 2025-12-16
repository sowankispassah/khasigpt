export default function Loading() {
  const metricSkeletonKeys = [
    "users",
    "chats",
    "recent-users",
    "audit-events",
    "contact-requests",
  ] as const;
  const panelSkeletonKeys = ["left", "right"] as const;
  const rowSkeletonKeys = ["a", "b", "c", "d", "e", "f"] as const;

  return (
    <div className="animate-pulse space-y-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricSkeletonKeys.map((key) => (
          <div
            className="rounded-2xl border bg-card/60 p-4 shadow-sm"
            key={`metric-skeleton-${key}`}
          >
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-8 w-16 rounded bg-muted/80" />
            <div className="mt-3 h-3 w-28 rounded bg-muted" />
          </div>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        {panelSkeletonKeys.map((key) => (
          <div
            className="rounded-2xl border bg-card/60 p-6 shadow-sm"
            key={`panel-skeleton-${key}`}
          >
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="mt-4 space-y-3">
              {rowSkeletonKeys.map((rowKey) => (
                <div
                  className="h-10 w-full rounded bg-muted/70"
                  key={`row-skeleton-${rowKey}`}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
