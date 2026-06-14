"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { LoaderIcon } from "@/components/icons";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "./toast";

type ActionSubmitButtonProps = {
  children: ReactNode;
  successMessage?: string;
  pendingLabel?: string;
  refreshOnSuccess?: boolean;
  pendingTimeoutMs?: number;
} & ButtonProps;

const DEFAULT_PENDING_TIMEOUT_MS = 30_000;

export function ActionSubmitButton(props: ActionSubmitButtonProps) {
  const {
    children,
    successMessage,
    pendingLabel = "Saving...",
    refreshOnSuccess = false,
    pendingTimeoutMs = DEFAULT_PENDING_TIMEOUT_MS,
    className,
    disabled,
    ...buttonProps
  } = props;
  const { pending } = useFormStatus();
  const [isRefreshing, startTransition] = useTransition();
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const wasPendingRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!successMessage) {
      wasPendingRef.current = pending;
      return;
    }

    if (!pending && wasPendingRef.current) {
      setHasTimedOut(false);
      toast({ type: "success", description: successMessage });
      if (refreshOnSuccess) {
        startTransition(() => {
          router.refresh();
        });
      }
    }

    wasPendingRef.current = pending;
  }, [pending, successMessage, refreshOnSuccess, router]);

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
        `[action-submit-button] Form action still pending after ${pendingTimeoutMs}ms.`
      );
      toast({
        type: "error",
        description:
          "This action is taking longer than expected. The page is still usable; check the latest status before retrying.",
      });
    }, pendingTimeoutMs);

    return () => clearTimeout(timeoutId);
  }, [pending, pendingTimeoutMs]);

  const isBusy = (pending && !hasTimedOut) || isRefreshing;
  const retryAfterTimeout = pending && hasTimedOut && !isRefreshing;
  const busyLabel = isRefreshing ? "Refreshing..." : pendingLabel;
  const buttonType = retryAfterTimeout ? "button" : (buttonProps.type ?? "submit");

  return (
    <Button
      {...buttonProps}
      className={className}
      disabled={disabled || isBusy}
      onClick={
        retryAfterTimeout
          ? (event) => {
              event.preventDefault();
              startTransition(() => {
                router.refresh();
              });
            }
          : buttonProps.onClick
      }
      type={buttonType}
    >
      {isBusy ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>{busyLabel}</span>
        </span>
      ) : retryAfterTimeout ? (
        <span>Check status</span>
      ) : (
        children
      )}
    </Button>
  );
}
