"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Small "i" button that opens an explanation on click or tap. A tooltip
 * would only open on hover, which phones do not have.
 */
export function InfoPopover({
  children,
  label,
}: {
  children: ReactNode;
  /** Accessible name for the trigger, e.g. "How net profit splits". */
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={label}
      >
        <Info aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-3 text-sm"
        collisionPadding={16}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
