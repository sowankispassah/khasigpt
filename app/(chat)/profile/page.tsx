import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/queries";
import { loadRootContext } from "../../root-context";
import { AvatarForm } from "./avatar-form";
import { BackToHomeButton } from "./back-to-home-button";
import { DeactivateAccountForm } from "./deactivate-account-form";
import { NameForm } from "./name-form";
import { PasswordForm } from "./password-form";

export default async function ProfilePage() {
  const { session, dictionary } = await loadRootContext();

  if (!session?.user) {
    redirect("/login");
  }

  const currentUser = await getUserById(session.user.id);

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div>
        <BackToHomeButton
          label={t("navigation.back_to_home", "Back to home")}
        />
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">
          {t("profile.title", "Profile")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t(
            "profile.subtitle",
            "Update your account information and security preferences."
          )}
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">
          {t("profile.picture.title", "Profile picture")}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
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
            initialFirstName={
              currentUser?.firstName ?? session.user.firstName ?? null
            }
            initialLastName={
              currentUser?.lastName ?? session.user.lastName ?? null
            }
          />
        </div>
        <div className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
          <div>
            <h2 className="font-semibold text-lg">
              {t("profile.account_email.title", "Account email")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(
                "profile.account_email.description",
                "To change your login email, please contact support."
              )}
            </p>
          </div>
          <div className="rounded-md border border-input border-dashed bg-background px-3 py-2 text-sm">
            {session.user.email}
          </div>
          <p className="text-muted-foreground text-sm">
            {t(
              "profile.account_email.link_prefix",
              "Want to review your plan or credits? Visit the"
            )}{" "}
            <Link
              className="font-semibold text-primary transition-colors hover:text-primary/80"
              href="/subscriptions"
            >
              {t("profile.account_email.link_text", "subscriptions dashboard")}
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
