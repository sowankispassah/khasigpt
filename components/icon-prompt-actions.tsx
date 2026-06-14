"use client";

import Image from "next/image";
import { memo } from "react";
import type { IconPromptAction } from "@/lib/icon-prompts";
import { cn } from "@/lib/utils";

type IconPromptActionsProps = {
  items: IconPromptAction[];
  onSelect: (item: IconPromptAction) => void;
  className?: string;
};

function initialFromLabel(label: string) {
  const trimmed = label.trim();
  return trimmed ? trimmed[0]?.toUpperCase() ?? "" : "";
}

function isValidIconUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function PureIconPromptActions({
  items,
  onSelect,
  className,
}: IconPromptActionsProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 sm:gap-3",
        className
      )}
      data-testid="icon-prompt-actions"
    >
      {items.map((item) => (
        <button
          className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs transition duration-200 hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          key={item.id}
          onClick={() => onSelect(item)}
          type="button"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            {isValidIconUrl(item.iconUrl) ? (
              <Image
                alt=""
                className="h-4 w-4 object-contain"
                height={16}
                src={item.iconUrl}
                width={16}
              />
            ) : (
              <span className="text-[10px] font-semibold">
                {initialFromLabel(item.label)}
              </span>
            )}
          </span>
          <span className="whitespace-nowrap">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export const IconPromptActions = memo(PureIconPromptActions);
