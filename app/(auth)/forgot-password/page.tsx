"use client";

import Link from "next/link";
import { useActionState } from "react";

import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  type ForgotPasswordState,
  requestPasswordResetAction,
} from "../password-reset/actions";

const initialState: ForgotPasswordState = { status: "idle" };

function ForgotPasswordForm() {
  const { translate } = useTranslation();
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">
          {translate("forgot_password.email_label", "Email address")}
        </Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          placeholder={translate(
            "forgot_password.email_placeholder",
            "you@example.com"
          )}
          required
          type="email"
        />
      </div>
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending
          ? translate("forgot_password.sending", "Sending...")
          : translate("forgot_password.submit", "Send reset link")}
      </Button>
      <div aria-live="polite" className="min-h-[1.25rem] text-sm">
        {state.status === "success" ? (
          <span className="text-emerald-600">{state.message}</span>
        ) : state.status === "error" ? (
          <span className="text-destructive">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

export default function ForgotPasswordPage() {
  const { translate } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="font-semibold text-xl">
            {translate("forgot_password.title", "Forgot password")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {translate(
              "forgot_password.subtitle",
              "Enter your email and we will send you a link to reset your password."
            )}
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-muted-foreground text-sm">
          {translate("forgot_password.remembered", "Remembered your password?")}{" "}
          <Link className="underline" href="/login">
            {translate("forgot_password.back_to_sign_in", "Back to sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
