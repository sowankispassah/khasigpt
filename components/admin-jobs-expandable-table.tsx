"use client";

import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";

export function AdminJobsExpandableTable({
  header,
  initialRows,
  remainingRows,
  remainingCount,
}: {
  header: ReactNode;
  initialRows: ReactNode;
  remainingRows: ReactNode;
  remainingCount: number;
}) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
            {header}
          </thead>
          <tbody className="divide-y divide-border/60">
            {initialRows}
            {showAll ? remainingRows : null}
          </tbody>
        </table>
      </div>

      {remainingCount > 0 ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button
            className="h-8 cursor-pointer px-3 text-xs"
            onClick={() => setShowAll((current) => !current)}
            type="button"
            variant="outline"
          >
            {showAll ? "Show less" : `Show more (${remainingCount})`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
