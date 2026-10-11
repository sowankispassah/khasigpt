"use client";

import { useState } from "react";

type InlineExpandableRowsProps = {
  previewRows: React.ReactNode[];
  overflowRows: React.ReactNode[];
  colSpan: number;
};

export function InlineExpandableRows({
  previewRows,
  overflowRows,
  colSpan,
}: InlineExpandableRowsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {previewRows}
      {expanded ? overflowRows : null}
      {overflowRows.length > 0 ? (
        <tr className="border-t">
          <td className="py-3 text-center" colSpan={colSpan}>
            <button
              className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded
                ? "Show less"
                : `View more (${overflowRows.length})`}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
