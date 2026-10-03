"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  doneGlobalProgress,
  startGlobalProgress,
} from "@/lib/ui/global-progress";

export function ChatLoadFailureActions() {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();
  const retryStartedRef = useRef(false);

  useEffect(() => {
    if (retryStartedRef.current && !isRetrying) {
      retryStartedRef.current = false;
      doneGlobalProgress();
    }
  }, [isRetrying]);

  return (
    <div className="mt-4 flex justify-center gap-2">
      <button
        aria-busy={isRetrying}
        className="inline-flex min-w-20 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isRetrying}
        onClick={() => {
          if (isRetrying) {
            return;
          }

          retryStartedRef.current = true;
          startGlobalProgress();
          startRetry(() => router.refresh());
        }}
        type="button"
      >
        {isRetrying ? (
          <EditableTranslation
            defaultText="Retrying..."
            description="Pending retry button label for the chat detail recovery state."
            translationKey="chat.detail.load_failed.retrying"
          />
        ) : (
          <EditableTranslation
            defaultText="Retry"
            description="Retry button label for the chat detail recovery state."
            translationKey="chat.detail.load_failed.retry"
          />
        )}
      </button>
      <Link
        className="inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition hover:bg-muted"
        href="/chat"
      >
        <EditableTranslation
          defaultText="Back to chat"
          description="Back link label for the chat detail recovery state."
          translationKey="chat.detail.load_failed.back"
        />
      </Link>
    </div>
  );
}
