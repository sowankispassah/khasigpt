"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type BackToHomeButtonProps = {
  label: string;
  className?: string;
  href?: string;
};

export function BackToHomeButton({
  label,
  className,
  href = "/",
}: BackToHomeButtonProps) {
  const pathname = usePathname();

  return (
    <Link
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 font-medium text-primary text-sm transition-colors hover:text-primary/80",
        className
      )}
      href={href}
      onClick={(event) => {
        if (pathname === href) {
          event.preventDefault();
        }
      }}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
