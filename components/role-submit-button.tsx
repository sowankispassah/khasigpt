"use client";

import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RoleSubmitButtonProps = {
  disabled?: boolean;
  className?: string;
};

export function RoleSubmitButton({
  disabled = false,
  className,
}: RoleSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-live="polite"
      className={cn("min-w-[120px]", className)}
      disabled={disabled || pending}
      size="sm"
      type="submit"
      variant="outline"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={14} />
          </span>
          <span>Updating…</span>
        </span>
      ) : (
        "Update role"
      )}
    </Button>
  );
}
