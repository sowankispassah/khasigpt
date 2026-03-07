"use client";

import { useState, type ReactNode } from "react";
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
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-max border-collapse whitespace-nowrap text-sm">
          <thead className="bg-muted/40">{header}</thead>
          <tbody>
            {initialRows}
            {showAll ? remainingRows : null}
          </tbody>
        </table>
      </div>

      {remainingCount > 0 ? (
        <div>
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

