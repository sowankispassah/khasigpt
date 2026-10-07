"use client";

import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

export type AdminSectionIndexItem = { id: string; label: string };

/**
 * In-page jump list for long admin pages built from collapsible <details>
 * sections: opens the target section before scrolling to it.
 */
export function AdminSectionIndex({
  className,
  items,
  label = "On this page",
}: {
  className?: string;
  items: AdminSectionIndexItem[];
  label?: string;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    event.preventDefault();
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav aria-label={label} className={cn("flex flex-col gap-2", className)}>
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className="inline-flex h-7 cursor-pointer items-center rounded-full border bg-card px-3 text-xs transition hover:border-primary/40 hover:bg-primary/5"
              href={`#${item.id}`}
              onClick={(event) => handleClick(event, item.id)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
