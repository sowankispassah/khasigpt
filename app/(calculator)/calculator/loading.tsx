function CalculatorLoadingSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-background px-2 py-1.5">
        <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </header>
      <div className="mx-auto flex h-[100svh] w-full max-w-5xl flex-col overflow-hidden px-3 py-3 sm:h-auto sm:overflow-visible sm:px-4 sm:py-5 md:py-8">
        <div className="min-h-0 flex-1 rounded-3xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex h-full w-full flex-col gap-3 sm:gap-4">
          <div className="min-h-[clamp(11rem,25dvh,16rem)] rounded-2xl bg-muted/40 p-4">
            <div className="ml-auto h-10 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-3 ml-auto h-10 w-56 animate-pulse rounded bg-muted/80" />
            <div className="mt-16 ml-auto h-8 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
            {Array.from({ length: 20 }).map((_, index) => (
              <div
                className="aspect-[10/9] animate-pulse rounded-full bg-muted"
                key={`calculator-loading-key-${index}`}
              />
            ))}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

export default function Loading() {
  return <CalculatorLoadingSkeleton />;
}
