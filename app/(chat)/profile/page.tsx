import Link from "next/link";
import { redirect } from "next/navigation";

import { PageUserMenu } from "@/components/page-user-menu";
import { auth } from "@/app/(auth)/auth";
import { PasswordForm } from "./password-form";
import { AvatarForm } from "./avatar-form";
import { DeactivateAccountForm } from "./deactivate-account-form";
import { getUserById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const currentUser = await getUserById(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8">
      <PageUserMenu />
      <div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/"
        >
          ← Back to home
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Update your account information and security preferences.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Profile picture</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload an image to personalise your account. This picture appears in the chat header and menus.
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
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Account email</h2>
            <p className="text-muted-foreground text-sm">
              To change your login email, please contact support.
            </p>
          </div>
          <div className="rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm">
            {session.user.email}
          </div>
          <p className="text-muted-foreground text-sm">
            Want to review your plan or credits? Visit the{" "}
            <Link className="underline" href="/subscriptions">
              subscriptions dashboard
            </Link>
            .
          </p>
        </div>

        <PasswordForm />
      </section>

      <DeactivateAccountForm />
    </div>
  );
}
