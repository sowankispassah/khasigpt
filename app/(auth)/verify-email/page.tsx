import Link from "next/link";

import {
  type VerifyEmailResult,
  verifyUserEmailByToken,
} from "@/lib/db/queries";

type VerifyEmailSearchParams = {
  token?: string | string[];
};

function resolveToken(param: string | string[] | undefined) {
  if (!param) {
    return null;
  }
  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function getVerificationCopy(status: string) {
  switch (status) {
    case "verified":
      return {
        title: "Email verified",
        message:
          "Your account is now active. You can sign in using your email and password.",
        variant: "success",
      } as const;
    case "already_verified":
      return {
        title: "Email already verified",
        message: "You can sign in right away using your credentials.",
        variant: "success",
      } as const;
    case "expired":
      return {
        title: "Verification link expired",
        message:
          "The verification link has expired. Please retry signup to receive a new email.",
        variant: "error",
      } as const;
    default:
      return {
        title: "Invalid verification link",
        message:
          "The verification token is invalid or has already been used. Please request a new verification email.",
        variant: "error",
      } as const;
  }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: Promise<VerifyEmailSearchParams>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const token = resolveToken(resolvedParams?.token);
  let status: VerifyEmailResult["status"] = "not_found";

  if (token) {
    const verificationResult = await verifyUserEmailByToken(token);
    status = verificationResult.status;
  }

  const { title, message, variant } = getVerificationCopy(status);
  const isSuccess = variant === "success";

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p
          className={`text-sm ${isSuccess ? "text-muted-foreground" : "text-destructive"}`}
        >
          {message}
        </p>
        <div className="flex flex-col gap-2 text-muted-foreground text-sm">
          <p>Continue to sign in once your account is ready.</p>
          <div className="flex justify-center">
            <Link
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground transition hover:opacity-90"
              href="/login"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
