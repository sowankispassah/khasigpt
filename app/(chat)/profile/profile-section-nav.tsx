"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ProfileSectionNavItem = {
  id: string;
  label: ReactNode;
};

/**
 * Desktop section index. Uses buttons with scrollIntoView rather than #hash
 * links, which would start the global progress bar without a navigation.
 */
export function ProfileSectionNav({ items }: { items: ProfileSectionNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );
    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="hidden lg:sticky lg:top-6 lg:block">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              aria-current={activeId === item.id ? "true" : undefined}
              className={cn(
                "w-full cursor-pointer rounded-lg px-3 py-2 text-left font-medium text-sm transition-colors",
                activeId === item.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => {
                setActiveId(item.id);
                document
                  .getElementById(item.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
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
