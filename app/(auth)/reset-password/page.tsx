import { ResetPasswordForm } from "../password-reset/reset-password-form";

type ResetPasswordSearchParams = {
  token?: string | string[];
};

function resolveToken(param: string | string[] | undefined) {
  if (!param) {
    return null;
  }
  return Array.isArray(param) ? (param[0] ?? null) : param;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<ResetPasswordSearchParams>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const token = resolveToken(resolvedParams?.token);

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="font-semibold text-xl">Invalid link</h1>
          <p className="text-muted-foreground text-sm">
            This password reset link is missing or malformed. Request a new link
            and try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="font-semibold text-xl">Reset password</h1>
          <p className="text-muted-foreground text-sm">
            Choose a new password for your account.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
