"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";

type ViewDetailsButtonProps = {
  href: string;
};

export function ViewDetailsButton({ href }: ViewDetailsButtonProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const prefetchDetailsRoute = () => {
    router.prefetch(href);
  };

  return (
    <Button
      asChild
      className={cn("w-full sm:w-auto", isNavigating && "pointer-events-none")}
      size="sm"
    >
      <Link
        aria-disabled={isNavigating}
        className={cn(
          "transition-opacity",
          isNavigating && "pointer-events-none opacity-90"
        )}
        data-disabled={isNavigating || undefined}
        data-nav
        href={href}
        onClick={(event) => {
          if (isNavigating) {
            event.preventDefault();
            return;
          }
          setIsNavigating(true);
          startGlobalProgress();
        }}
        onFocus={prefetchDetailsRoute}
        onMouseEnter={prefetchDetailsRoute}
        onTouchStart={prefetchDetailsRoute}
        prefetch
      >
        {isNavigating ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <span>Opening...</span>
          </span>
        ) : (
          "View details"
        )}
      </Link>
    </Button>
  );
}
