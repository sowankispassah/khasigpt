"use client";

import { type ReactNode, useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  doneGlobalProgress,
  startGlobalProgress,
} from "@/lib/ui/global-progress";
import {
  confirmEmailVerificationAction,
  type VerifyEmailActionState,
} from "./actions";

export type VerifyEmailResultStatus = Exclude<
  VerifyEmailActionState["status"],
  "idle" | "failed"
>;

export type VerifyEmailCopy = {
  title: string;
  message: string;
  variant: "success" | "error";
};

const initialState: VerifyEmailActionState = { status: "idle" };

export function VerifyEmailConfirm({
  children,
  confirm,
  results,
  token,
}: {
  children: ReactNode;
  confirm: {
    title: string;
    message: string;
    button: string;
    busy: string;
    failed: string;
  };
  results: Record<VerifyEmailResultStatus, VerifyEmailCopy>;
  token: string;
}) {
  const [state, formAction, isPending] = useActionState(
    confirmEmailVerificationAction,
    initialState
  );

  useEffect(() => {
    if (state.status !== "idle") {
      doneGlobalProgress();
    }
  }, [state]);

  if (state.status !== "idle" && state.status !== "failed") {
    const { title, message, variant } = results[state.status];
    return (
      <>
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p
          className={`text-sm ${variant === "success" ? "text-muted-foreground" : "text-destructive"}`}
        >
          {message}
        </p>
        {children}
      </>
    );
  }

  return (
    <>
      <h1 className="font-semibold text-2xl">{confirm.title}</h1>
      <p className="text-muted-foreground text-sm">{confirm.message}</p>
      <form
        action={formAction}
        className="flex flex-col items-center gap-2"
        onSubmit={startGlobalProgress}
      >
        <input name="token" type="hidden" value={token} />
        <Button
          aria-busy={isPending}
          className="cursor-pointer"
          disabled={isPending}
          type="submit"
        >
          {isPending ? confirm.busy : confirm.button}
        </Button>
        <p aria-live="polite" className="min-h-5 text-destructive text-sm">
          {state.status === "failed" && !isPending ? confirm.failed : null}
        </p>
      </form>
    </>
  );
}
