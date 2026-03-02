"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { useTranslation } from "@/components/language-provider";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";

import { type RegisterActionState, register } from "../actions";
import { GoogleSignInSection } from "../google-sign-in-button";
import { AuthCallbackProvider, useAuthCallback } from "../use-auth-callback";

export default function Page() {
  return (
    <AuthCallbackProvider>
      <RegisterContent />
    </AuthCallbackProvider>
  );
}

function RegisterContent() {
  const { callbackUrl } = useAuthCallback();
  const { translate } = useTranslation();
  const [email, setEmail] = useState("");
  const [showEmailFields, setShowEmailFields] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<RegisterActionState, FormData>(
    register,
    {
      status: "idle",
    }
  );

  useEffect(() => {
    if (state.status === "user_exists") {
      setShowEmailFields(true);
      toast({
        type: "error",
        description: translate(
          "register.error.account_exists",
          "Account already exists!"
        ),
      });
    } else if (state.status === "failed") {
      setShowEmailFields(true);
      toast({
        type: "error",
        description: translate(
          "register.error.failed",
          "Failed to create account!"
        ),
      });
    } else if (state.status === "invalid_data") {
      setShowEmailFields(true);
      toast({
        type: "error",
        description: translate(
          "register.error.invalid_data",
          "Failed validating your submission!"
        ),
      });
    } else if (state.status === "terms_unaccepted") {
      setShowEmailFields(true);
      toast({
        type: "error",
        description: translate(
          "register.error.terms_unaccepted",
          "You must accept the Terms of Service and Privacy Policy to continue."
        ),
      });
    } else if (state.status === "rate_limited") {
      setShowEmailFields(true);
      toast({
        type: "error",
        description: translate(
          "register.error.rate_limited",
          "Too many sign-up attempts. Please try again later."
        ),
      });
    } else if (state.status === "verification_sent") {
      setShowEmailFields(true);
      toast({
        type: "success",
        description: translate(
          "register.success.verification_confirmation",
          "Check your email to verify your account."
        ),
      });
      setIsSuccessful(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, translate]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    setShowEmailFields(true);
    setIsSuccessful(false);
    formAction(formData);
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <p className="text-muted-foreground text-sm">
            {translate(
              "auth.subtitle",
              "KhasiGPT is your smart AI assistant designed to understand and speak Khasi language."
            )}
          </p>
          <Image
            alt="KhasiGPT logo"
            className="mt-4 h-7 w-auto dark:brightness-150 dark:invert"
            height={32}
            priority
            src="/images/khasigptlogo.png"
            width={160}
          />
          <h3 className="font-semibold text-xl dark:text-zinc-50">
            {translate("register.title", "Sign Up To KhasiGPT")}
          </h3>
        </div>
        <AuthForm
          action={handleSubmit}
          credentialsVisible={showEmailFields}
          defaultEmail={email}
          emailButtonLabel={translate(
            "register.continue_with_email",
            "Sign up with Email"
          )}
          lead={
            <GoogleSignInSection callbackUrl={callbackUrl} mode="register" />
          }
          onShowCredentials={() => setShowEmailFields(true)}
        >
          <div className="flex items-start gap-3 rounded-md border border-input bg-muted/40 px-3 py-3 text-muted-foreground text-sm dark:bg-muted/60">
            <input
              className="mt-1 h-4 w-4 shrink-0 rounded border border-input"
              id="acceptTerms"
              name="acceptTerms"
              required
              type="checkbox"
            />
            <label className="space-y-1" htmlFor="acceptTerms">
              <span className="font-medium text-foreground">
                {translate("register.terms_statement_prefix", "I agree to the")}{" "}
                <Link
                  className="text-primary underline"
                  href="/terms-of-service"
                >
                  {translate("register.terms_terms", "Terms of Service")}
                </Link>{" "}
                {translate("register.terms_statement_and", "and")}{" "}
                <Link className="text-primary underline" href="/privacy-policy">
                  {translate("register.terms_privacy", "Privacy Policy")}
                </Link>
                {translate("register.terms_statement_suffix", ".")}
              </span>
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <SubmitButton isSuccessful={isSuccessful}>
              {translate("register.cta", "Sign Up")}
            </SubmitButton>
            {state.status === "verification_sent" ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-center text-muted-foreground text-sm">
                {translate(
                  "register.success.verification_sent",
                  "We sent a verification email to {email}. Follow the link to activate your account."
                ).replace("{email}", email)}
              </p>
            ) : null}
          </div>
        </AuthForm>
        <p className="mt-4 px-4 text-center text-gray-600 text-sm sm:px-16 dark:text-zinc-400">
          {translate(
            "register.login_prompt_prefix",
            "Already have an account?"
          )}{" "}
          <Link
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            href="/login"
          >
            {translate("register.login_prompt_link", "Sign in")}
          </Link>{" "}
          {translate("register.login_prompt_suffix", "instead.")}
        </p>
      </div>
    </div>
  );
}
