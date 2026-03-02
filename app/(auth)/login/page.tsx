"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useMemo, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { useTranslation } from "@/components/language-provider";
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
  const { translate } = useTranslation();
  const [email, setEmail] = useState("");
  const errorParam = searchParams?.get("error");
  const errorDescription = searchParams?.get("error_description");
  const hasInactiveParam =
    errorParam === "AccountInactive" || errorDescription === "AccountInactive";
  const hasLinkRequiredParam =
    errorParam === "AccountLinkRequired" ||
    errorDescription === "AccountLinkRequired";
  const [showEmailFields, setShowEmailFields] = useState(
    hasInactiveParam || hasLinkRequiredParam
  );
  const [isSuccessful, setIsSuccessful] = useState(false);
  type LoginErrorKey =
    | null
    | "invalid"
    | "invalid_data"
    | "inactive"
    | "link_required";
  const [errorKey, setErrorKey] = useState<LoginErrorKey>(
    hasInactiveParam
      ? "inactive"
      : hasLinkRequiredParam
        ? "link_required"
        : null
  );

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    {
      status: "idle",
    }
  );

  const { data: session, status, update: updateSession } = useSession();

  const errorMessages = useMemo(
    () => ({
      invalid: translate(
        "login.error.invalid_credentials",
        "Invalid credentials. Please try again."
      ),
      invalid_data: translate(
        "login.error.invalid_data",
        "Your submission was invalid. Please check the form and retry."
      ),
      inactive: translate(
        "login.error.inactive",
        "This account is inactive due to not verified or previous deleted. Please contact support."
      ),
      link_required: translate(
        "login.error.link_required",
        "Your email is already registered. Sign in with your password first, then link Google from account settings."
      ),
    }),
    [translate]
  );

  const errorMessage = errorKey ? errorMessages[errorKey] : null;

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      clearCallback();
      router.replace(callbackUrl);
      return;
    }
    if (state.status === "failed") {
      setShowEmailFields(true);
      setErrorKey("invalid");
    } else if (state.status === "invalid_data") {
      setShowEmailFields(true);
      setErrorKey("invalid_data");
    } else if (state.status === "inactive") {
      setShowEmailFields(true);
      setErrorKey("inactive");
    } else if (state.status === "success") {
      setIsSuccessful(true);
      setErrorKey(null);
      updateSession().finally(() => {
        clearCallback();
        router.replace(callbackUrl);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    callbackUrl,
    clearCallback,
    router,
    session?.user,
    state.status,
    status,
    updateSession,
  ]);

  useEffect(() => {
    if (hasInactiveParam) {
      setShowEmailFields(true);
      setErrorKey("inactive");
    } else if (hasLinkRequiredParam) {
      setShowEmailFields(true);
      setErrorKey("link_required");
    } else {
      return;
    }

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
  }, [hasInactiveParam, hasLinkRequiredParam, router]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    setShowEmailFields(true);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-muted-foreground text-sm">
            {translate(
              "auth.subtitle",
              "KhasiGPT is your smart AI assistant designed to understand and speak Khasi language."
            )}
          </h3>
          <Image
            alt="KhasiGPT logo"
            className="mt-4 h-7 w-auto dark:brightness-150 dark:invert"
            height={32}
            priority
            src="/images/khasigptlogo.png"
            width={160}
          />
          <h3 className="font-semibold text-xl dark:text-zinc-50">
            {translate("login.title", "Sign In To KhasiGPT")}
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
          emailButtonLabel={translate(
            "login.continue_with_email",
            "Continue with Email"
          )}
          lead={<GoogleSignInSection callbackUrl={callbackUrl} mode="login" />}
          onShowCredentials={() => setShowEmailFields(true)}
        >
          <div className="flex flex-col gap-1.5">
            <SubmitButton isSuccessful={isSuccessful}>
              {translate("login.cta", "Sign in")}
            </SubmitButton>
            <div className="text-right text-sm">
              <button
                className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => router.push("/forgot-password")}
                type="button"
              >
                {translate("login.forgot_password", "Forgot password?")}
              </button>
            </div>
          </div>
        </AuthForm>
        <p className="mt-4 px-4 text-center text-gray-600 text-sm sm:px-16 dark:text-zinc-400">
          {translate("login.signup_prompt_prefix", "Don't have an account?")}{" "}
          <Link
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            href="/register"
          >
            {translate("login.signup_prompt_link", "Sign up")}
          </Link>{" "}
          {translate("login.signup_prompt_suffix", "for free.")}
        </p>
      </div>
    </div>
  );
}
