"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { SubmitButton } from "@/components/submit-button";

import { type LoginActionState, login } from "../actions";
import { GoogleSignInSection } from "../google-sign-in-button";
import { AuthCallbackProvider, useAuthCallback } from "../use-auth-callback";

export default function Page() {
  return (
    <AuthCallbackProvider>
      <LoginContent />
    </AuthCallbackProvider>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { callbackUrl, clearCallback } = useAuthCallback();
  const [email, setEmail] = useState("");
  const inactiveAccountMessage =
    searchParams?.get("error") === "AccountInactive" ||
    searchParams?.get("error_description") === "AccountInactive"
      ? "This account is inactive due to not verified or previous deleted. Please contact support."
      : null;
  const [showEmailFields, setShowEmailFields] = useState(
    inactiveAccountMessage !== null
  );
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    inactiveAccountMessage
  );

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    }
  );

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (state.status === "failed") {
      setShowEmailFields(true);
      setErrorMessage("Invalid credentials. Please try again.");
    } else if (state.status === "invalid_data") {
      setShowEmailFields(true);
      setErrorMessage(
        "Your submission was invalid. Please check the form and retry."
      );
    } else if (state.status === "inactive") {
      setShowEmailFields(true);
      setErrorMessage(
        "This account is inactive due to not verified or previous deleted. Please contact support."
      );
    } else if (state.status === "success") {
      setIsSuccessful(true);
      setErrorMessage(null);
      void updateSession().finally(() => {
        clearCallback();
        router.replace(callbackUrl);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, callbackUrl, clearCallback]);

  useEffect(() => {
    const errorParam = searchParams?.get("error");
    const errorDescription = searchParams?.get("error_description");
    if (
      errorParam === "AccountInactive" ||
      errorDescription === "AccountInactive"
    ) {
      setShowEmailFields(true);
      setErrorMessage(
        "This account is inactive due to not verified or previous deleted. Please contact support."
      );
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        url.searchParams.delete("error_description");
        router.replace(
          url.pathname +
            (url.searchParams.toString().length > 0
              ? `?${url.searchParams.toString()}`
              : "") +
            url.hash
        );
      }
    }
  }, [router, searchParams]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    setShowEmailFields(true);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-12 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h2>
            KhasiGPT is your smart AI assistant designed to understand and speak
            Khasi language.
          </h2>
          <br />
          <h3 className="font-semibold text-xl dark:text-zinc-50">
            Sign In To KhasiGPT
          </h3>
          {errorMessage ? (
            <div
              className="mt-3 w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-destructive text-sm"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}
        </div>
        <AuthForm
          action={handleSubmit}
          credentialsVisible={showEmailFields}
          defaultEmail={email}
          lead={<GoogleSignInSection callbackUrl={callbackUrl} mode="login" />}
          onShowCredentials={() => setShowEmailFields(true)}
        >
          <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
          <div className="mt-2 text-right text-sm">
            <button
              className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => router.push("/forgot-password")}
              type="button"
            >
              Forgot password?
            </button>
          </div>
        </AuthForm>
        <p className="mt-4 px-4 text-center text-gray-600 text-sm sm:px-16 dark:text-zinc-400">
          {"Don't have an account? "}
          <Link
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            href="/register"
          >
            Sign up
          </Link>
          {" for free."}
        </p>
      </div>
    </div>
  );
}
