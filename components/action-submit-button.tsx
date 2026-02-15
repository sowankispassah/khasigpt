"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
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

export function ActionSubmitButton(props: ActionSubmitButtonProps) {
  const {
    children,
    successMessage,
    pendingLabel = "Saving...",
    refreshOnSuccess = false,
    pendingTimeoutMs,
    className,
    disabled,
    ...buttonProps
  } = props;
  const { pending } = useFormStatus();
  const wasPendingRef = useRef(false);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!successMessage) {
      wasPendingRef.current = pending;
      return;
    }

    if (!pending && wasPendingRef.current) {
      toast({ type: "success", description: successMessage });
      if (refreshOnSuccess) {
        router.refresh();
      }
    }

    wasPendingRef.current = pending;
  }, [pending, successMessage, refreshOnSuccess, router]);

  useEffect(() => {
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    if (!pending || !pendingTimeoutMs || pendingTimeoutMs <= 0) {
      return;
    }

    pendingTimeoutRef.current = setTimeout(() => {
      router.refresh();
    }, pendingTimeoutMs);

    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [pending, pendingTimeoutMs, router]);

  return (
    <Button
      className={className}
      disabled={disabled || pending}
      type="submit"
      {...buttonProps}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>{pendingLabel}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
