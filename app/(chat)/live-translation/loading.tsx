export default function LiveTranslationLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4">
      <div className="rounded-lg border bg-background p-5 shadow-sm">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="h-11 animate-pulse rounded bg-muted" />
          <div className="h-11 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
