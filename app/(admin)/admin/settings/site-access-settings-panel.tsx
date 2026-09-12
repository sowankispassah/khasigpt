"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";

const SITE_ACCESS_API_ENDPOINT = "/api/admin/settings/site-access";
const REQUEST_TIMEOUT_MS = 45_000;

type SiteAccessState = {
  webLaunched: boolean;
  mobileAppLaunched: boolean;
  underMaintenance: boolean;
  inviteOnlyPrelaunch: boolean;
  adminAccessEnabled: boolean;
  adminEntryPath: string;
  adminEntryCodeConfigured: boolean;
};

type SiteAccessMutationResponse = {
  ok: boolean;
  state?: SiteAccessState;
  statePatch?: Partial<SiteAccessState>;
};

type ToggleField =
  | "webLaunched"
  | "mobileAppLaunched"
  | "underMaintenance"
  | "inviteOnlyPrelaunch"
  | "adminAccessEnabled";

const TOGGLE_ROWS: Array<{
  field: ToggleField;
  descriptionKey: string;
  title: string;
  titleKey: string;
  description: string;
}> = [
  {
    field: "webLaunched",
    title: "Web launched",
    titleKey: "admin.settings.site_access.web_launched.title",
    description:
      "When off, non-admin web visitors can only access the coming-soon page.",
    descriptionKey: "admin.settings.site_access.web_launched.description",
  },
  {
    field: "mobileAppLaunched",
    title: "Mobile app launched",
    titleKey: "admin.settings.site_access.mobile_app_launched.title",
    description:
      "Controls public access to the native Android app independently of the web launch.",
    descriptionKey:
      "admin.settings.site_access.mobile_app_launched.description",
  },
  {
    field: "underMaintenance",
    title: "Under maintenance",
    titleKey: "admin.settings.site_access.under_maintenance.title",
    description:
      "When on, non-admin visitors can only access the maintenance page.",
    descriptionKey: "admin.settings.site_access.under_maintenance.description",
  },
  {
    field: "adminAccessEnabled",
    title: "Admin entry code",
    titleKey: "admin.settings.site_access.admin_entry.title",
    description:
      "When on and site access is restricted, admins can unlock /login from your custom hidden admin-entry path using a code.",
    descriptionKey: "admin.settings.site_access.admin_entry.description",
  },
  {
    field: "inviteOnlyPrelaunch",
    title: "Invite-only prelaunch",
    titleKey: "admin.settings.site_access.invite_only.title",
    description:
      "When enabled, invited users can access a platform while its launch setting is off.",
    descriptionKey: "admin.settings.site_access.invite_only.description",
  },
];

class AdminSettingsRequestError extends Error {
  code: string;
  status: number;

  constructor({
    code,
    message,
    status,
  }: {
    code: string;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "AdminSettingsRequestError";
    this.code = code;
    this.status = status;
  }
}

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

    const body = (await response.json().catch(() => null)) as
      | (T & { error?: unknown; message?: unknown })
      | null;
    if (!response.ok || body === null) {
      const code =
        body && typeof body.error === "string" ? body.error : "request_failed";
      const message =
        body && typeof body.message === "string"
          ? body.message
          : response.status === 403
            ? "Your admin session was not accepted. Please refresh and sign in again."
            : `Request failed (${response.status}).`;
      throw new AdminSettingsRequestError({
        code,
        message,
        status: response.status,
      });
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

function getErrorDescription(error: unknown, fallback: string) {
  if (error instanceof AdminSettingsRequestError) {
    return error.message;
  }

  if (error instanceof Error && error.message === "request_timeout") {
    return "Request timed out. Please try again.";
  }

  return fallback;
}

export function SiteAccessSettingsPanel({
  initialState,
}: {
  initialState: SiteAccessState;
}) {
  const [state, setState] = useState<SiteAccessState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialState.adminEntryPath);
  const [codeInput, setCodeInput] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [currentOrigin, setCurrentOrigin] = useState("");

  const applyMutationResult = useCallback(
    (
      result: SiteAccessMutationResponse,
      fallbackPatch: Partial<SiteAccessState>
    ) => {
      const patch = result.state ?? result.statePatch ?? fallbackPatch;
      setState((current) => ({ ...current, ...patch }));
      if (typeof patch.adminEntryPath === "string") {
        setPathInput(patch.adminEntryPath);
      }
      setSyncedAt(new Date());
    },
    []
  );

  useEffect(() => {
    setSyncedAt(new Date());
  }, []);

  const syncFromServer = useCallback(async () => {
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
      toast({
        type: "error",
        description: getErrorDescription(
          error,
          "Failed to load current settings."
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const saveToggle = async (field: ToggleField, enabled: boolean) => {
    if (savingField || state[field] === enabled) {
      return;
    }

    const previous = state;
    setState((current) => ({ ...current, [field]: enabled }));
    setSavingField(field);
    try {
      const result = await fetchJsonWithTimeout<SiteAccessMutationResponse>(
        SITE_ACCESS_API_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            action: "toggle",
            fieldName: field,
            enabled,
          }),
        }
      );

      applyMutationResult(result, { [field]: enabled });
      toast({ type: "success", description: "Setting updated." });
    } catch (error) {
      setState(previous);
      toast({
        type: "error",
        description: getErrorDescription(error, "Failed to save setting."),
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
      const result = await fetchJsonWithTimeout<SiteAccessMutationResponse>(
        SITE_ACCESS_API_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            action: "setPath",
            path: pathInput,
          }),
        }
      );
      applyMutationResult(result, { adminEntryPath: pathInput });
      toast({ type: "success", description: "Admin entry path updated." });
    } catch (error) {
      toast({
        type: "error",
        description: getErrorDescription(
          error,
          "Failed to save admin entry path."
        ),
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
      const result = await fetchJsonWithTimeout<SiteAccessMutationResponse>(
        SITE_ACCESS_API_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify({
            action: "setCode",
            code: codeInput,
          }),
        }
      );
      applyMutationResult(result, { adminEntryCodeConfigured: true });
      setCodeInput("");
      toast({ type: "success", description: "Admin access code updated." });
    } catch (error) {
      toast({
        type: "error",
        description: getErrorDescription(
          error,
          "Failed to save admin access code."
        ),
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
                <span className="font-medium text-sm">
                  <EditableTranslation
                    defaultText={row.title}
                    description={`${row.title} setting label in Admin Maintenance settings.`}
                    translationKey={row.titleKey}
                  />
                </span>
                <EnabledBadge enabled={enabled} />
              </div>
              <p className="text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText={row.description}
                  description={`${row.title} setting description in Admin Maintenance settings.`}
                  translationKey={row.descriptionKey}
                />
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="cursor-pointer"
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
                className="cursor-pointer"
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {syncedAt
            ? `Last synced: ${syncedAt.toLocaleString()}`
            : "Loaded from the server-rendered settings snapshot."}
        </p>
        <Button
          className="cursor-pointer"
          disabled={isLoading || Boolean(savingField)}
          onClick={() => {
            void syncFromServer();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {isLoading ? "Refreshing..." : "Refresh settings"}
        </Button>
      </div>
    </div>
  );
}
