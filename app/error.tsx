"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <section className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="font-semibold text-xl">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          The page could not be rendered. Retry once; if it keeps failing,
          return home and open the page again.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <a
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 font-medium text-sm"
            href="/"
          >
            Back to home
          </a>
        </div>
      </section>
    </main>
  );
}
