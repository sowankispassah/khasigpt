"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";

import { type RegisterActionState, register } from "../actions";
import { GoogleSignInSection } from "../google-sign-in-button";
import { useAuthCallback } from "../use-auth-callback";

export default function Page() {
  const { callbackUrl } = useAuthCallback();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    {
      status: "idle",
    }
  );

  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "error", description: "Account already exists!" });
    } else if (state.status === "failed") {
      toast({ type: "error", description: "Failed to create account!" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    } else if (state.status === "verification_sent") {
      toast({
        type: "success",
        description: "Check your email to verify your account.",
      });
      setIsSuccessful(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    setIsSuccessful(false);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-12 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">Sign Up</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Create an account with your email and password
          </p>
        </div>
        <AuthForm
          action={handleSubmit}
          defaultEmail={email}
          lead={
            <GoogleSignInSection
              callbackUrl={callbackUrl}
              mode="register"
            />
          }
        >
          <SubmitButton isSuccessful={isSuccessful}>Sign Up</SubmitButton>
          {state.status === "verification_sent" ? (
            <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-center text-muted-foreground text-sm">
              {"We sent a verification email to "}
              <span className="font-semibold text-foreground">
                {email}
              </span>
              {". Follow the link to activate your account."}
            </p>
          ) : null}
          <p className="mt-4 text-center text-gray-600 text-sm dark:text-zinc-400">
            {"Already have an account? "}
            <Link
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
              href="/login"
            >
              Sign in
            </Link>
            {" instead."}
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
