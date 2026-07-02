"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export function AdminSectionError({
  error,
  reset,
  sectionName,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  sectionName: string;
}) {
  useEffect(() => {
    console.error(`[admin] ${sectionName} section failed.`, error);
  }, [error, sectionName]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="max-w-2xl space-y-3">
        <p className="font-semibold text-lg">
          Unable to load {sectionName.toLowerCase()}
        </p>
        <p className="text-muted-foreground text-sm">
          This admin section failed independently. The sidebar and other admin
          sections remain available.
        </p>
        <Button className="cursor-pointer" onClick={reset} type="button">
          Retry section
        </Button>
      </div>
    </section>
  );
}
