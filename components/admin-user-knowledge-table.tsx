"use client";

import {
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
import { LoaderIcon, TrashIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
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
  { label: string; className: string; accent: string }
> = {
  approved: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-700",
    accent: "bg-emerald-600",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-800",
    accent: "bg-amber-600",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-50 text-rose-700",
    accent: "bg-rose-600",
  },
};

export function AdminUserKnowledgeTable({
  entries,
}: {
  entries: SerializedUserKnowledgeEntry[];
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

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      {progressVisible ? (
        <div className="fixed inset-x-0 top-0 z-40 h-1 bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-semibold text-xl">User Added Knowledge</h1>
          <p className="text-muted-foreground text-sm">
            Review, approve, or reject knowledge submitted by users. Approved
            items become retrievable by everyone.
          </p>
        </div>
        <Badge variant="secondary">
          {
            sortedRows.filter((row) => row.entry.approvalStatus === "pending")
              .length
          }{" "}
          pending
        </Badge>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-left">User</th>
              <th className="px-2 py-2 text-left">Title</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Updated</th>
              <th className="px-2 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  className="px-2 py-6 text-center text-muted-foreground"
                  colSpan={5}
                >
                  No user submissions yet.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const tone = statusTone[row.entry.approvalStatus];
                return (
                  <tr className="align-top" key={row.entry.id}>
                    <td className="px-2 py-3">
                      <div className="font-semibold">
                        {row.creator.name ?? "User"}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {row.creator.email ?? "—"}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-semibold">{row.entry.title}</div>
                      <p className="line-clamp-3 text-muted-foreground text-xs">
                        {row.entry.content}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium text-xs ${tone.className}`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 rounded-full ${tone.accent}`}
                        />
                        {tone.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground text-xs">
                      {new Date(row.entry.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            handleApproval(row.entry.id, "approved")
                          }
                          size="sm"
                          type="button"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            handleApproval(row.entry.id, "rejected")
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Reject
                        </Button>
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            handleApproval(row.entry.id, "pending")
                          }
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Keep pending
                        </Button>
                        <Button
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
