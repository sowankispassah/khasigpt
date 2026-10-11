"use client";

import { useEffect, useRef, useState } from "react";
import { AdminStatusPill } from "@/components/admin/admin-ui";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import type { FeatureAccessMode } from "@/lib/feature-access";
import type { FeatureAccessControlReadState } from "@/lib/settings/feature-access-settings";
import { cn } from "@/lib/utils";

const FEATURE_ACCESS_API_ENDPOINT = "/api/admin/feature-access";
const FEATURE_TOGGLE_ATTEMPT_TIMEOUT_MS = 45_000;
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

function AccessModeBadge({
  mode,
  readState,
}: {
  mode: FeatureAccessMode | null;
  readState: FeatureAccessControlReadState;
}) {
  if (mode === null) {
    if (readState === "missing") {
      return <AdminStatusPill>No saved value</AdminStatusPill>;
    }

    if (readState === "unreadable") {
      return <AdminStatusPill tone="danger">Invalid value</AdminStatusPill>;
    }

    return <AdminStatusPill>Unavailable</AdminStatusPill>;
  }

  if (mode === "enabled") {
    return (
      <AdminStatusPill tone="success">
        {readState === "stale" ? "Enabled for all (stale)" : "Enabled for all"}
      </AdminStatusPill>
    );
  }

  if (mode === "admin_only") {
    return (
      <AdminStatusPill tone="warning">
        {readState === "stale" ? "Admin only (stale)" : "Admin only"}
      </AdminStatusPill>
    );
  }

  return (
    <AdminStatusPill tone="danger">
      {readState === "stale" ? "Disabled for all (stale)" : "Disabled for all"}
    </AdminStatusPill>
  );
}

const MODE_BUTTONS: Array<{
  label: string;
  fullLabel: string;
  mode: FeatureAccessMode;
  activeClassName: string;
}> = [
  {
    label: "Off",
    fullLabel: "Disable for all",
    mode: "disabled",
    activeClassName: "bg-destructive text-white shadow-xs",
  },
  {
    label: "Admin only",
    fullLabel: "Admin only",
    mode: "admin_only",
    activeClassName: "bg-primary text-primary-foreground shadow-xs",
  },
  {
    label: "Everyone",
    fullLabel: "Enable for all",
    mode: "enabled",
    activeClassName: "bg-primary text-primary-foreground shadow-xs",
  },
];

function getCurrentModeSummary({
  mode,
  readState,
}: {
  mode: FeatureAccessMode | null;
  readState: FeatureAccessControlReadState;
}) {
  if (readState === "stale" && mode !== null) {
    return "Current: showing the last confirmed value because the database refresh failed.";
  }
  if (readState === "missing") {
    return "Current: no database value exists for this setting.";
  }
  if (readState === "unreadable") {
    return "Current: the database value is invalid and must be resaved.";
  }
  if (readState === "unavailable") {
    return "Current: database value could not be loaded.";
  }
  if (mode === null) {
    return "Current: not confirmed from the database.";
  }
  if (mode === "enabled") {
    return "Current: everyone can access.";
  }
  if (mode === "admin_only") {
    return "Current: only admin users can access.";
  }
  return "Current: access is disabled for everyone.";
}

export function FeatureAccessModeControl({
  currentMode,
  description,
  fieldName,
  readState,
  successMessage,
  title,
}: {
  currentMode: FeatureAccessMode | null;
  description: string;
  fieldName: string;
  readState: FeatureAccessControlReadState;
  successMessage: string;
  title: string;
}) {
  const [mode, setMode] = useState<FeatureAccessMode | null>(currentMode);
  const [displayReadState, setDisplayReadState] =
    useState<FeatureAccessControlReadState>(readState);
  const [pendingTarget, setPendingTarget] = useState<FeatureAccessMode | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const lastSyncedServerStateRef = useRef({ currentMode, readState });

  useEffect(() => {
    const lastSyncedServerState = lastSyncedServerStateRef.current;
    const serverStateChanged =
      lastSyncedServerState.currentMode !== currentMode ||
      lastSyncedServerState.readState !== readState;

    if (!serverStateChanged || isSaving) {
      return;
    }

    lastSyncedServerStateRef.current = { currentMode, readState };
    setMode(currentMode);
    setDisplayReadState(readState);
  }, [currentMode, isSaving, readState]);

  useEffect(() => {
    console.info("[admin/settings/feature-access] frontend_state", {
      currentMode,
      displayReadState,
      fieldName,
      propReadState: readState,
      selectedMode: mode,
    });
  }, [currentMode, displayReadState, fieldName, mode, readState]);

  const currentModeSummary = getCurrentModeSummary({
    mode,
    readState: displayReadState,
  });

  const submitMode = async (nextMode: FeatureAccessMode) => {
    if (isSaving || nextMode === mode) {
      return;
    }

    const previousMode = mode;
    const previousReadState = displayReadState;
    setMode(nextMode);
    setPendingTarget(nextMode);
    setIsSaving(true);

    try {
      const savedMode = await saveFeatureAccessModeWithRetry({
        fieldName,
        mode: nextMode,
      });
      setMode(savedMode);
      setDisplayReadState("confirmed");

      toast({
        type: "success",
        description: successMessage,
      });
    } catch (error) {
      const requestTimedOut =
        error instanceof Error && error.message === "request_timeout";
      const errorMessage =
        error instanceof Error &&
        error.message !== "save_failed" &&
        error.message.trim().length > 0
          ? error.message
          : null;

      setMode(previousMode ?? currentMode);
      setDisplayReadState(previousReadState);
      toast({
        type: "error",
        description: requestTimedOut
          ? "Save timed out. Please try again."
          : errorMessage ?? "Failed to save this setting. Please try again.",
      });
      console.error(
        `[admin/settings] Failed to save feature access mode for "${fieldName}".`,
        error
      );
    } finally {
      setPendingTarget(null);
      setIsSaving(false);
    }
  };

  const showReadStateDetail = displayReadState !== "confirmed";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          <AccessModeBadge mode={mode} readState={displayReadState} />
        </div>
        <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
        {showReadStateDetail ? (
          <div className="space-y-0.5 pt-1 text-xs">
            <p className="text-muted-foreground">{currentModeSummary}</p>
            {displayReadState === "missing" ? (
              <p className="text-amber-700 dark:text-amber-400">
                The database has no saved value for this setting. Choosing a
                value here will write a new explicit database value.
              </p>
            ) : displayReadState === "unreadable" ? (
              <p className="text-rose-700 dark:text-rose-400">
                The saved database value is not a recognized feature access
                mode. Choosing a value here will replace it with a valid value.
              </p>
            ) : displayReadState === "unavailable" ? (
              <p className="text-amber-700 dark:text-amber-400">
                The saved value could not be loaded. This page is not treating
                fallback data as confirmed database state.
              </p>
            ) : displayReadState === "stale" ? (
              <p className="text-amber-700 dark:text-amber-400">
                This value is stale. Saving will verify the database write
                before showing success.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <fieldset
        aria-busy={isSaving}
        aria-label={`${title} access`}
        className="inline-flex shrink-0 self-start rounded-lg border bg-muted/40 p-0.5"
      >
        {MODE_BUTTONS.map((button) => {
          const isActive = mode === button.mode;
          const isSavingThis = pendingTarget === button.mode;

          return (
            <button
              aria-label={button.fullLabel}
              aria-pressed={isActive}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-xs transition disabled:cursor-not-allowed",
                isActive
                  ? button.activeClassName
                  : "text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-60"
              )}
              disabled={isSaving}
              key={button.mode}
              onClick={() => {
                void submitMode(button.mode);
              }}
              title={button.fullLabel}
              type="button"
            >
              {isSavingThis ? (
                <span aria-hidden="true" className="size-3.5 animate-spin">
                  <LoaderIcon size={14} />
                </span>
              ) : null}
              {isSavingThis ? "Saving..." : button.label}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
