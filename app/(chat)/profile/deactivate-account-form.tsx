"use client";

import { useActionState, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { EditableTranslation } from "@/components/translation-edit-provider";
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
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
      ref={formRef}
    >
      <div className="min-w-0 space-y-1">
        <h3 className="font-medium text-sm">
          <EditableTranslation
            defaultText="Deactivate account"
            translationKey="profile.deactivate.title"
          />
        </h3>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="This process cannot be undone. You can contact support for any further assistance."
            translationKey="profile.deactivate.description"
          />
        </p>
        {state.status === "error" ? (
          <p aria-live="polite" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}
      </div>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogTrigger asChild>
          <button
            className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center rounded-lg bg-destructive px-4 font-medium text-destructive-foreground text-sm transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            disabled={isPending}
            onClick={() => setOpen(true)}
            type="button"
          >
            <EditableTranslation
              defaultText="Deactivate account"
              translationKey="profile.deactivate.button"
            />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <EditableTranslation
                defaultText="Are you sure?"
                translationKey="profile.deactivate.confirm_title"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <EditableTranslation
                defaultText="Your account will be disabled and you will be signed out."
                translationKey="profile.deactivate.confirm_description"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              <EditableTranslation
                defaultText="Cancel"
                translationKey="profile.deactivate.confirm_cancel"
              />
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
                    <EditableTranslation
                      defaultText="Deactivating..."
                      translationKey="profile.deactivate.confirm_action_pending"
                    />
                  </span>
                </span>
              ) : (
                <EditableTranslation
                  defaultText="Deactivate"
                  translationKey="profile.deactivate.confirm_action"
                />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
