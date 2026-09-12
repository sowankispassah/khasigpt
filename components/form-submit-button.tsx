"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  pendingTimeoutMs?: number;
  timeoutLabel?: React.ReactNode;
};

const DEFAULT_PENDING_TIMEOUT_MS = 30_000;

export function FormSubmitButton({
  children,
  pendingLabel = "Submitting...",
  className,
  variant = "default",
  size = "default",
  disabled = false,
  pendingTimeoutMs = DEFAULT_PENDING_TIMEOUT_MS,
  timeoutLabel = "Check status",
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    if (!pending || !pendingTimeoutMs || pendingTimeoutMs <= 0) {
      if (!pending) {
        setHasTimedOut(false);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      setHasTimedOut(true);
      console.warn(
        `[form-submit-button] Form action still pending after ${pendingTimeoutMs}ms.`
      );
      toast({
        type: "error",
        description:
          "This action is taking longer than expected. Check the latest status before retrying.",
      });
    }, pendingTimeoutMs);

    return () => clearTimeout(timeoutId);
  }, [pending, pendingTimeoutMs]);

  const isBusy = (pending && !hasTimedOut) || isRefreshing;
  const checkAfterTimeout = pending && hasTimedOut && !isRefreshing;
  const busyLabel = isRefreshing ? "Refreshing..." : pendingLabel;

  return (
    <Button
      aria-live="polite"
      className={cn("min-w-[120px] cursor-pointer", className)}
      disabled={disabled || isBusy}
      onClick={
        checkAfterTimeout
          ? (event) => {
              event.preventDefault();
              startTransition(() => {
                router.refresh();
              });
            }
          : undefined
      }
      size={size}
      type={checkAfterTimeout ? "button" : "submit"}
      variant={variant}
    >
      {isBusy ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={14} />
          </span>
          <span>{busyLabel}</span>
        </span>
      ) : checkAfterTimeout ? (
        timeoutLabel
      ) : (
        children
      )}
    </Button>
  );
}
