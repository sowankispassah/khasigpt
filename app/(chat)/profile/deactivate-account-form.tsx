"use client";

import { useActionState, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type DeactivateAccountState,
  deactivateAccountAction,
} from "./actions";

const initialState: DeactivateAccountState = { status: "idle" };

export function DeactivateAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    DeactivateAccountState,
    FormData
  >(deactivateAccountAction, initialState);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 shadow-sm"
      ref={formRef}
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-destructive text-lg">
          Deactivate account
        </h2>
        <p className="text-muted-foreground text-sm">
          This process cannot be undone. Contact support for further assistance.
        </p>
      </div>

      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </div>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogTrigger asChild>
          <button
            className="inline-flex cursor-pointer items-center justify-center rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground text-sm hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isPending}
            onClick={() => setOpen(true)}
            type="button"
          >
            Deactivate account
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              {isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
