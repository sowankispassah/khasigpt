import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { DeleteAccountRequestForm } from "./delete-account-request-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Delete Account",
  description:
    "Request deletion of your KhasiGPT account and associated account data.",
  alternates: {
    canonical: "/help/delete-account",
  },
};

const sectionClass = "space-y-3 rounded-lg border bg-card p-5 shadow-sm";

export default async function DeleteAccountPage() {
  const session = await auth();
  const fullName =
    [session?.user?.firstName, session?.user?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || session?.user?.name || "";
  const email = session?.user?.email ?? "";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-5 py-10 md:px-6 md:py-14">
      <div>
        <BackToHomeButton
          href="/"
          label="Back"
          translationKey="navigation.back"
        />
      </div>

      <header className="max-w-3xl space-y-3">
        <p className="font-medium text-primary text-sm">
          <EditableTranslation defaultText="KhasiGPT" translationKey="app.brand" />
        </p>
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
          <EditableTranslation
            defaultText="Delete Account"
            translationKey="delete_account.title"
          />
        </h1>
        <p className="text-muted-foreground leading-7">
          <EditableTranslation
            defaultText="Use this page to request deletion of your account and associated personal data. Signed-in requests are linked to your account immediately. Signed-out requests require email verification before review."
            translationKey="delete_account.intro"
          />
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <main className="space-y-5">
          <section className={sectionClass}>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="What happens when you request deletion"
                translationKey="delete_account.section.what_happens.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="We create a deletion request, verify account ownership, and review the request before removing account data. You will receive a reference ID that support can use to track the request."
                translationKey="delete_account.section.what_happens.body"
              />
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Data that will be deleted"
                translationKey="delete_account.section.deleted.title"
              />
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm leading-6">
              <li>
                <EditableTranslation
                  defaultText="Your account profile, name, avatar, location consent, and sign-in credentials are removed or anonymized."
                  translationKey="delete_account.section.deleted.profile"
                />
              </li>
              <li>
                <EditableTranslation
                  defaultText="Your chats, messages, uploaded documents, personal knowledge entries, usage records, and active subscriptions are removed where they are tied to your account."
                  translationKey="delete_account.section.deleted.content"
                />
              </li>
              <li>
                <EditableTranslation
                  defaultText="Forum posts and community content authored by you may be removed, hidden, or anonymized depending on thread integrity and moderation requirements."
                  translationKey="delete_account.section.deleted.community"
                />
              </li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Data that may be retained"
                translationKey="delete_account.section.retained.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="We may retain limited records required for legal, tax, fraud prevention, security, dispute resolution, payment reconciliation, and audit obligations. Retained records are limited to what is necessary and are handled under our privacy policy."
                translationKey="delete_account.section.retained.body"
              />
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Deletion processing timeline"
                translationKey="delete_account.section.timeline.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="We review verified requests as soon as possible and normally complete deletion within 30 days unless a longer retention period is legally required. Once completed, deletion is permanent and cannot be undone."
                translationKey="delete_account.section.timeline.body"
              />
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="font-semibold text-xl">
              <EditableTranslation
                defaultText="Contact support"
                translationKey="delete_account.section.support.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              <EditableTranslation
                defaultText="If you cannot access your account or need help with a deletion request, contact support and include your reference ID if you have one."
                translationKey="delete_account.section.support.body"
              />
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="cursor-pointer rounded-md border px-3 py-2 font-medium hover:bg-muted"
                data-nav
                href="/about#contact"
              >
                <EditableTranslation
                  defaultText="Contact support"
                  translationKey="delete_account.support.contact_link"
                />
              </Link>
              <Link
                className="cursor-pointer rounded-md border px-3 py-2 font-medium hover:bg-muted"
                data-nav
                href="/privacy-policy"
              >
                <EditableTranslation
                  defaultText="Privacy Policy"
                  translationKey="user_menu.resources.privacy"
                />
              </Link>
              <Link
                className="cursor-pointer rounded-md border px-3 py-2 font-medium hover:bg-muted"
                data-nav
                href="/terms-of-service"
              >
                <EditableTranslation
                  defaultText="Terms of Service"
                  translationKey="user_menu.resources.terms"
                />
              </Link>
            </div>
          </section>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <DeleteAccountRequestForm
            initialValues={{
              fullName,
              email,
              usernameOrUserId: session?.user?.id ?? "",
            }}
            isLoggedIn={Boolean(session?.user?.id)}
          />
        </aside>
      </div>
    </div>
  );
}
