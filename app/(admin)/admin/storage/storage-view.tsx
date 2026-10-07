import { Database, Files, HardDrive, TriangleAlert } from "lucide-react";
import Link from "next/link";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { StorageInventoryButton } from "@/components/admin/storage-inventory-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { getChatStorageSummary } from "@/lib/admin/chat-storage";
import { STORAGE_COPY } from "@/lib/uploads/storage-copy";
import { STORAGE_ALERT_BYTES } from "@/lib/uploads/storage-lifecycle";
import { cn } from "@/lib/utils";

export type StorageSummary = Awaited<ReturnType<typeof getChatStorageSummary>>;

export function StorageText({
  name,
  values,
}: {
  name: keyof typeof STORAGE_COPY;
  values?: Record<string, string | number>;
}) {
  return <EditableTranslation {...STORAGE_COPY[name]} values={values} />;
}

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const;

export function formatStorageSize(value: string | number) {
  const bytes = Number(value);
  if (!(Number.isFinite(bytes) && bytes >= 0)) {
    return "—";
  }
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toLocaleString("en-IN", { maximumFractionDigits: unit === 0 ? 0 : 2 })} ${UNITS[unit]}`;
}

type MaintenanceRun = {
  deleted: number;
  failed: number;
  deferred: number;
  dryRun: boolean;
  ok?: unknown;
};

function parseRun(run: unknown): MaintenanceRun | null {
  if (
    run &&
    typeof run === "object" &&
    "deleted" in run &&
    "failed" in run &&
    "deferred" in run &&
    "dryRun" in run &&
    typeof run.dryRun === "boolean" &&
    [run.deleted, run.failed, run.deferred].every(
      (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0
    )
  ) {
    return run as MaintenanceRun;
  }
  return null;
}

const lastRunFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const pagerClass =
  "inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm transition hover:bg-muted";

export function StorageView({
  data,
  page,
}: {
  data: StorageSummary | null;
  page: number;
}) {
  if (!data?.totals) {
    return (
      <AdminNotice tone="danger">
        <StorageText name="unavailable" />
      </AdminNotice>
    );
  }

  const runData = parseRun(data.maintenance?.lastResult);
  const date = data.maintenance?.lastRunAt;
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  const lastRunLabel =
    parsedDate instanceof Date && Number.isFinite(parsedDate.getTime())
      ? `${lastRunFormatter.format(parsedDate)} UTC`
      : "—";
  const alerts = data.totals.alerts;
  const failed = data.pending?.failed ?? 0;
  const unknown = data.pending?.unknown ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <AdminStatCard
          icon={HardDrive}
          label={<StorageText name="bytes" />}
          value={formatStorageSize(data.totals.bytes)}
        />
        <AdminStatCard
          icon={Files}
          label={<StorageText name="files" />}
          value={Number(data.totals.files).toLocaleString("en-IN")}
        />
        <AdminStatCard
          hint="≥ 1 GiB"
          icon={Database}
          label={<StorageText name="review" />}
          value={
            <span className={alerts > 0 ? "text-amber-700 dark:text-amber-400" : undefined}>
              {alerts.toLocaleString("en-IN")}
            </span>
          }
        />
        <AdminStatCard
          icon={TriangleAlert}
          label={
            <EditableTranslation
              defaultText="Failed deletions"
              description="Admin storage stat card counting file deletions that failed and need review."
              translationKey="admin.storage.stat.failed"
            />
          }
          value={
            <span className={failed > 0 ? "text-rose-700 dark:text-rose-400" : undefined}>
              {failed.toLocaleString("en-IN")}
            </span>
          }
        />
      </div>

      {alerts > 0 || failed > 0 || (runData && runData.ok === false) || !data.maintenance?.inventoryCompletedAt || unknown > 0 ? (
        <div className="flex flex-col gap-2">
          {alerts > 0 ? (
            <AdminNotice>
              <StorageText name="alert" values={{ count: alerts, limit: "1 GiB" }} />
            </AdminNotice>
          ) : null}
          {failed > 0 ? (
            <AdminNotice tone="danger">
              <StorageText name="failed" values={{ count: failed }} />
            </AdminNotice>
          ) : null}
          {runData && runData.ok === false ? (
            <AdminNotice tone="danger">
              <StorageText name="runFailed" />
            </AdminNotice>
          ) : null}
          {data.maintenance?.inventoryCompletedAt ? null : (
            <AdminNotice tone="info">
              <StorageText name="inventory" />
            </AdminNotice>
          )}
          {unknown > 0 ? (
            <AdminNotice tone="info">
              <StorageText name="unknown" values={{ count: unknown }} />
            </AdminNotice>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <AdminPanel
          bodyClassName="flex flex-col gap-4 p-5 text-sm"
          className="min-w-0"
          title={
            <EditableTranslation
              defaultText="Maintenance"
              description="Admin storage panel heading for cleanup runs and inventory checks."
              translationKey="admin.storage.maintenance_title"
            />
          }
        >
          <div>
            <p>
              <StorageText name="lastRun" values={{ date: lastRunLabel }} />
              {date ? null : (
                <span className="text-muted-foreground">
                  {" "}
                  <StorageText name="notRun" />
                </span>
              )}
            </p>
            {runData ? (
              <p className="mt-1 text-muted-foreground">
                <StorageText
                  name="runResult"
                  values={{
                    deleted: Number(runData.deleted),
                    deferred: Number(runData.deferred),
                    failed: Number(runData.failed),
                  }}
                />{" "}
                <StorageText name="dryRun" />{" "}
                <StorageText name={runData.dryRun ? "yes" : "no"} />
              </p>
            ) : null}
            {alerts > 0 ? null : (
              <p className="mt-1 text-muted-foreground">
                <StorageText name="alert" values={{ count: alerts, limit: "1 GiB" }} />
              </p>
            )}
          </div>
          <StorageInventoryButton />
          <p className="border-t pt-4 text-muted-foreground text-xs leading-relaxed">
            <StorageText name="restore" />
          </p>
        </AdminPanel>

        <AdminPanel
          className="min-w-0 xl:col-span-2"
          description={
            <StorageText
              name="total"
              values={{
                bytes: formatStorageSize(data.totals.bytes),
                files: Number(data.totals.files).toLocaleString("en-IN"),
              }}
            />
          }
          title={
            <EditableTranslation
              defaultText="Storage by account"
              description="Admin storage panel heading for the per-account usage table."
              translationKey="admin.storage.accounts_title"
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium" scope="col">
                    <StorageText name="account" />
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium" scope="col">
                    <StorageText name="bytes" />
                  </th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell" scope="col">
                    <StorageText name="files" />
                  </th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell" scope="col">
                    <StorageText name="review" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.accounts.map((account) => {
                  const bytes = Number(account.bytes);
                  const overLimit = bytes >= STORAGE_ALERT_BYTES;
                  const share = Math.min(100, (bytes / STORAGE_ALERT_BYTES) * 100);
                  return (
                    <tr className="transition hover:bg-muted/30" key={account.userId}>
                      <td className="w-full max-w-0 px-4 py-3 sm:w-auto sm:max-w-none">
                        <span className="block truncate font-mono text-xs" title={account.userId}>
                          {account.userId}
                        </span>
                        <span className="text-muted-foreground text-xs sm:hidden">
                          {account.files.toLocaleString("en-IN")}{" "}
                          <StorageText name="files" />
                          {overLimit ? (
                            <>
                              {" · "}
                              <StorageText name="review" />
                            </>
                          ) : null}
                        </span>
                      </td>
                      <td className="min-w-36 px-4 py-3">
                        <div className="font-medium tabular-nums">
                          {formatStorageSize(account.bytes)}
                        </div>
                        <div
                          aria-hidden="true"
                          className="mt-1 h-1.5 w-full max-w-40 rounded-full bg-muted"
                        >
                          <div
                            className={cn(
                              "h-full rounded-full",
                              overLimit ? "bg-amber-500" : "bg-primary/60"
                            )}
                            style={{ width: `${Math.max(share, 1)}%` }}
                          />
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                        {account.files.toLocaleString("en-IN")}
                      </td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        <AdminStatusPill tone={overLimit ? "warning" : "neutral"}>
                          <StorageText name={overLimit ? "yes" : "no"} />
                        </AdminStatusPill>
                      </td>
                    </tr>
                  );
                })}
                {data.accounts.length ? null : (
                  <tr>
                    <td colSpan={4}>
                      <AdminEmptyState title={<StorageText name="empty" />} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {page > 1 || data.hasNext ? (
            <nav className="flex items-center justify-between gap-3 border-t px-4 py-3">
              {page > 1 ? (
                <Link className={pagerClass} data-nav href={`/admin/storage?page=${page - 1}`}>
                  <StorageText name="previous" />
                </Link>
              ) : (
                <span />
              )}
              {data.hasNext ? (
                <Link className={pagerClass} data-nav href={`/admin/storage?page=${page + 1}`}>
                  <StorageText name="next" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </AdminPanel>
      </div>
    </div>
  );
}
