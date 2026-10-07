"use client";

import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it fails, so it must render its own
// <html> and <body> and cannot rely on providers from app/layout.tsx.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <main className="flex min-h-dvh items-center justify-center bg-background px-6">
          <section className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm">
            <h1 className="font-semibold text-xl">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground text-sm">
              KhasiGPT could not load. Retry once; if it keeps failing, wait a
              minute and reload the page.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
                onClick={reset}
                type="button"
              >
                Try again
              </button>
              {/* A full reload is intentional: the root layout itself failed. */}
              <a
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 font-medium text-sm"
                href="/"
              >
                Back to home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
