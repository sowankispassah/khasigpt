"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

type ViewDetailsButtonProps = {
  href: string;
};

export function ViewDetailsButton({ href }: ViewDetailsButtonProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <Button
      className="w-full cursor-pointer sm:w-auto"
      disabled={isNavigating}
      onClick={() => {
        if (isNavigating) {
          return;
        }
        setIsNavigating(true);
        router.push(href);
      }}
      size="sm"
      type="button"
    >
      {isNavigating ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>Opening...</span>
        </span>
      ) : (
        "View Details"
      )}
    </Button>
  );
}

