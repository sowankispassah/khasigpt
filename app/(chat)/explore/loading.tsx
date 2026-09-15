export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
      <div className="h-9 w-64 animate-pulse rounded bg-muted" />
      <div className="h-5 w-full max-w-xl animate-pulse rounded bg-muted" />
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => <div className="h-28 animate-pulse rounded-xl bg-muted" key={item} />)}
      </div>
    </div>
  );
}
