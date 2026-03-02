"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { FeatureAccessMode } from "@/lib/feature-access";

const FEATURE_ACCESS_API_ENDPOINT = "/api/admin/feature-access";
const FEATURE_TOGGLE_SLOW_NOTICE_MS = 8000;
const FEATURE_TOGGLE_ATTEMPT_TIMEOUT_MS = 12000;
const FEATURE_TOGGLE_MAX_RETRIES = 1;

function normalizeErrorMessage(value: unknown) {
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return null;
}

async function postFeatureAccessMode({
  attemptTimeoutMs,
  fieldName,
  mode,
}: {
  attemptTimeoutMs: number;
  fieldName: string;
  mode: FeatureAccessMode;
}): Promise<FeatureAccessMode> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort("request_timeout");
  }, attemptTimeoutMs);

  try {
    const response = await fetch(FEATURE_ACCESS_API_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({ fieldName, mode }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const serverMessage = normalizeErrorMessage(body);
      throw new Error(serverMessage ?? "save_failed");
    }

    const resolvedMode =
      body && typeof body === "object" && "mode" in body
        ? (body as { mode?: unknown }).mode
        : null;

    if (
      resolvedMode === "enabled" ||
      resolvedMode === "admin_only" ||
      resolvedMode === "disabled"
    ) {
      return resolvedMode;
    }

    return mode;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function saveFeatureAccessModeWithRetry({
  fieldName,
  mode,
}: {
  fieldName: string;
  mode: FeatureAccessMode;
}) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= FEATURE_TOGGLE_MAX_RETRIES; attempt++) {
    try {
      return await postFeatureAccessMode({
        attemptTimeoutMs: FEATURE_TOGGLE_ATTEMPT_TIMEOUT_MS,
        fieldName,
        mode,
      });
    } catch (error) {
      lastError = error;
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      const hasRetryRemaining = attempt < FEATURE_TOGGLE_MAX_RETRIES;

      if (!(timedOut && hasRetryRemaining)) {
        break;
      }
    }
  }

  throw lastError ?? new Error("save_failed");
}

function AccessModeBadge({ mode }: { mode: FeatureAccessMode }) {
  if (mode === "enabled") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 text-xs">
        Enabled for all
      </span>
    );
  }

  if (mode === "admin_only") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 text-xs">
        Admin only
      </span>
    );
  }

  return (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 text-xs">
      Disabled for all
    </span>
  );
}

const MODE_BUTTONS: Array<{
  label: string;
  mode: FeatureAccessMode;
  activeVariant: "default" | "destructive";
}> = [
  { label: "Disable for all", mode: "disabled", activeVariant: "destructive" },
  { label: "Admin only", mode: "admin_only", activeVariant: "default" },
  { label: "Enable for all", mode: "enabled", activeVariant: "default" },
];

export function FeatureAccessModeControl({
  currentMode,
  description,
  fieldName,
  successMessage,
  title,
}: {
  currentMode: FeatureAccessMode;
  description: string;
  fieldName: string;
  successMessage: string;
  title: string;
}) {
  const [mode, setMode] = useState<FeatureAccessMode>(currentMode);
  const [pendingTarget, setPendingTarget] = useState<FeatureAccessMode | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);

  const currentModeSummary =
    mode === "enabled"
      ? "Current: everyone can access."
      : mode === "admin_only"
        ? "Current: only admin users can access."
        : "Current: access is disabled for everyone.";

  const submitMode = async (nextMode: FeatureAccessMode) => {
    if (isSaving || nextMode === mode) {
      return;
    }

    const previousMode = mode;
    setMode(nextMode);
    setPendingTarget(nextMode);
    setIsSaving(true);

    let slowNoticeTimer: number | null = null;
    let showedSlowNotice = false;

    try {
      slowNoticeTimer = window.setTimeout(() => {
        showedSlowNotice = true;
        toast({
          type: "error",
          description:
            "Save is taking longer than expected. Retrying automatically.",
        });
      }, FEATURE_TOGGLE_SLOW_NOTICE_MS);

      const savedMode = await saveFeatureAccessModeWithRetry({
        fieldName,
        mode: nextMode,
      });
      setMode(savedMode);

      toast({
        type: "success",
        description: showedSlowNotice
          ? `${successMessage} (completed after a delay)`
          : successMessage,
      });
    } catch (error) {
      const requestTimedOut =
        error instanceof Error && error.message === "request_timeout";

      setMode(previousMode);
      toast({
        type: "error",
        description: requestTimedOut
          ? "Save timed out. Please try again."
          : "Failed to save this setting. Please try again.",
      });
      console.error(
        `[admin/settings] Failed to save feature access mode for "${fieldName}".`,
        error
      );
    } finally {
      if (slowNoticeTimer !== null) {
        window.clearTimeout(slowNoticeTimer);
      }
      setPendingTarget(null);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          <AccessModeBadge mode={mode} />
        </div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {MODE_BUTTONS.map((button) => {
            const isActive = mode === button.mode;
            const isSavingThis = pendingTarget === button.mode;

            return (
              <Button
                disabled={isSaving}
                key={button.mode}
                onClick={() => {
                  void submitMode(button.mode);
                }}
                type="button"
                variant={
                  isActive ? button.activeVariant : "outline"
                }
              >
                {isSavingThis ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                    <span>Saving...</span>
                  </span>
                ) : (
                  button.label
                )}
              </Button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Disable for all: no users can access. Admin only: only admin users can
          access. Enable for all: everyone can access.
        </p>
        <p className="text-muted-foreground text-xs">{currentModeSummary}</p>
      </div>
    </div>
  );
}
