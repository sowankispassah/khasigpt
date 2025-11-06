import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { auth } from "../auth";
import { CompleteProfileForm } from "./complete-profile-form";

export default async function CompleteProfilePage() {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);

  if (!session?.user) {
    redirect("/login");
  }

  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { dictionary } = await getTranslationBundle(preferredLanguage);

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  const hasCompletedProfile =
    Boolean(session.user.dateOfBirth) &&
    Boolean(session.user.firstName) &&
    Boolean(session.user.lastName);

  if (hasCompletedProfile) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">
            {t("complete_profile.heading", "Almost there!")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "complete_profile.subheading",
              "Please confirm your name and date of birth. We can only offer access to people who are at least 13 years old."
            )}
          </p>
        </div>
        <CompleteProfileForm
          defaultDateOfBirth={session.user.dateOfBirth ?? null}
          defaultFirstName={session.user.firstName ?? null}
          defaultLastName={session.user.lastName ?? null}
        />
      </div>
    </div>
  );
}
