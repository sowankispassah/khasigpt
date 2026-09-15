"use client";

import { useState } from "react";

type ExpandableCardListProps = {
  previewItems: React.ReactNode[];
  overflowItems: React.ReactNode[];
};

export function ExpandableCardList({
  previewItems,
  overflowItems,
}: ExpandableCardListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      {previewItems}
      {expanded ? overflowItems : null}
      {overflowItems.length > 0 ? (
        <button
          className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : `View more (${overflowItems.length})`}
        </button>
      ) : null}
    </div>
  );
}
