"use client";

import { useActionState, useState } from "react";

import {
  type UpdatePasswordState,
  updatePasswordAction,
} from "./actions";

const initialState: UpdatePasswordState = { status: "idle" };

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      className="rounded-lg border bg-card p-6 shadow-sm space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold">Update password</h2>
        <p className="text-muted-foreground text-sm">
          Password must be at least 8 characters long.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="profile-password">
          New password
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password"
          minLength={8}
          name="password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label
          className="text-sm font-medium"
          htmlFor="profile-password-confirm"
        >
          Confirm password
        </label>
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          id="profile-password-confirm"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <div aria-live="polite" className="min-h-[1.25rem] text-sm">
          {state.status === "error" ? (
            <span className="text-destructive">{state.message}</span>
          ) : state.status === "success" ? (
            <span className="text-emerald-600">
              Password updated successfully.
            </span>
          ) : null}
        </div>
      </div>
      <button
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
