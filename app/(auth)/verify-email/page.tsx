import { cookies } from "next/headers";
import Link from "next/link";

import { getAuthFallbackTranslationBundle } from "@/lib/i18n/auth-fallback-bundle";
import {
  VerifyEmailConfirm,
  type VerifyEmailCopy,
  type VerifyEmailResultStatus,
} from "./verify-email-confirm";

type VerifyEmailSearchParams = {
  token?: string | string[];
};

function resolveToken(param: string | string[] | undefined) {
  if (!param) {
    return null;
  }
  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function getVerificationCopy(
  status: string,
  t: (key: string, fallback: string) => string
) {
  switch (status) {
    case "verified":
      return {
        title: t("verify_email.title.verified", "Email verified"),
        message: t(
          "verify_email.message.verified",
          "Your account is now active. You can sign in using your email and password."
        ),
        variant: "success",
      } as const;
    case "already_verified":
      return {
        title: t(
          "verify_email.title.already_verified",
          "Email already verified"
        ),
        message: t(
          "verify_email.message.already_verified",
          "You can sign in right away using your credentials."
        ),
        variant: "success",
      } as const;
    case "expired":
      return {
        title: t(
          "verify_email.title.expired",
          "Verification link expired"
        ),
        message: t(
          "verify_email.message.expired",
          "The verification link has expired. Please retry signup to receive a new email."
        ),
        variant: "error",
      } as const;
    default:
      return {
        title: t("verify_email.title.invalid", "Invalid verification link"),
        message: t(
          "verify_email.message.invalid",
          "The verification token is invalid or has already been used. Please request a new verification email."
        ),
        variant: "error",
      } as const;
  }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<VerifyEmailSearchParams>;
}) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { dictionary } = getAuthFallbackTranslationBundle(preferredLanguage);
  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;
  const resolvedParams = searchParams ? await searchParams : undefined;
  const token = resolveToken(resolvedParams?.token);
  const footer = (
    <div className="flex flex-col gap-2 text-muted-foreground text-sm">
      <p>
        {t(
          "verify_email.continue_prompt",
          "Continue to sign in once your account is ready."
        )}
      </p>
      <div className="flex justify-center">
        <Link
          className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground transition hover:opacity-90"
          href="/login"
        >
          {t("verify_email.sign_in_button", "Go to sign in")}
        </Link>
      </div>
    </div>
  );

  if (!token) {
    const { title, message } = getVerificationCopy("not_found", t);
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background px-4">
        <div className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="font-semibold text-2xl">{title}</h1>
          <p className="text-destructive text-sm">{message}</p>
          {footer}
        </div>
      </div>
    );
  }

  // Never verify while rendering: mail link scanners prefetch GET URLs. The
  // mailbox owner confirms with an explicit POST from this button instead.
  const results: Record<VerifyEmailResultStatus, VerifyEmailCopy> = {
    verified: getVerificationCopy("verified", t),
    already_verified: getVerificationCopy("already_verified", t),
    expired: getVerificationCopy("expired", t),
    not_found: getVerificationCopy("not_found", t),
  };

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <VerifyEmailConfirm
          confirm={{
            title: t("verify_email.title.pending", "Verify Email Address"),
            message: t(
              "verify_email.confirm.message",
              "Press the button below to verify your email and activate your account. If you didn't sign up, you can close this page."
            ),
            button: t("verify_email.confirm.button", "Verify email"),
            busy: t("verify_email.confirm.pending", "Verifying..."),
            failed: t(
              "verify_email.confirm.failed",
              "We couldn't verify your email right now. Please try again in a few minutes."
            ),
          }}
          results={results}
          token={token}
        >
          {footer}
        </VerifyEmailConfirm>
      </div>
    </div>
  );
}
