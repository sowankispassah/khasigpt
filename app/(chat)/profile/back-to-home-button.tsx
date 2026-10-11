"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EditableTranslation } from "@/components/translation-edit-provider";
import { cn } from "@/lib/utils";

type BackToHomeButtonProps = {
  label: string;
  className?: string;
  href?: string;
  translationKey?: string;
  /** "pill" is the compact style used on account pages. */
  variant?: "default" | "pill";
};

export function BackToHomeButton({
  label,
  className,
  href = "/",
  translationKey,
  variant = "default",
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
        variant === "pill"
          ? "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3.5 font-medium text-foreground/80 text-sm shadow-xs transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
          : "inline-flex cursor-pointer items-center gap-2 font-medium text-2xl text-primary transition-colors hover:text-primary/80",
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
      <span>
        {translationKey ? (
          <EditableTranslation defaultText={label} translationKey={translationKey} />
        ) : (
          label
        )}
      </span>
    </button>
  );
}
