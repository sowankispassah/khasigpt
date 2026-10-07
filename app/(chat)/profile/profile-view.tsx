import {
  CalendarDays,
  KeyRound,
  Mail,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  AccountMeter,
  AccountPageShell,
  AccountSection,
} from "@/components/account/account-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
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
import { ProfileSectionNav } from "./profile-section-nav";
import { ProfilePill, profileDateFormatter } from "./profile-ui";

export type ProfileAccountSummary =
  | { status: "unavailable" }
  | {
      status: "ok";
      planName: string | null;
      creditsRemaining: number;
      creditsTotal: number;
      expiresAt: Date | null;
    };

export type ProfileViewProps = {
  account: ProfileAccountSummary;
  allowPersonalKnowledge: boolean;
  authProvider: "credentials" | "google" | null;
  email: string | null;
  firstName: string | null;
  initialAvatar: string | null;
  lastName: string | null;
  location: {
    accuracy: number | null;
    latitude: number | null;
    longitude: number | null;
    updatedAt: string | null;
  };
  memberSince: Date | null;
  personalKnowledgeEntries: SerializedPersonalKnowledgeEntry[];
  sessionName: string | null;
};

const SECTION_IDS = {
  danger: "profile-danger-zone",
  details: "profile-personal-details",
  knowledge: "profile-personal-knowledge",
  location: "profile-location",
  security: "profile-security",
} as const;

const creditFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

const secondaryLinkClass =
  "inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border bg-background px-4 font-medium text-sm transition-colors hover:bg-muted sm:flex-none";
const primaryLinkClass =
  "inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 sm:flex-none";

function AccountSummaryStrip({ account }: { account: ProfileAccountSummary }) {
  const actions = (
    <div className="flex gap-2">
      <Link className={secondaryLinkClass} href="/subscriptions">
        <EditableTranslation
          defaultText="View usage"
          description="Profile header link to the subscriptions and usage page."
          translationKey="profile.account.view_usage"
        />
      </Link>
      <Link className={primaryLinkClass} href="/recharge">
        <EditableTranslation
          defaultText="Recharge"
          translationKey="subscriptions.quick_actions.recharge_button"
        />
      </Link>
    </div>
  );

  if (account.status === "unavailable") {
    return (
      <div className="flex flex-col gap-3 border-t bg-muted/30 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Your plan and credits could not be loaded right now."
            description="Shown in the profile header when the credit balance read fails."
            translationKey="profile.account.unavailable"
          />
        </p>
        {actions}
      </div>
    );
  }

  const ratio =
    account.creditsTotal > 0 ? account.creditsRemaining / account.creditsTotal : 0;
  const meterTone = ratio < 0.1 ? "danger" : ratio < 0.25 ? "warning" : "success";
  const hasPlan = account.planName !== null || account.creditsTotal > 0;

  return (
    <div className="flex flex-col gap-4 border-t bg-muted/30 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-8">
      <dl className="grid min-w-0 flex-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="Plan"
              description="Profile header label for the user's current plan."
              translationKey="profile.account.plan"
            />
          </dt>
          <dd className="mt-1 truncate font-medium text-sm">
            {account.planName ?? (
              <EditableTranslation
                defaultText="No active plan"
                translationKey="subscriptions.plan_overview.no_active_plan"
              />
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="Credits remaining"
              translationKey="recharge.current_balance.remaining"
            />
          </dt>
          <dd className="mt-1 font-medium text-sm tabular-nums">
            {creditFormatter.format(account.creditsRemaining)}
            {account.creditsTotal > 0 ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                / {creditFormatter.format(account.creditsTotal)}
              </span>
            ) : null}
          </dd>
          {hasPlan && account.creditsTotal > 0 ? (
            <AccountMeter
              className="mt-2"
              label={`${Math.round(ratio * 100)}%`}
              tone={meterTone}
              value={ratio * 100}
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="Credits valid until"
              translationKey="recharge.current_balance.valid_until"
            />
          </dt>
          <dd className="mt-1 font-medium text-sm">
            {account.expiresAt ? profileDateFormatter.format(account.expiresAt) : "—"}
          </dd>
        </div>
      </dl>
      {actions}
    </div>
  );
}

function ProfileOverview({
  account,
  authProvider,
  email,
  initialAvatar,
  memberSince,
  name,
  sessionName,
}: {
  account: ProfileAccountSummary;
  authProvider: ProfileViewProps["authProvider"];
  email: string | null;
  initialAvatar: string | null;
  memberSince: Date | null;
  name: string;
  sessionName: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="bg-gradient-to-br from-muted/60 via-card to-card px-5 py-5 sm:px-6 sm:py-6">
        <AvatarForm initialImage={initialAvatar} userEmail={email} userName={sessionName}>
          <div className="min-w-0">
            <h2 className="break-words font-semibold text-xl tracking-tight">
              {name || email}
            </h2>
            {name && email ? (
              <p className="break-all text-muted-foreground text-sm">{email}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {memberSince ? (
                <ProfilePill>
                  <CalendarDays aria-hidden="true" className="size-3" />
                  <EditableTranslation
                    defaultText="Member since {date}"
                    description="Profile header pill showing when the account was created."
                    translationKey="profile.overview.member_since"
                    values={{ date: profileDateFormatter.format(memberSince) }}
                  />
                </ProfilePill>
              ) : null}
              {authProvider ? (
                <ProfilePill>
                  <ShieldCheck aria-hidden="true" className="size-3" />
                  {authProvider === "google" ? (
                    <EditableTranslation
                      defaultText="Google sign-in"
                      description="Profile header pill for accounts that sign in with Google."
                      translationKey="profile.overview.provider.google"
                    />
                  ) : (
                    <EditableTranslation
                      defaultText="Email and password"
                      description="Profile header pill for accounts that sign in with email and password."
                      translationKey="profile.overview.provider.credentials"
                    />
                  )}
                </ProfilePill>
              ) : null}
            </div>
          </div>
        </AvatarForm>
      </div>
      <AccountSummaryStrip account={account} />
    </section>
  );
}

export function ProfileView({
  account,
  allowPersonalKnowledge,
  authProvider,
  email,
  firstName,
  initialAvatar,
  lastName,
  location,
  memberSince,
  personalKnowledgeEntries,
  sessionName,
}: ProfileViewProps) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || sessionName || "";
  const navItems = [
    {
      id: SECTION_IDS.details,
      label: (
        <EditableTranslation defaultText="Personal details" translationKey="profile.name.title" />
      ),
    },
    ...(allowPersonalKnowledge
      ? [
          {
            id: SECTION_IDS.knowledge,
            label: (
              <EditableTranslation
                defaultText="Personal knowledge"
                description="Title of the personal knowledge section on the profile page."
                translationKey="profile.knowledge.title"
              />
            ),
          },
        ]
      : []),
    {
      id: SECTION_IDS.security,
      label: (
        <EditableTranslation
          defaultText="Security"
          description="Profile section index entry for the password section."
          translationKey="profile.nav.security"
        />
      ),
    },
    {
      id: SECTION_IDS.location,
      label: (
        <EditableTranslation
          defaultText="Location"
          description="Profile section index entry for the location section."
          translationKey="profile.nav.location"
        />
      ),
    },
    {
      id: SECTION_IDS.danger,
      label: (
        <EditableTranslation
          defaultText="Delete or deactivate"
          description="Profile danger zone title and section index entry."
          translationKey="profile.danger.title"
        />
      ),
    },
  ];

  return (
    <AccountPageShell
      back={<BackToHomeButton label="Back" translationKey="navigation.back" variant="pill" />}
      description={
        <EditableTranslation
          defaultText="Update your account information and security preferences."
          translationKey="profile.subtitle"
        />
      }
      title={<EditableTranslation defaultText="Profile" translationKey="profile.title" />}
    >
      <ProfileOverview
        account={account}
        authProvider={authProvider}
        email={email}
        initialAvatar={initialAvatar}
        memberSince={memberSince}
        name={name}
        sessionName={sessionName}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        <ProfileSectionNav items={navItems} />

        <div className="flex min-w-0 flex-col gap-6">
          <AccountSection
            description={
              <EditableTranslation
                defaultText="Update the name that appears across the product."
                translationKey="profile.name.description"
              />
            }
            icon={UserRound}
            id={SECTION_IDS.details}
            title={
              <EditableTranslation defaultText="Personal details" translationKey="profile.name.title" />
            }
          >
            <div className="mb-5 space-y-1.5">
              <p className="font-medium text-sm">
                <EditableTranslation
                  defaultText="Account email"
                  translationKey="profile.account_email.title"
                />
              </p>
              <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 text-sm">
                <Mail aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{email}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="To change your login email, please contact support."
                  translationKey="profile.account_email.description"
                />
              </p>
            </div>
            <NameForm initialFirstName={firstName} initialLastName={lastName} />
          </AccountSection>

          {allowPersonalKnowledge ? (
            <PersonalKnowledgeSection
              entries={personalKnowledgeEntries}
              id={SECTION_IDS.knowledge}
            />
          ) : null}

          <AccountSection
            description={
              <EditableTranslation
                defaultText="Password must be at least 8 characters long."
                translationKey="profile.password.description"
              />
            }
            icon={KeyRound}
            id={SECTION_IDS.security}
            title={
              <EditableTranslation defaultText="Update password" translationKey="profile.password.title" />
            }
          >
            <PasswordForm />
          </AccountSection>

          <LocationSection
            id={SECTION_IDS.location}
            initialAccuracy={location.accuracy}
            initialLatitude={location.latitude}
            initialLongitude={location.longitude}
            updatedAt={location.updatedAt}
          />

          <AccountSection
            bodyClassName="divide-y p-0 sm:p-0"
            description={
              <EditableTranslation
                defaultText="These actions affect your whole account. Read each one carefully before continuing."
                description="Description of the profile danger zone with data deletion and deactivation."
                translationKey="profile.danger.description"
              />
            }
            icon={TriangleAlert}
            id={SECTION_IDS.danger}
            title={
              <span className="text-rose-700 dark:text-rose-400">
                <EditableTranslation
                  defaultText="Delete or deactivate"
                  description="Profile danger zone title and section index entry."
                  translationKey="profile.danger.title"
                />
              </span>
            }
            tone="danger"
          >
            <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
              <div className="min-w-0 space-y-1">
                <h3 className="font-medium text-sm">
                  <EditableTranslation
                    defaultText="Delete account and data"
                    translationKey="profile.delete_account.title"
                  />
                </h3>
                <p className="text-muted-foreground text-sm">
                  <EditableTranslation
                    defaultText="Request permanent deletion of your account and associated data. You will see what is deleted, what may be retained, and receive a reference ID after submission."
                    translationKey="profile.delete_account.description"
                  />
                </p>
              </div>
              <Link
                className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center rounded-lg border border-rose-500/40 px-4 font-medium text-rose-700 text-sm transition-colors hover:bg-rose-500/10 sm:w-auto dark:text-rose-400"
                data-nav
                href="/help/delete-account"
              >
                <EditableTranslation
                  defaultText="Request account data deletion"
                  translationKey="profile.delete_account.button"
                />
              </Link>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <DeactivateAccountForm />
            </div>
          </AccountSection>
        </div>
      </div>
    </AccountPageShell>
  );
}

