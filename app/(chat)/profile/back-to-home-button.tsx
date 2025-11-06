"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type BackToHomeButtonProps = {
  label: string;
  className?: string;
};

export function BackToHomeButton({ label, className }: BackToHomeButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 cursor-pointer",
        isPending && "opacity-75",
        className,
      )}
      onClick={() => {
        if (isPending) {
          return;
        }

        startTransition(() => {
          router.push("/");
        });
      }}
      aria-busy={isPending}
      aria-disabled={isPending}
    >
      {isPending ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      )}
      <span>{label}</span>
    </button>
  );
}
