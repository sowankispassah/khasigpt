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
import { useTranslation } from "@/components/language-provider";
import { LoaderIcon } from "@/components/icons";

const initialState: DeactivateAccountState = { status: "idle" };

export function DeactivateAccountForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    DeactivateAccountState,
    FormData
  >(deactivateAccountAction, initialState);
  const { translate } = useTranslation();

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 shadow-sm"
      ref={formRef}
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-destructive text-lg">
          {translate("profile.deactivate.title", "Deactivate account")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {translate(
            "profile.deactivate.description",
            "This process cannot be undone. You can contact support for any further assistance."
          )}
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
            {translate("profile.deactivate.button", "Deactivate account")}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {translate("profile.deactivate.confirm_title", "Are you sure?")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {translate(
                  "profile.deactivate.confirm_description",
                  "Your account will be disabled and you will be signed out."
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                {translate("profile.deactivate.confirm_cancel", "Cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
                disabled={isPending}
                onClick={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                    <span>
                      {translate(
                        "profile.deactivate.confirm_action_pending",
                        "Deactivating..."
                      )}
                    </span>
                  </span>
                ) : (
                  translate("profile.deactivate.confirm_action", "Deactivate")
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </form>
  );
}
