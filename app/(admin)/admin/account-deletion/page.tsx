import type { Metadata } from "next";

import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminNotice,
  AdminPageHeader,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  type AccountDeletionRequestListItem,
  getAccountDeletionRequestCount,
  listAccountDeletionRequests,
} from "@/lib/db/queries";
import { requireAdminPageSession } from "@/lib/security/admin-session";
import {
  DeletionNoticeBanner,
  DeletionRequestFilters,
  DeletionRequestList,
} from "./deletion-requests-view";
import { MarkDeletionRequestsViewed } from "./mark-deletion-requests-viewed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account Deletion Requests",
  description: "Review and process account deletion requests.",
};

const PAGE_SIZE = 25;

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

export default async function AdminAccountDeletionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  await requireAdminPageSession();
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
      <AdminPageHeader
        description="Review verified requests, approve or reject them, and mark completed after account data has been removed or anonymized."
        meta={
          totalState.ok ? (
            <AdminStatusPill>{`${total.toLocaleString()} requests`}</AdminStatusPill>
          ) : null
        }
        navHref="/admin/account-deletion"
        title="Account deletion requests"
      />

      <DeletionNoticeBanner notice={notice} />

      {(!rowsConfirmed || !totalState.ok) && (
        <AdminNotice>
          {[
            !rowsConfirmed
              ? "Deletion request rows could not be confirmed."
              : null,
            !totalState.ok
              ? "Deletion request total could not be confirmed."
              : null,
          ]
            .filter(Boolean)
            .join(" ")}{" "}
          Refresh this admin section to retry.
        </AdminNotice>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <DeletionRequestFilters search={search} status={status} />
        <DeletionRequestList requests={requests} rowsConfirmed={rowsConfirmed} />
        <div className="border-t px-4 py-3">
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
