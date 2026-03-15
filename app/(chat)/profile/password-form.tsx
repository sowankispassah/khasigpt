"use client";

import { useActionState, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { type UpdatePasswordState, updatePasswordAction } from "./actions";

const initialState: UpdatePasswordState = { status: "idle" };

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { translate } = useTranslation();

  const [state, formAction, isPending] = useActionState<
    UpdatePasswordState,
    FormData
  >(async (prev: UpdatePasswordState, formData: FormData) => {
    const result = await updatePasswordAction(prev, formData);

    if (result.status === "success") {
      setPassword("");
      setConfirmPassword("");
    }

    return result;
  }, initialState);

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border bg-card p-6 shadow-sm"
    >
      <div>
        <h2 className="font-semibold text-lg">
          {translate("profile.password.title", "Update password")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {translate(
            "profile.password.description",
            "Password must be at least 8 characters long."
          )}
        </p>
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="profile-password">
          {translate("profile.password.new_label", "New password")}
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <div className="space-y-2">
        <label
          className="font-medium text-sm"
          htmlFor="profile-password-confirm"
        >
          {translate("profile.password.confirm_label", "Confirm password")}
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password-confirm"
          minLength={8}
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
        <div aria-live="polite" className="min-h-[1.25rem] text-sm">
          {state.status === "error" ? (
            <span className="text-destructive">{state.message}</span>
          ) : state.status === "success" ? (
            <span className="text-emerald-600">
              {translate(
                "profile.password.success",
                "Password updated successfully."
              )}
            </span>
          ) : null}
        </div>
      </div>
      <button
        className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <span>{translate("profile.password.saving", "Saving...")}</span>
          </span>
        ) : (
          translate("profile.password.save_button", "Save password")
        )}
      </button>
    </form>
  );
}
