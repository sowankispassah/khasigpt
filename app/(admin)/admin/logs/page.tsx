import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminNotice,
  AdminPageHeader,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { getAuditLogCount, listAuditLog } from "@/lib/db/queries";
import { requireAdminPageSession } from "@/lib/security/admin-session";
import { AuditLogTable } from "./audit-log-view";

export const dynamic = "force-dynamic";

const AUDIT_LOG_PAGE_SIZE = 50;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const offset = (requestedPage - 1) * AUDIT_LOG_PAGE_SIZE;

  const [auditEntriesState, totalEntriesState] = await Promise.all([
    adminQueryResult({
      fallback: [] as Awaited<ReturnType<typeof listAuditLog>>,
      label: "audit-log.entries",
      promise: listAuditLog({
        limit: AUDIT_LOG_PAGE_SIZE,
        offset,
      }),
    }),
    adminQueryResult({
      fallback: 0,
      label: "audit-log.count",
      promise: getAuditLogCount(),
    }),
  ]);

  const totalEntries = totalEntriesState.data;
  const totalPages = totalEntriesState.ok
    ? Math.max(1, Math.ceil(totalEntries / AUDIT_LOG_PAGE_SIZE))
    : requestedPage;
  const page = totalEntriesState.ok
    ? Math.min(requestedPage, totalPages)
    : requestedPage;
  const pagedEntriesState =
    page === requestedPage || !auditEntriesState.ok
      ? auditEntriesState
      : await adminQueryResult({
          fallback: [] as Awaited<ReturnType<typeof listAuditLog>>,
          label: "audit-log.corrected-page",
          promise: listAuditLog({
            limit: AUDIT_LOG_PAGE_SIZE,
            offset: (page - 1) * AUDIT_LOG_PAGE_SIZE,
          }),
        });
  const pagedEntries = pagedEntriesState.data;
  const entriesConfirmed = pagedEntriesState.ok;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Every administrative action is recorded for compliance."
        meta={
          totalEntriesState.ok ? (
            <AdminStatusPill>{`${totalEntries.toLocaleString()} entries`}</AdminStatusPill>
          ) : null
        }
        navHref="/admin/logs"
        title="Audit log"
      />

      {(!entriesConfirmed || !totalEntriesState.ok) && (
        <AdminNotice>
          {[
            !entriesConfirmed ? "Audit rows could not be confirmed." : null,
            !totalEntriesState.ok
              ? "Audit entry total could not be confirmed."
              : null,
          ]
            .filter(Boolean)
            .join(" ")}{" "}
          Refresh this admin section to retry.
        </AdminNotice>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <AuditLogTable entries={pagedEntries} entriesConfirmed={entriesConfirmed} />
        <div className="border-t px-4 py-3">
          <AdminPagination
            itemLabel="audit entries"
            page={page}
            pageSize={AUDIT_LOG_PAGE_SIZE}
            pathname="/admin/logs"
            searchParams={resolvedSearchParams}
            totalItems={totalEntriesState.ok ? totalEntries : pagedEntries.length}
          />
        </div>
      </section>
    </div>
  );
}
