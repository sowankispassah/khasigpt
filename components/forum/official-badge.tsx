"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

type OfficialBadgeProps = {
  srLabel?: string;
  className?: string;
  size?: "sm" | "md";
};

export function OfficialBadge({
  srLabel = "Official account",
  className,
  size = "md",
}: OfficialBadgeProps) {
  const dimension = size === "sm" ? 14 : 20;

  return (
    <span className={cn("inline-flex items-center justify-center", className)} title={srLabel}>
      <Image
        alt={srLabel}
        className="rounded-full"
        height={dimension}
        src="/images/khasigptlogo.png"
        width={dimension}
      />
      <span className="sr-only">{srLabel}</span>
    </span>
  );
}
