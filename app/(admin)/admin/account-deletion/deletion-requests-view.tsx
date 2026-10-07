import { formatDistanceToNow } from "date-fns";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { ActionSubmitButton } from "@/components/action-submit-button";
import {
  AdminEmptyState,
  AdminNotice,
  AdminStatusPill,
  type AdminStatusTone,
} from "@/components/admin/admin-ui";
import type { AccountDeletionRequestListItem } from "@/lib/db/queries";
import type {
  AccountDeletionReason,
  AccountDeletionRequestStatus,
} from "@/lib/db/schema";
import {
  markDeletionRequestViewedAction,
  updateDeletionRequestStatusAction,
} from "./actions";

export const statusOptions: Array<{
  value: AccountDeletionRequestStatus;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const statusLabels: Record<AccountDeletionRequestStatus, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
};

const statusTones: Record<AccountDeletionRequestStatus, AdminStatusTone> = {
  pending: "warning",
  under_review: "info",
  approved: "info",
  completed: "success",
  rejected: "danger",
};

const reasonLabels: Record<AccountDeletionReason, string> = {
  no_longer_using: "No longer using the service",
  privacy_concerns: "Privacy concerns",
  duplicate_account: "Created duplicate account",
  prefer_not_to_say: "Prefer not to say",
  other: "Other",
};

export const deletionNotices: Record<
  string,
  { tone: "success" | "error"; message: string }
> = {
  updated: {
    tone: "success",
    message: "Deletion request updated.",
  },
  invalid: {
    tone: "error",
    message: "The deletion request update was invalid.",
  },
  "not-found": {
    tone: "error",
    message: "The deletion request could not be found.",
  },
  "requires-verification": {
    tone: "error",
    message:
      "This request must be email verified before it can be approved or completed.",
  },
  error: {
    tone: "error",
    message: "Unable to update the deletion request. Please retry.",
  },
};

const absoluteFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function TimelineItem({ label, value }: { label: string; value: Date | null }) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <time dateTime={date.toISOString()} title={absoluteFormatter.format(date)}>
          {formatDistanceToNow(date, { addSuffix: true })}
        </time>
      </dd>
    </div>
  );
}

export function DeletionNoticeBanner({ notice }: { notice: string | undefined }) {
  const entry = notice ? deletionNotices[notice] : undefined;
  if (!entry) {
    return null;
  }
  return entry.tone === "success" ? (
    <output className="block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 text-sm dark:text-emerald-300">
      {entry.message}
    </output>
  ) : (
    <AdminNotice tone="danger">{entry.message}</AdminNotice>
  );
}

export function DeletionRequestFilters({
  search,
  status,
}: {
  search: string;
  status: AccountDeletionRequestStatus | "all";
}) {
  return (
    <form className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Search requests"
          className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={search}
          name="search"
          placeholder="Reference ID, name, or email"
          type="search"
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
        <select
          aria-label="Status"
          className="h-9 cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-44"
          defaultValue={status}
          name="status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          data-nav
          type="submit"
        >
          <Search aria-hidden="true" className="size-4" />
          Search
        </button>
      </div>
    </form>
  );
}

export function DeletionRequestList({
  requests,
  rowsConfirmed,
}: {
  requests: AccountDeletionRequestListItem[];
  rowsConfirmed: boolean;
}) {
  if (!rowsConfirmed) {
    return (
      <AdminEmptyState
        description="Refresh this admin section to retry."
        title="Unable to load account deletion requests"
      />
    );
  }
  if (requests.length === 0) {
    return <AdminEmptyState title="No account deletion requests found" />;
  }
  return (
    <ul className="divide-y divide-border/60">
      {requests.map((request) => (
        <DeletionRequestItem key={request.id} request={request} />
      ))}
    </ul>
  );
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

function DeletionRequestItem({
  request,
}: {
  request: AccountDeletionRequestListItem;
}) {
  const verified = Boolean(request.verifiedAt);
  const canComplete = verified && request.status !== "completed";
  const accountState =
    request.userIsActive === null
      ? "Unknown"
      : request.userIsActive
        ? "Active"
        : "Inactive";

  return (
    <li
      className={`grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_20rem] ${
        request.isViewed ? "" : "bg-rose-500/[0.04]"
      }`}
    >
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-sm">
            {request.referenceId}
          </span>
          <AdminStatusPill tone={statusTones[request.status]}>
            {statusLabels[request.status]}
          </AdminStatusPill>
          <AdminStatusPill tone={verified ? "success" : "warning"}>
            {verified ? "Verified" : "Email not verified"}
          </AdminStatusPill>
          {request.isViewed ? null : (
            <AdminStatusPill tone="danger">New</AdminStatusPill>
          )}
        </div>

        <div className="min-w-0">
          <div className="font-medium">{request.fullName}</div>
          <a
            className="cursor-pointer break-all text-muted-foreground text-sm hover:text-foreground hover:underline"
            href={`mailto:${request.email}`}
          >
            {request.email}
          </a>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailLine label="Reason">{reasonLabels[request.reason]}</DetailLine>
          <DetailLine label="Account">{accountState}</DetailLine>
          <DetailLine label="User ID">
            <span className="break-all font-mono text-xs">
              {request.userId ?? "No matching account"}
            </span>
          </DetailLine>
          <DetailLine label="Source">{request.requestSource}</DetailLine>
          {request.usernameOrUserId ? (
            <DetailLine label="Identifier">{request.usernameOrUserId}</DetailLine>
          ) : null}
        </dl>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-muted-foreground text-xs">User comments</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {request.notes || (
                <span className="text-muted-foreground">No user comments.</span>
              )}
            </p>
          </div>
          <div>
            <p className="mb-1 text-muted-foreground text-xs">Timeline</p>
            <dl className="space-y-1 text-xs">
              <TimelineItem label="Requested" value={request.createdAt} />
              <TimelineItem label="Viewed" value={request.viewedAt} />
              <TimelineItem label="Verified" value={request.verifiedAt} />
              <TimelineItem label="Approved" value={request.approvedAt} />
              <TimelineItem label="Completed" value={request.completedAt} />
              <TimelineItem label="Rejected" value={request.rejectedAt} />
            </dl>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">Admin action</p>
          {request.isViewed ? null : (
            <form action={markDeletionRequestViewedAction}>
              <input name="requestId" type="hidden" value={request.id} />
              <ActionSubmitButton
                pendingLabel="Marking..."
                size="sm"
                successMessage="Deletion request marked viewed."
                variant="outline"
              >
                Mark as viewed
              </ActionSubmitButton>
            </form>
          )}
        </div>
        <form action={updateDeletionRequestStatusAction} className="space-y-2">
          <input name="requestId" type="hidden" value={request.id} />
          <label className="block text-muted-foreground text-xs" htmlFor={`deletion-status-${request.id}`}>
            Status
          </label>
          <select
            className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm"
            defaultValue={request.status}
            id={`deletion-status-${request.id}`}
            name="status"
          >
            {statusOptions.map((option) => (
              <option
                disabled={
                  !verified &&
                  (option.value === "approved" || option.value === "completed")
                }
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
          <label className="block text-muted-foreground text-xs" htmlFor={`deletion-notes-${request.id}`}>
            Internal notes
          </label>
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
            defaultValue={request.internalNotes ?? ""}
            id={`deletion-notes-${request.id}`}
            name="internalNotes"
            placeholder="Internal notes"
          />
          {verified ? null : (
            <p className="text-muted-foreground text-xs">
              Approve and complete are disabled until email verification is
              confirmed.
            </p>
          )}
          <ActionSubmitButton
            className="w-full"
            disabled={request.status === "completed" && !canComplete}
            pendingLabel="Updating..."
            size="sm"
            successMessage="Deletion request updated."
          >
            Update request
          </ActionSubmitButton>
        </form>
      </div>
    </li>
  );
}
