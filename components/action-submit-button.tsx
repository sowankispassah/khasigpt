"use client";

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
} & ButtonProps;

export function ActionSubmitButton(props: ActionSubmitButtonProps) {
  const {
    children,
    successMessage,
    pendingLabel = "Saving...",
    className,
    disabled,
    ...buttonProps
  } = props;
  const { pending } = useFormStatus();
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (!successMessage) {
      wasPendingRef.current = pending;
      return;
    }

    if (!pending && wasPendingRef.current) {
      toast({ type: "success", description: successMessage });
    }

    wasPendingRef.current = pending;
  }, [pending, successMessage]);

  return (
    <Button
      className={className}
      disabled={disabled || pending}
      type="submit"
      {...buttonProps}
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin"><LoaderIcon size={16} /></span>
          <span>{pendingLabel}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
