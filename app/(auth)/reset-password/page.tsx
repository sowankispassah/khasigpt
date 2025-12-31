import { cookies } from "next/headers";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
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
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { dictionary } = await getTranslationBundle(preferredLanguage);
  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;
  const resolvedParams = searchParams ? await searchParams : undefined;
  const token = resolveToken(resolvedParams?.token);

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="font-semibold text-xl">
            {t("reset_password.invalid_title", "Invalid link")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "reset_password.invalid_message",
              "This password reset link is missing or malformed. Request a new link and try again."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="font-semibold text-xl">
            {t("reset_password.title", "Reset password")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "reset_password.subtitle",
              "Choose a new password for your account."
            )}
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
