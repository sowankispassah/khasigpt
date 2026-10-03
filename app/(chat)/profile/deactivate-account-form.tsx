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
      className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 shadow-sm"
      ref={formRef}
    >
      <div className="space-y-1">
        <h2 className="font-semibold text-destructive text-lg">
          <EditableTranslation
            defaultText="Deactivate account"
            translationKey="profile.deactivate.title"
          />
        </h2>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="This process cannot be undone. You can contact support for any further assistance."
            translationKey="profile.deactivate.description"
          />
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
