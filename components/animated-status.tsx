"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AnimatedStatus({
  ariaLabel,
  className,
  label,
  testId,
}: {
  ariaLabel: string;
  className?: string;
  label: ReactNode;
  testId?: string;
}) {
  return (
    <output
      aria-label={ariaLabel}
      aria-live="polite"
      className={cn(
        "inline-flex items-baseline text-muted-foreground text-sm",
        className
      )}
      data-testid={testId}
    >
      <span aria-hidden="true" className="inline-flex items-baseline">
        {label}
        <span className="status-ellipsis" data-testid="animated-ellipsis">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </span>
    </output>
  );
}
