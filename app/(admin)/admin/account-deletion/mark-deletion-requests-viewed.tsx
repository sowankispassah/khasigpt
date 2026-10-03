"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function MarkDeletionRequestsViewed({
  enabled,
}: {
  enabled: boolean;
}) {
  const router = useRouter();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasRunRef.current) {
      return;
    }

    hasRunRef.current = true;
    let cancelled = false;

    async function markViewed() {
      try {
        const response = await fetch(
          "/api/admin/account-deletion/mark-viewed",
          {
            body: JSON.stringify({}),
            cache: "no-store",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
          }
        );

        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as {
          markedCount?: unknown;
          remainingUnviewedCount?: unknown;
        };
        const count =
          typeof body.remainingUnviewedCount === "number" &&
          Number.isFinite(body.remainingUnviewedCount)
            ? Math.max(0, body.remainingUnviewedCount)
            : 0;

        window.dispatchEvent(
          new CustomEvent("admin:account-deletion-unviewed-count", {
            detail: { count },
          })
        );

        if (
          !cancelled &&
          typeof body.markedCount === "number" &&
          body.markedCount > 0
        ) {
          router.refresh();
        }
      } catch (error) {
        console.warn(
          "[admin.account-deletion] Failed to mark requests viewed.",
          error
        );
      }
    }

    void markViewed();

    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  return null;
}
