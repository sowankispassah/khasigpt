"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  type ResetPasswordState,
  resetPasswordAction,
} from "./actions";

const initialState: ResetPasswordState = { status: "idle" };

export function ResetPasswordForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState
  );

  const isSuccess = state.status === "success";
  const isDisabled = isPending || isSuccess;

  if (isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          {state.message}
        </div>
        <Button asChild className="w-full" variant="secondary">
          <Link href="/login">Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={formAction}>
      <input name="token" type="hidden" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={8}
          name="password"
          placeholder="Enter a strong password"
          required
          type={showPassword ? "text" : "password"}
          disabled={isDisabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          autoComplete="new-password"
          id="confirmPassword"
          minLength={8}
          name="confirmPassword"
          placeholder="Re-enter your password"
          required
          type={showPassword ? "text" : "password"}
          disabled={isDisabled}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input
            checked={showPassword}
            className="h-4 w-4 rounded border-input"
            onChange={(event) => setShowPassword(event.target.checked)}
            type="checkbox"
            disabled={isDisabled}
          />
          <span className="text-muted-foreground">Show password</span>
        </label>
        <Link className="text-sm text-muted-foreground underline" href="/login">
          Back to sign in
        </Link>
      </div>
      <Button className="w-full" disabled={isDisabled} type="submit">
        {isPending ? "Updating..." : "Update password"}
      </Button>
      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
