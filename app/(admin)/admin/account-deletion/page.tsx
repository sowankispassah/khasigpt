import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  type AccountDeletionRequestListItem,
  getAccountDeletionRequestCount,
  listAccountDeletionRequests,
} from "@/lib/db/queries";
import type {
  AccountDeletionReason,
  AccountDeletionRequestStatus,
} from "@/lib/db/schema";
import {
  markDeletionRequestViewedAction,
  updateDeletionRequestStatusAction,
} from "./actions";
import { MarkDeletionRequestsViewed } from "./mark-deletion-requests-viewed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account Deletion Requests",
  description: "Review and process account deletion requests.",
};

const PAGE_SIZE = 25;

const statusOptions: Array<{
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

const reasonLabels: Record<AccountDeletionReason, string> = {
  no_longer_using: "No longer using the service",
  privacy_concerns: "Privacy concerns",
  duplicate_account: "Created duplicate account",
  prefer_not_to_say: "Prefer not to say",
  other: "Other",
};

const notices: Record<string, { tone: "success" | "error"; message: string }> = {
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

type SearchParamValue = string | string[] | undefined;

function singleValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: SearchParamValue) {
  const parsed = Number.parseInt(singleValue(value) ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseStatus(value: SearchParamValue) {
  const rawValue = singleValue(value);
  if (
    rawValue === "pending" ||
    rawValue === "under_review" ||
    rawValue === "approved" ||
    rawValue === "completed" ||
    rawValue === "rejected"
  ) {
    return rawValue;
  }
  return "all" as const;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Not set";
  }
  return `${new Date(value).toLocaleString()} (${formatDistanceToNow(
    new Date(value),
    { addSuffix: true }
  )})`;
}

function statusTone(status: AccountDeletionRequestStatus) {
  switch (status) {
    case "completed":
      return "default";
    case "rejected":
      return "destructive";
    case "approved":
      return "secondary";
    default:
      return "outline";
  }
}

export default async function AdminAccountDeletionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const status = parseStatus(resolvedSearchParams?.status);
  const search = singleValue(resolvedSearchParams?.search)?.trim() ?? "";
  const notice = singleValue(resolvedSearchParams?.notice);
  const offset = (requestedPage - 1) * PAGE_SIZE;

  const [requestsState, totalState] = await Promise.all([
    adminQueryResult({
      fallback: [] as AccountDeletionRequestListItem[],
      label: "account-deletion.requests",
      promise: listAccountDeletionRequests({
        limit: PAGE_SIZE,
        offset,
        status,
        search,
      }),
    }),
    adminQueryResult({
      fallback: 0,
      label: "account-deletion.count",
      promise: getAccountDeletionRequestCount({ status, search }),
    }),
  ]);

  const total = totalState.data;
  const totalPages = totalState.ok ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : requestedPage;
  const page = totalState.ok ? Math.min(requestedPage, totalPages) : requestedPage;
  const pagedState =
    page === requestedPage || !requestsState.ok
      ? requestsState
      : await adminQueryResult({
          fallback: [] as AccountDeletionRequestListItem[],
          label: "account-deletion.corrected-page",
          promise: listAccountDeletionRequests({
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            status,
            search,
          }),
        });
  const requests = pagedState.data;
  const rowsConfirmed = pagedState.ok;

  return (
    <div className="flex flex-col gap-6">
      <MarkDeletionRequestsViewed enabled={rowsConfirmed} />
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Account deletion requests</h1>
        <p className="text-muted-foreground text-sm">
          Review verified requests, approve or reject them, and mark completed
          after account data has been removed or anonymized.
        </p>
      </header>

      {notice && notices[notice] ? (
        <div
          className={
            notices[notice].tone === "success"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 text-sm"
              : "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          }
        >
          {notices[notice].message}
        </div>
      ) : null}

      <form className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-2">
          <span className="font-medium text-sm">Search requests</span>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={search}
            name="search"
            placeholder="Reference ID, name, or email"
            type="search"
          />
        </label>
        <label className="flex flex-col gap-2 md:w-56">
          <span className="font-medium text-sm">Status</span>
          <select
            className="h-10 cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
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
        </label>
        <button
          className="h-10 cursor-pointer rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          type="submit"
        >
          Search
        </button>
      </form>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        {(!rowsConfirmed || !totalState.ok) && (
          <AdminWarning
            message={[
              !rowsConfirmed
                ? "Deletion request rows could not be confirmed."
                : null,
              !totalState.ok
                ? "Deletion request total could not be confirmed."
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Request</th>
                <th className="py-3 text-left">User</th>
                <th className="py-3 text-left">Reason</th>
                <th className="py-3 text-left">Timeline</th>
                <th className="py-3 text-left">Notes</th>
                <th className="py-3 text-left">Admin action</th>
              </tr>
            </thead>
            <tbody>
              {!rowsConfirmed ? (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={6}>
                    Unable to load account deletion requests.
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={6}>
                    No account deletion requests found.
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <RequestRow key={request.id} request={request} />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <AdminPagination
            itemLabel="deletion requests"
            page={page}
            pageSize={PAGE_SIZE}
            pathname="/admin/account-deletion"
            searchParams={resolvedSearchParams}
            totalItems={totalState.ok ? total : requests.length}
          />
        </div>
      </section>
    </div>
  );
}

function RequestRow({ request }: { request: AccountDeletionRequestListItem }) {
  const verified = Boolean(request.verifiedAt);
  const canComplete = verified && request.status !== "completed";
  return (
    <tr className="border-t align-top">
      <td className="py-4 pr-4">
        <div className="font-mono font-semibold text-xs">
          {request.referenceId}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant={statusTone(request.status)}>
            {statusLabels[request.status]}
          </Badge>
          <Badge variant={verified ? "secondary" : "outline"}>
            {verified ? "Verified" : "Email not verified"}
          </Badge>
          {!request.isViewed ? (
            <Badge className="bg-destructive text-destructive-foreground">
              New
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 text-muted-foreground text-xs">
          Source: {request.requestSource}
        </div>
      </td>
      <td className="py-4 pr-4">
        <div className="font-medium">{request.fullName}</div>
        <a
          className="cursor-pointer text-muted-foreground text-xs hover:underline"
          href={`mailto:${request.email}`}
        >
          {request.email}
        </a>
        <div className="mt-1 max-w-[16rem] break-all text-muted-foreground text-xs">
          User ID: {request.userId ?? "No matching account"}
        </div>
        <div className="text-muted-foreground text-xs">
          Account:{" "}
          {request.userIsActive === null
            ? "Unknown"
            : request.userIsActive
              ? "Active"
              : "Inactive"}
        </div>
      </td>
      <td className="py-4 pr-4">
        <div>{reasonLabels[request.reason]}</div>
        {request.usernameOrUserId ? (
          <div className="mt-1 text-muted-foreground text-xs">
            Identifier: {request.usernameOrUserId}
          </div>
        ) : null}
      </td>
      <td className="py-4 pr-4 text-muted-foreground text-xs">
        <div>Requested: {formatDate(request.createdAt)}</div>
        <div>Viewed: {formatDate(request.viewedAt)}</div>
        <div>Verified: {formatDate(request.verifiedAt)}</div>
        <div>Approved: {formatDate(request.approvedAt)}</div>
        <div>Completed: {formatDate(request.completedAt)}</div>
        <div>Rejected: {formatDate(request.rejectedAt)}</div>
      </td>
      <td className="py-4 pr-4">
        <div className="max-w-[18rem] whitespace-pre-wrap text-muted-foreground text-xs leading-5">
          {request.notes || "No user comments."}
        </div>
        {request.internalNotes ? (
          <div className="mt-3 max-w-[18rem] whitespace-pre-wrap rounded-md bg-muted p-2 text-xs leading-5">
            {request.internalNotes}
          </div>
        ) : null}
      </td>
      <td className="py-4">
        {!request.isViewed ? (
          <form action={markDeletionRequestViewedAction} className="mb-3">
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
        ) : null}
        <form action={updateDeletionRequestStatusAction} className="space-y-2">
          <input name="requestId" type="hidden" value={request.id} />
          <select
            className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
            defaultValue={request.status}
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
          <textarea
            className="min-h-[72px] w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
            defaultValue={request.internalNotes ?? ""}
            name="internalNotes"
            placeholder="Internal notes"
          />
          {!verified ? (
            <p className="text-muted-foreground text-xs">
              Approve and complete are disabled until email verification is
              confirmed.
            </p>
          ) : null}
          <ActionSubmitButton
            disabled={request.status === "completed" && !canComplete}
            pendingLabel="Updating..."
            size="sm"
            successMessage="Deletion request updated."
          >
            Update request
          </ActionSubmitButton>
        </form>
      </td>
    </tr>
  );
}

function AdminWarning({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {message} Refresh this admin section to retry.
    </div>
  );
}
