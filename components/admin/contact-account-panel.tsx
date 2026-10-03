"use client";

import Image from "next/image";
import { type ReactNode, useState } from "react";
import { AdminUserActionsMenu, type UserUpdatePayload } from "@/components/admin-user-actions-menu";
import { AddCreditsForm } from "@/components/admin-user-add-credits-form";
import { AdminUserChatsButton } from "@/components/admin-user-chats-button";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import { AdminUserStatusBadge } from "@/components/admin-user-status-badge";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { type ContactAccountSummary, getContactAccountAvatar } from "@/lib/contact/account-summary";

export function ContactAccountPanel({ account, currentAdminId, refreshing, onUpdated, onRefresh, showContactContext = true }: {
  showContactContext?: boolean;
  account: ContactAccountSummary;
  currentAdminId: string | null;
  refreshing: boolean;
  onUpdated: (patch: UserUpdatePayload) => void;
  onRefresh: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = getContactAccountAvatar(account.image);
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ");
  const initials = name ? name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() : account.email.slice(0, 1).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 border-b pb-4 text-center">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-xl">
          {image && failedImage !== image ? <Image alt="" className="size-full object-cover" height={64} onError={() => setFailedImage(image)} src={image} unoptimized width={64} /> : <span aria-hidden="true">{initials}</span>}
        </div>
        <p className="break-words font-semibold text-base">{name || <EditableTranslation defaultText="No name set" description="Account profile has no name." translationKey="admin.contacts.account.no_name" />}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <AdminUserChatsButton chatCount={account.chatCount} label={<EditableTranslation defaultText="View chats" description="Open matched account chat history." translationKey="admin.contacts.account.view_chats" />} userId={account.id} />
          <AdminUserActionsMenu allowPersonalKnowledge={account.allowPersonalKnowledge} currentRole={account.role} disabled={refreshing} email={account.email} emailVerificationPending={account.emailVerificationPending} isActive={account.isActive} isSelf={!currentAdminId || account.id === currentAdminId} onDeleted={onRefresh} onUpdated={onUpdated} triggerLabel={<EditableTranslation defaultText="More" description="Open matched account admin actions." translationKey="admin.contacts.account.more" />} userId={account.id} />
        </div>
      </div>
      {showContactContext ? <p className="text-muted-foreground text-xs"><EditableTranslation defaultText="Matched by email. This does not verify who submitted the contact message." description="Contact email match identity caveat." translationKey="admin.contacts.account.match_note" /></p> : null}
      <dl className="space-y-3">
        <AccountField label="First name" translationKey="admin.contacts.account.first_name">{account.firstName || "—"}</AccountField>
        <AccountField label="Last name" translationKey="admin.contacts.account.last_name">{account.lastName || "—"}</AccountField>
        <AccountField label="Email" translationKey="admin.contacts.dialog.email"><span className="break-all">{account.email}</span></AccountField>
        <AccountField label="Account status" translationKey="admin.users.filters.account_status.label"><AdminUserStatusBadge emailVerificationPending={account.emailVerificationPending} isActive={account.isActive} isOnline={false} /></AccountField>
        <AccountField label="Role" translationKey="admin.users.filters.role.label"><EditableTranslation defaultText={account.role === "admin" ? "Admin" : account.role === "creator" ? "Creator" : "Regular"} description="Matched contact account role." translationKey={`admin.contacts.account.role.${account.role}`} /></AccountField>
        <AccountField label="Sign-in method" translationKey="admin.contacts.account.provider"><EditableTranslation defaultText={account.authProvider === "google" ? "Google" : "Email and password"} description="Matched contact account sign-in method." translationKey={account.authProvider === "google" ? "admin.contacts.account.provider.google" : "admin.contacts.account.provider.credentials"} /></AccountField>
        <AccountField label="Joined" translationKey="admin.contacts.account.joined"><time dateTime={account.createdAt}>{new Date(account.createdAt).toLocaleDateString()}</time></AccountField>
        <AccountField label="Plan" translationKey="admin.contacts.account.plan">{account.subscriptionUnavailable ? <EditableTranslation defaultText="Unavailable" description="Matched account plan could not be loaded." translationKey="admin.contacts.account.unavailable" /> : account.subscription ? account.subscription.planName || <EditableTranslation defaultText="Unknown plan" description="Matched account plan name is unavailable." translationKey="admin.contacts.account.unknown_plan" /> : <EditableTranslation defaultText="No active plan" description="Matched account has no active plan." translationKey="subscriptions.plan_overview.no_active_plan" />}</AccountField>
        {account.subscription ? <><AccountField label="Credits remaining" translationKey="subscriptions.plan_overview.credits_remaining">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(account.subscription.creditsRemaining)}</AccountField><AccountField label="Plan expires" translationKey="subscriptions.plan_overview.plan_expires"><time dateTime={account.subscription.expiresAt}>{new Date(account.subscription.expiresAt).toLocaleDateString()}</time></AccountField></> : null}
      </dl>
      <div className="space-y-3 border-t pt-4">
        <h4 className="font-semibold text-sm"><EditableTranslation defaultText="Manage credits" description="Matched account credit management heading." translationKey="admin.contacts.account.manage_credits" /></h4>
        <AddCreditsForm creditsRemaining={account.subscriptionUnavailable ? null : account.subscription?.creditsRemaining ?? 0} disabled={refreshing} layout="stacked" onCreditsAdded={onRefresh} userId={account.id} />
        <AdminUserCreditHistoryMenu label={<EditableTranslation defaultText="Credit history" description="Open matched account credit history." translationKey="admin.users.credits.history" />} userId={account.id} />
      </div>
      {showContactContext ? <a className="inline-flex cursor-pointer text-primary text-xs underline-offset-2 hover:underline" data-nav href={`/admin/users?q=${encodeURIComponent(account.email)}`} rel="noopener noreferrer" target="_blank"><EditableTranslation defaultText="Open in Users" description="Open matching account in admin users list." translationKey="admin.contacts.account.open_user" /></a> : null}
    </div>
  );
}

function AccountField({ label, translationKey, children }: { label: string; translationKey: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-muted-foreground text-xs"><EditableTranslation defaultText={label} description={`Matched account ${label.toLowerCase()} label.`} translationKey={translationKey} /></dt><dd className="mt-1 break-words text-sm">{children}</dd></div>;
}
