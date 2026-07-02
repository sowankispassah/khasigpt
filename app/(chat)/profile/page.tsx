import { getDownloadUrl } from "@vercel/blob";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { getActiveUserProfileImage, getUserById } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { listPersonalKnowledgeForUser } from "@/lib/rag/service";
import { AvatarForm } from "./avatar-form";
import { BackToHomeButton } from "./back-to-home-button";
import { DeactivateAccountForm } from "./deactivate-account-form";
import { LocationSection } from "./location-section";
import { NameForm } from "./name-form";
import { PasswordForm } from "./password-form";
import {
  PersonalKnowledgeSection,
  type SerializedPersonalKnowledgeEntry,
} from "./personal-knowledge-section";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [
    { languages: _languages, activeLanguage: _active },
    currentUser,
    activeProfileImage,
  ] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    getUserById(session.user.id),
    getActiveUserProfileImage({ userId: session.user.id }),
  ]);

  const allowPersonalKnowledge = Boolean(
    currentUser?.allowPersonalKnowledge ?? session.user.allowPersonalKnowledge
  );
  const personalKnowledgeEntries: SerializedPersonalKnowledgeEntry[] =
    allowPersonalKnowledge
      ? (await listPersonalKnowledgeForUser(session.user.id)).map((entry) => ({
          ...entry,
          createdAt:
            entry.createdAt instanceof Date
              ? entry.createdAt.toISOString()
              : (entry.createdAt as unknown as string),
          updatedAt:
            entry.updatedAt instanceof Date
              ? entry.updatedAt.toISOString()
              : (entry.updatedAt as unknown as string),
        }))
      : [];

  const initialAvatar = (() => {
    const raw = activeProfileImage?.imageUrl ?? currentUser?.image ?? null;
    if (!raw) {
      return null;
    }
    try {
      return getDownloadUrl(raw);
    } catch {
      return /^(data:|https?:\/\/)/.test(raw) ? raw : null;
    }
  })();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div>
        <BackToHomeButton
          label="Back"
          translationKey="navigation.back"
        />
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">
          <EditableTranslation defaultText="Profile" translationKey="profile.title" />
        </h1>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Update your account information and security preferences."
            translationKey="profile.subtitle"
          />
        </p>
      </header>

      {allowPersonalKnowledge ? (
        <PersonalKnowledgeSection entries={personalKnowledgeEntries} />
      ) : null}

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Profile picture"
            translationKey="profile.picture.title"
          />
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Upload an image to personalise your account. This picture appears in the chat header and menus."
            translationKey="profile.picture.description"
          />
        </p>
        <div className="mt-4">
          <AvatarForm
            initialImage={initialAvatar}
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
              <EditableTranslation
                defaultText="Account email"
                translationKey="profile.account_email.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="To change your login email, please contact support."
                translationKey="profile.account_email.description"
              />
            </p>
          </div>
          <div className="rounded-md border border-input border-dashed bg-background px-3 py-2 text-sm">
            {session.user.email}
          </div>
          <p className="text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Want to review your plan or credits? Visit the"
              translationKey="profile.account_email.link_prefix"
            />{" "}
            <Link
              className="font-semibold text-primary transition-colors hover:text-primary/80"
              href="/subscriptions"
            >
              <EditableTranslation
                defaultText="subscriptions dashboard"
                translationKey="profile.account_email.link_text"
              />
            </Link>
            <EditableTranslation
              defaultText="."
              translationKey="profile.account_email.link_suffix"
            />
          </p>
        </div>

        <PasswordForm />
      </section>

      <LocationSection
        initialAccuracy={currentUser?.locationAccuracy ?? null}
        initialLatitude={currentUser?.locationLatitude ?? null}
        initialLongitude={currentUser?.locationLongitude ?? null}
        updatedAt={
          currentUser?.locationUpdatedAt
            ? new Date(currentUser.locationUpdatedAt).toISOString()
            : null
        }
      />

      <section className="space-y-4 rounded-lg border border-destructive/30 bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="font-semibold text-destructive text-lg">
            <EditableTranslation
              defaultText="Delete account and data"
              translationKey="profile.delete_account.title"
            />
          </h2>
          <p className="text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Request permanent deletion of your account and associated data. You will see what is deleted, what may be retained, and receive a reference ID after submission."
              translationKey="profile.delete_account.description"
            />
          </p>
        </div>
        <Link
          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-destructive/40 px-4 py-2 font-medium text-destructive text-sm transition hover:bg-destructive/10"
          data-nav
          href="/help/delete-account"
        >
          <EditableTranslation
            defaultText="Request account data deletion"
            translationKey="profile.delete_account.button"
          />
        </Link>
      </section>

      <DeactivateAccountForm />
    </div>
  );
}
