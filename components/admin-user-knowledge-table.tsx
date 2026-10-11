"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  deleteUserKnowledgeEntryAction,
  updateUserKnowledgeApprovalAction,
} from "@/app/(admin)/actions";
import {
  AdminEmptyState,
  AdminPanel,
  AdminStatusPill,
  type AdminStatusTone,
} from "@/components/admin/admin-ui";
import { LoaderIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { RagEntryApprovalStatus, RagEntryStatus } from "@/lib/db/schema";

export type SerializedUserKnowledgeEntry = {
  entry: {
    id: string;
    title: string;
    content: string;
    approvalStatus: RagEntryApprovalStatus;
    status: RagEntryStatus;
    createdAt: string;
    updatedAt: string;
    personalForUserId: string | null;
  };
  creator: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

const statusTone: Record<
  RagEntryApprovalStatus,
  { label: string; tone: AdminStatusTone }
> = {
  approved: { label: "Approved", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  rejected: { label: "Rejected", tone: "danger" },
};

const ACTION_BUTTON_CLASS = "h-8 cursor-pointer px-3 text-xs";
// A fixed locale and zone keep server-rendered and hydrated dates identical.
const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function AdminUserKnowledgeTable({
  entries,
  notice,
}: {
  entries: SerializedUserKnowledgeEntry[];
  /** Warning shown above the list, e.g. when the read was degraded. */
  notice?: ReactNode;
}) {
  const [rows, setRows] = useState(entries);
  const [isPending, startTransition] = useTransition();
  const [progressVisible, setProgressVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.entry.updatedAt).getTime() -
          new Date(a.entry.updatedAt).getTime()
      ),
    [rows]
  );

  const beginProgress = useCallback(() => {
    for (const timer of timers.current) {
      clearTimeout(timer);
    }
    setProgressVisible(true);
    setProgress(14);
    timers.current = [
      setTimeout(() => setProgress(40), 120),
      setTimeout(() => setProgress(70), 260),
      setTimeout(() => setProgress(90), 520),
    ];
  }, []);

  const finishProgress = useCallback(() => {
    for (const timer of timers.current) {
      clearTimeout(timer);
    }
    timers.current = [];
    setProgress(100);
    setTimeout(() => {
      setProgressVisible(false);
      setProgress(0);
    }, 240);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleApproval = (
    entryId: string,
    approvalStatus: RagEntryApprovalStatus
  ) => {
    beginProgress();
    startTransition(() => {
      updateUserKnowledgeApprovalAction({ entryId, approvalStatus })
        .then((updated) => {
          if (!updated) {
            toast.error("Unable to update entry");
            return;
          }
          setRows((prev) =>
            prev.map((row) =>
              row.entry.id === updated.id
                ? {
                    ...row,
                    entry: {
                      ...row.entry,
                      approvalStatus: updated.approvalStatus,
                      status: updated.status as RagEntryStatus,
                      updatedAt:
                        updated.updatedAt instanceof Date
                          ? updated.updatedAt.toISOString()
                          : (updated.updatedAt as string),
                    },
                  }
                : row
            )
          );
          toast.success(
            approvalStatus === "approved"
              ? "Entry approved"
              : approvalStatus === "rejected"
                ? "Entry rejected"
                : "Entry kept pending"
          );
        })
        .catch(() => toast.error("Unable to update entry"))
        .finally(() => finishProgress());
    });
  };

  const handleDelete = (entryId: string) => {
    beginProgress();
    startTransition(() => {
      deleteUserKnowledgeEntryAction({ entryId })
        .then(() => {
          setRows((prev) => prev.filter((row) => row.entry.id !== entryId));
          toast.success("Entry deleted");
        })
        .catch(() => toast.error("Unable to delete entry"))
        .finally(() => finishProgress());
    });
  };

  const pendingCount = sortedRows.filter(
    (row) => row.entry.approvalStatus === "pending"
  ).length;

  const renderActions = (row: SerializedUserKnowledgeEntry) => (
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
      <Button
        className={ACTION_BUTTON_CLASS}
        disabled={isPending}
        onClick={() => handleApproval(row.entry.id, "approved")}
        size="sm"
        type="button"
      >
        Approve
      </Button>
      <Button
        className={ACTION_BUTTON_CLASS}
        disabled={isPending}
        onClick={() => handleApproval(row.entry.id, "rejected")}
        size="sm"
        type="button"
        variant="outline"
      >
        Reject
      </Button>
      <Button
        className={ACTION_BUTTON_CLASS}
        disabled={isPending}
        onClick={() => handleApproval(row.entry.id, "pending")}
        size="sm"
        type="button"
        variant="secondary"
      >
        Keep pending
      </Button>
      <Button
        className={`${ACTION_BUTTON_CLASS} text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300`}
        disabled={isPending}
        onClick={() => handleDelete(row.entry.id)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isPending ? (
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon />
          </span>
        ) : (
          <TrashIcon />
        )}
        <span>Delete</span>
      </Button>
    </div>
  );

  return (
    <AdminPanel
      action={
        <AdminStatusPill tone={pendingCount > 0 ? "warning" : "neutral"}>
          {pendingCount} pending
        </AdminStatusPill>
      }
      description="Review, approve, or reject knowledge submitted by users. Approved items become retrievable by everyone."
      title="User-added knowledge"
    >
      {progressVisible ? (
        <div className="fixed inset-x-0 top-0 z-40 h-1 bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {notice ? <div className="border-b px-5 py-3">{notice}</div> : null}

      {sortedRows.length === 0 ? (
        <AdminEmptyState title="No user submissions yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium" scope="col">
                  Submission
                </th>
                <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell" scope="col">
                  Status
                </th>
                <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">
                  Updated
                </th>
                <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedRows.map((row) => {
                const tone = statusTone[row.entry.approvalStatus];
                const updatedAt = UPDATED_AT_FORMATTER.format(new Date(row.entry.updatedAt));
                return (
                  <tr className="align-top transition hover:bg-muted/30" key={row.entry.id}>
                    <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[34rem]">
                      <p className="font-medium">{row.entry.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                        {row.entry.content}
                      </p>
                      <p className="mt-1.5 truncate text-muted-foreground text-xs">
                        <span className="font-medium text-foreground">
                          {row.creator.name ?? "User"}
                        </span>
                        {row.creator.email ? ` · ${row.creator.email}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:hidden">
                        <span className="sm:hidden">
                          <AdminStatusPill tone={tone.tone}>{tone.label}</AdminStatusPill>
                        </span>
                        <span className="text-muted-foreground">{updatedAt}</span>
                      </div>
                      <div className="mt-3 md:hidden">{renderActions(row)}</div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <AdminStatusPill tone={tone.tone}>{tone.label}</AdminStatusPill>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground text-xs md:table-cell">
                      {updatedAt}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{renderActions(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}
