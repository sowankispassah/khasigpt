import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/app/(auth)/auth";
import { PasswordForm } from "./password-form";
import { AvatarForm } from "./avatar-form";
import { NameForm } from "./name-form";
import { DeactivateAccountForm } from "./deactivate-account-form";
import { getUserById } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [{ languages: _languages, activeLanguage: _active, dictionary }, currentUser] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    getUserById(session.user.id),
  ]);

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t("navigation.back_to_home", "Back to home")}
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("profile.title", "Profile")}</h1>
        <p className="text-muted-foreground text-sm">
          {t(
            "profile.subtitle",
            "Update your account information and security preferences."
          )}
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          {t("profile.picture.title", "Profile picture")}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t(
            "profile.picture.description",
            "Upload an image to personalise your account. This picture appears in the chat header and menus."
          )}
        </p>
        <div className="mt-4">
          <AvatarForm
            initialImage={currentUser?.image ?? null}
            userEmail={session.user.email ?? null}
            userName={session.user.name ?? null}
          />
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <NameForm
            initialFirstName={currentUser?.firstName ?? session.user.firstName ?? null}
            initialLastName={currentUser?.lastName ?? session.user.lastName ?? null}
          />
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              {t("profile.account_email.title", "Account email")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(
                "profile.account_email.description",
                "To change your login email, please contact support."
              )}
            </p>
          </div>
          <div className="rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm">
            {session.user.email}
          </div>
          <p className="text-muted-foreground text-sm">
            {t(
              "profile.account_email.link_prefix",
              "Want to review your plan or credits? Visit the"
            )}{" "}
            <Link className="font-semibold text-primary transition-colors hover:text-primary/80" href="/subscriptions">
              {t(
                "profile.account_email.link_text",
                "subscriptions dashboard"
              )}
            </Link>
            {t("profile.account_email.link_suffix", ".")}
          </p>
        </div>

        <PasswordForm />
      </section>

      <DeactivateAccountForm />
    </div>
  );
}
