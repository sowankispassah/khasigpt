'use client';

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  type ForgotPasswordState,
  requestPasswordResetAction,
} from "../password-reset/actions";

const initialState: ForgotPasswordState = { status: "idle" };

function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState
  );

  return (
    <form className="space-y-4" action={formAction}>
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>
      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Send reset link"}
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
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">Forgot password</h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and we will send you a link to reset your password.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="text-center text-muted-foreground text-sm">
          Remembered your password? {" "}
          <Link className="underline" href="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
