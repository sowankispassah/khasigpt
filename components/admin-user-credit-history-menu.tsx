"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { InfoIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
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

const CREDIT_HISTORY_TIMEOUT_MS = 10_000;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function AdminUserCreditHistoryMenu({
  userId,
  label,
}: {
  userId: string;
  label?: ReactNode;
}) {
  const { translate } = useTranslation();
  const [entries, setEntries] = useState<CreditHistoryMenuEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry deliberately restarts the request without coupling it to loading state.
  useEffect(() => {
    if (!open) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      CREDIT_HISTORY_TIMEOUT_MS
    );

    setIsLoading(true);
    setError(null);

    fetch(`/api/admin/users/${userId}/credit-history`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { entries?: CreditHistoryMenuEntry[]; error?: string; message?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            body?.message ?? body?.error ?? translate("admin.users.credits.history_error", "Unable to load credit history")
          );
        }

        if (!cancelled) {
          setEntries(Array.isArray(body?.entries) ? body.entries : []);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(
            isAbortError(fetchError)
              ? translate("admin.users.credits.history_timeout", "Credit history timed out. Retry this section.")
              : fetchError instanceof Error
              ? fetchError.message
              : translate("admin.users.credits.history_error", "Unable to load credit history")
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, retryAttempt, translate, userId]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-busy={isLoading}
          className={label ? "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted" : "flex h-5 w-5 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-background/60 hover:text-foreground"}
          type="button"
        >
          {isLoading ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <InfoIcon size={label ? 12 : 10} />}
          {label ?? <span className="sr-only"><EditableTranslation defaultText="Credit history" description="Open user credit history." translationKey="admin.users.credits.history" /></span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-80 space-y-2 overflow-y-auto p-3"
        side="top"
      >
        {isLoading ? (
          <p className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 aria-hidden="true" className="size-3 animate-spin" /><EditableTranslation defaultText="Loading credit history..." description="User credit history loading status." translationKey="admin.users.credits.history_loading" /></p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-destructive text-xs">{error}</p>
            <button
              className="cursor-pointer rounded-md border px-2 py-1 text-xs"
              onClick={() => {
                setRetryAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              <EditableTranslation defaultText="Retry" description="Retry credit history lookup." translationKey="admin.reports.filter.retry" />
            </button>
          </div>
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
            <EditableTranslation defaultText="No credit activity recorded yet." description="Empty user credit history." translationKey="admin.users.credits.history_empty" />
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
