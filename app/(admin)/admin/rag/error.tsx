"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="font-semibold text-lg">Unable to load RAG dashboard</h2>
      <p className="text-muted-foreground text-sm">
        Something went wrong while loading this page.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button className="cursor-pointer" onClick={reset} type="button">
          Retry
        </Button>
        <Button asChild className="cursor-pointer" variant="secondary">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>
    </div>
  );
}

