"use client";

import { cn } from "@/lib/utils";

export type AdminSectionIndexItem = { id: string; label: string };

/**
 * In-page jump list for long admin pages built from collapsible <details>
 * sections: opens the target section before scrolling to it. Buttons rather
 * than hash links, so the global navigation progress bar does not start for
 * an in-page jump that never changes the route.
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
  const jumpTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav
      aria-label={label}
      className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3", className)}
    >
      <p className="shrink-0 font-medium text-muted-foreground text-xs sm:pt-1.5">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className="inline-flex h-7 cursor-pointer items-center rounded-full border bg-card px-3 text-xs transition hover:border-primary/40 hover:bg-primary/5"
              onClick={() => jumpTo(item.id)}
              type="button"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
