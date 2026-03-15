"use client";

import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const SITE_ACCESS_API_ENDPOINT = "/api/admin/settings/site-access";
const REQUEST_TIMEOUT_MS = 12_000;

type SiteAccessState = {
  publicLaunched: boolean;
  underMaintenance: boolean;
  inviteOnlyPrelaunch: boolean;
  adminAccessEnabled: boolean;
  adminEntryPath: string;
  adminEntryCodeConfigured: boolean;
};

type ToggleField =
  | "publicLaunched"
  | "underMaintenance"
  | "inviteOnlyPrelaunch"
  | "adminAccessEnabled";

const TOGGLE_ROWS: Array<{
  field: ToggleField;
  title: string;
  description: string;
}> = [
  {
    field: "publicLaunched",
    title: "Public launched",
    description:
      "When off, non-admin visitors can only access the coming-soon page.",
  },
  {
    field: "underMaintenance",
    title: "Under maintenance",
    description:
      "When on, non-admin visitors can only access the maintenance page.",
  },
  {
    field: "adminAccessEnabled",
    title: "Admin entry code",
    description:
      "When on and site access is restricted, admins can unlock /login from your custom hidden admin-entry path using a code.",
  },
  {
    field: "inviteOnlyPrelaunch",
    title: "Invite-only prelaunch",
    description:
      "When enabled and Public launched is off, only invited users can access the app after redeeming an invite link.",
  },
];

function EnabledBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 text-xs">
        On
      </span>
    );
  }

  return (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 text-xs">
      Off
    </span>
  );
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || body === null) {
      throw new Error("request_failed");
    }

    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function SiteAccessSettingsPanel({
  initialState,
}: {
  initialState: SiteAccessState;
}) {
  const [state, setState] = useState<SiteAccessState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialState.adminEntryPath);
  const [codeInput, setCodeInput] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [currentOrigin, setCurrentOrigin] = useState("");

  const syncFromServer = async () => {
    setIsLoading(true);
    try {
      const data = await fetchJsonWithTimeout<SiteAccessState>(
        SITE_ACCESS_API_ENDPOINT,
        { method: "GET" }
      );
      setState(data);
      setPathInput(data.adminEntryPath);
      setSyncedAt(new Date());
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Loading timed out. Please refresh and try again."
          : "Failed to load current settings.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
    void syncFromServer();
  }, []);

  const saveToggle = async (field: ToggleField, enabled: boolean) => {
    if (savingField || state[field] === enabled) {
      return;
    }

    const previous = state;
    setState((current) => ({ ...current, [field]: enabled }));
    setSavingField(field);
    try {
      const result = await fetchJsonWithTimeout<{
        ok: boolean;
        state: SiteAccessState;
      }>(SITE_ACCESS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "toggle",
          fieldName: field,
          enabled,
        }),
      });

      setState(result.state);
      setPathInput(result.state.adminEntryPath);
      setSyncedAt(new Date());
      toast({ type: "success", description: "Setting updated." });
    } catch (error) {
      setState(previous);
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Save timed out. Please try again."
          : "Failed to save setting.",
      });
    } finally {
      setSavingField(null);
    }
  };

  const savePath = async () => {
    if (savingField) {
      return;
    }
    setSavingField("path");
    try {
      const result = await fetchJsonWithTimeout<{
        ok: boolean;
        state: SiteAccessState;
      }>(SITE_ACCESS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "setPath",
          path: pathInput,
        }),
      });
      setState(result.state);
      setPathInput(result.state.adminEntryPath);
      setSyncedAt(new Date());
      toast({ type: "success", description: "Admin entry path updated." });
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Save timed out. Please try again."
          : "Failed to save admin entry path.",
      });
    } finally {
      setSavingField(null);
    }
  };

  const saveCode = async () => {
    if (savingField || codeInput.trim().length < 6) {
      return;
    }
    setSavingField("code");
    try {
      const result = await fetchJsonWithTimeout<{
        ok: boolean;
        state: SiteAccessState;
      }>(SITE_ACCESS_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({
          action: "setCode",
          code: codeInput,
        }),
      });
      setState(result.state);
      setCodeInput("");
      setSyncedAt(new Date());
      toast({ type: "success", description: "Admin access code updated." });
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Save timed out. Please try again."
          : "Failed to save admin access code.",
      });
    } finally {
      setSavingField(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {TOGGLE_ROWS.map((row) => {
        const enabled = state[row.field];
        const isSaving = savingField === row.field;
        return (
          <div
            className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
            key={row.field}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{row.title}</span>
                <EnabledBadge enabled={enabled} />
              </div>
              <p className="text-muted-foreground text-xs">{row.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isLoading || Boolean(savingField)}
                onClick={() => {
                  void saveToggle(row.field, false);
                }}
                type="button"
                variant={!enabled ? "default" : "outline"}
              >
                {isSaving && !enabled ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                    <span>Saving...</span>
                  </span>
                ) : (
                  "Off"
                )}
              </Button>
              <Button
                disabled={isLoading || Boolean(savingField)}
                onClick={() => {
                  void saveToggle(row.field, true);
                }}
                type="button"
                variant={enabled ? "default" : "outline"}
              >
                {isSaving && enabled ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                    <span>Saving...</span>
                  </span>
                ) : (
                  "On"
                )}
              </Button>
            </div>
          </div>
        );
      })}

      <div className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="adminEntryPathClient">
            Admin entry path
          </label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={isLoading || Boolean(savingField)}
            id="adminEntryPathClient"
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="/your-secret-entry-path"
            type="text"
            value={pathInput}
          />
          <p className="text-muted-foreground text-xs">
            Current URL:{" "}
            <span className="font-mono">
              {currentOrigin ? `${currentOrigin}${state.adminEntryPath}` : state.adminEntryPath}
            </span>
          </p>
        </div>
        <div className="flex items-end">
          <Button
            disabled={isLoading || Boolean(savingField)}
            onClick={() => {
              void savePath();
            }}
            type="button"
          >
            {savingField === "path" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon size={16} />
                </span>
                <span>Saving...</span>
              </span>
            ) : (
              "Save path"
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="adminEntryCodeClient">
            Admin access code
          </label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={isLoading || Boolean(savingField)}
            id="adminEntryCodeClient"
            onChange={(event) => setCodeInput(event.target.value)}
            placeholder="Set a new admin code (6+ chars)"
            type="password"
            value={codeInput}
          />
          <p className="text-muted-foreground text-xs">
            Entry path: <span className="font-mono">{state.adminEntryPath}</span> |
            Status: {state.adminEntryCodeConfigured ? " Code configured" : " Code not configured yet"}
          </p>
        </div>
        <div className="flex items-end">
          <Button
            disabled={isLoading || Boolean(savingField) || codeInput.trim().length < 6}
            onClick={() => {
              void saveCode();
            }}
            type="button"
          >
            {savingField === "code" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon size={16} />
                </span>
                <span>Saving...</span>
              </span>
            ) : (
              "Save code"
            )}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {syncedAt
          ? `Last synced: ${syncedAt.toLocaleString()}`
          : "Loading current values from server..."}
      </p>
    </div>
  );
}
