"use client";

import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AdminStatusPill } from "@/components/admin/admin-ui";
import { AdminUserDetailsButton } from "@/components/admin/admin-user-details-button";
import {
  AdminUserActionsMenu,
  type UserUpdatePayload,
} from "@/components/admin-user-actions-menu";
import { AddCreditsForm } from "@/components/admin-user-add-credits-form";
import { AdminUserChatsButton } from "@/components/admin-user-chats-button";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import { AdminUserStatusBadge } from "@/components/admin-user-status-badge";
import { AdminUsersSelectionCheckbox } from "@/components/admin-users-selection";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/lib/db/schema";

export type AdminUserRowData = {
  allowPersonalKnowledge: boolean;
  chatCount: number;
  createdAt: string | Date;
  email: string;
  emailVerificationPending: boolean;
  id: string;
  isActive: boolean;
  isOnline: boolean;
  lastLoginAt: string | Date | null;
  role: UserRole;
};

/**
 * Column visibility shared by the header and every row. Secondary columns
 * collapse into the user cell on narrow screens instead of forcing a
 * horizontal scroll.
 */
export const USER_COLUMN_CLASSES = {
  chats: "hidden md:table-cell",
  credits: "hidden sm:table-cell",
  joined: "hidden lg:table-cell",
  lastActive: "hidden md:table-cell",
  status: "hidden sm:table-cell",
} as const;

function toDate(value: string | Date | null) {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatRelative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return dateFormatter.format(date);
}

function LastActive({ isOnline, lastLoginAt }: { isOnline: boolean; lastLoginAt: Date | null }) {
  if (isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
        <EditableTranslation
          defaultText="Online"
          description="Shown in the last-login column while the user is currently online."
          translationKey="admin.users.last_login.online"
        />
      </span>
    );
  }
  if (!lastLoginAt) {
    return (
      <span className="text-muted-foreground">
        <EditableTranslation
          defaultText="Never"
          description="Shown when a user has no recorded successful login."
          translationKey="admin.users.last_login.never"
        />
      </span>
    );
  }
  return (
    <time
      dateTime={lastLoginAt.toISOString()}
      suppressHydrationWarning
      title={dateTimeFormatter.format(lastLoginAt)}
    >
      {formatRelative(lastLoginAt)}
    </time>
  );
}

function formatCredits(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Balance with history and a compact "add credits" dialog. */
export function AdminUserCreditsCell({
  creditsRemaining,
  email,
  userId,
}: {
  creditsRemaining: number | null;
  email: string;
  userId: string;
}) {
  const { translate } = useTranslation();
  const [balance, setBalance] = useState(creditsRemaining);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setBalance(creditsRemaining);
  }, [creditsRemaining]);

  return (
    <div className="flex items-center gap-1">
      <span
        className="min-w-12 font-medium tabular-nums"
        title={
          balance === null
            ? translate(
                "admin.users.credits.unconfirmed",
                "The latest balance could not be confirmed."
              )
            : undefined
        }
      >
        {balance === null ? "—" : formatCredits(balance)}
      </span>
      <span className="text-muted-foreground">
        <AdminUserCreditHistoryMenu userId={userId} />
      </span>
      <Button
        aria-label={translate("admin.users.credits.open", "Add credits to {email}").replace(
          "{email}",
          email
        )}
        className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Plus className="size-4" />
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <EditableTranslation
                defaultText="Add credits"
                description="Admin credit grant submit button."
                translationKey="admin.users.credits.add"
              />
            </DialogTitle>
            <DialogDescription className="break-all">
              {email}
              <span className="mt-1 block">
                <EditableTranslation
                  defaultText="Granted credits are free for the user and expire after 90 days."
                  description="Explains granted admin credits in the add-credits dialog."
                  translationKey="admin.users.credits.dialog_description"
                />
              </span>
            </DialogDescription>
          </DialogHeader>
          <AddCreditsForm
            creditsRemaining={balance}
            layout="stacked"
            onCreditsAdded={(next) => {
              setBalance(next);
              setOpen(false);
            }}
            userId={userId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminUserRow({
  creditsSlot,
  currentUserId,
  onUpdated,
  user,
}: {
  /** Credits cell content; the server streams it in once balances load. */
  creditsSlot: ReactNode;
  currentUserId: string | undefined;
  onUpdated?: (patch: UserUpdatePayload) => void;
  user: AdminUserRowData;
}) {
  const createdAt = toDate(user.createdAt);
  const lastLoginAt = toDate(user.lastLoginAt);
  const isSelf = user.id === currentUserId;

  return (
    <tr className="align-middle transition hover:bg-muted/30">
      <AdminUsersSelectionCheckbox disabled={isSelf} email={user.email} userId={user.id} />
      <td className="w-full max-w-0 py-3 sm:w-auto sm:max-w-[22rem]">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs uppercase sm:flex"
          >
            {user.email.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <AdminUserDetailsButton
              className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary hover:underline"
              email={user.email}
              onUpdated={onUpdated}
              userId={user.id}
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
              {user.role === "regular" ? (
                <span className="capitalize">{user.role}</span>
              ) : (
                <AdminStatusPill className="capitalize" tone={user.role === "admin" ? "info" : "warning"}>
                  {user.role}
                </AdminStatusPill>
              )}
              {isSelf ? <span>· you</span> : null}
              <span className="sm:hidden">
                <AdminUserStatusBadge
                  emailVerificationPending={user.emailVerificationPending}
                  isActive={user.isActive}
                  isOnline={user.isOnline}
                />
              </span>
              <span className="md:hidden">
                · <LastActive isOnline={user.isOnline} lastLoginAt={lastLoginAt} />
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs sm:hidden">
              <span className="text-muted-foreground">
                <EditableTranslation
                  defaultText="Credits"
                  description="Admin user table column with each user remaining credit balance."
                  translationKey="admin.users.table.credits"
                />
              </span>
              {creditsSlot}
            </div>
          </div>
        </div>
      </td>
      <td className={`py-3 ${USER_COLUMN_CLASSES.status}`}>
        <AdminUserStatusBadge
          emailVerificationPending={user.emailVerificationPending}
          isActive={user.isActive}
          isOnline={user.isOnline}
        />
      </td>
      <td className={`py-3 ${USER_COLUMN_CLASSES.credits}`}>{creditsSlot}</td>
      <td className={`py-3 ${USER_COLUMN_CLASSES.chats}`}>
        <AdminUserChatsButton chatCount={user.chatCount} userId={user.id} />
      </td>
      <td className={`whitespace-nowrap py-3 text-muted-foreground ${USER_COLUMN_CLASSES.joined}`}>
        {createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            title={dateTimeFormatter.format(createdAt)}
          >
            {dateFormatter.format(createdAt)}
          </time>
        ) : (
          "—"
        )}
      </td>
      <td className={`whitespace-nowrap py-3 ${USER_COLUMN_CLASSES.lastActive}`}>
        <LastActive isOnline={user.isOnline} lastLoginAt={lastLoginAt} />
      </td>
      <td className="py-3 text-right">
        <AdminUserActionsMenu
          allowPersonalKnowledge={user.allowPersonalKnowledge}
          currentRole={user.role}
          email={user.email}
          emailVerificationPending={user.emailVerificationPending}
          isActive={user.isActive}
          isSelf={isSelf}
          onUpdated={onUpdated}
          userId={user.id}
        />
      </td>
    </tr>
  );
}
