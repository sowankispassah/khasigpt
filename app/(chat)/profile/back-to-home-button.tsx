"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbeddedNative = searchParams.get("embedded") === "native";

  if (isEmbeddedNative) {
    return null;
  }

  return (
    <button
      data-native-back-button="true"
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 font-medium text-2xl text-primary transition-colors hover:text-primary/80",
        className
      )}
      type="button"
      onClick={(event) => {
        if (pathname === href) {
          event.preventDefault();
          return;
        }
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(href);
      }}
    >
      <ArrowLeft aria-hidden="true" className="h-7 w-7" />
      <span>{label}</span>
    </button>
  );
}
