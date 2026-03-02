"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a lightweight console signal for production debugging.
    console.error("[chat] route error", error);
  }, [error]);

  const message = error?.message ?? "Failed to load chat";
  const isTimeout = message === "timeout";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h2 className="font-semibold text-lg">
          {isTimeout ? "Chat is taking too long to load" : "Something went wrong"}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          {isTimeout
            ? "The server didn't respond in time. Retrying usually fixes this."
            : "Retry the page. If it keeps happening, reload to pick up the latest version."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
            onClick={() => reset()}
            type="button"
          >
            Retry
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

