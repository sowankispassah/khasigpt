"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { InfoIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CreditHistoryMenuEntry = {
  createdAt: string;
  description: string;
  id: string;
};

export function AdminUserCreditHistoryMenu({
  userId,
}: {
  userId: string;
}) {
  const [entries, setEntries] = useState<CreditHistoryMenuEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || entries !== null || isLoading) {
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetch(`/api/admin/users/${userId}/credit-history`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { entries?: CreditHistoryMenuEntry[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(body?.error ?? "Unable to load credit history");
        }

        if (!cancelled) {
          setEntries(Array.isArray(body?.entries) ? body.entries : []);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load credit history"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entries, isLoading, open, userId]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-background/60 hover:text-foreground"
          type="button"
        >
          <InfoIcon size={10} />
          <span className="sr-only">View credit history</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-80 space-y-2 overflow-y-auto p-3"
        side="top"
      >
        {isLoading ? (
          <p className="text-muted-foreground text-xs">Loading credit history...</p>
        ) : error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : entries && entries.length > 0 ? (
          entries.map((entry) => (
            <div className="rounded-md border bg-background p-2 shadow-sm" key={entry.id}>
              <p className="font-medium text-foreground text-xs">
                {entry.description}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(entry.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-xs">
            No credit activity recorded yet.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
