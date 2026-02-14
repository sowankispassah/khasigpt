export default function AdminLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
    >
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted/80" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-28 animate-pulse rounded-xl border bg-card" />
        <div className="h-28 animate-pulse rounded-xl border bg-card" />
        <div className="h-28 animate-pulse rounded-xl border bg-card" />
      </div>

      <div className="h-72 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
