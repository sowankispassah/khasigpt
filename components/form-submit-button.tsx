"use client";

import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
};

export function FormSubmitButton({
  children,
  pendingLabel = "Submitting…",
  className,
  variant = "default",
  size = "default",
  disabled = false,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-live="polite"
      className={cn("min-w-[120px]", className)}
      disabled={disabled || pending}
      size={size}
      type="submit"
      variant={variant}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={14} />
          </span>
          <span>{pendingLabel}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

