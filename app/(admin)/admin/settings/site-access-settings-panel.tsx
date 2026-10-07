"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminStatusPill } from "@/components/admin/admin-ui";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  return (
    <AdminStatusPill tone={enabled ? "success" : "neutral"}>
      {enabled ? "On" : "Off"}
    </AdminStatusPill>
  );
}

const FIELD_INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

function SavingLabel({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-4 w-4 animate-spin">
        <LoaderIcon size={16} />
      </span>
      <span>{children}</span>
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

  const controlsDisabled = isLoading || Boolean(savingField);

  return (
    <div className="flex flex-col gap-5">
      <div className="divide-y divide-border/60 rounded-lg border">
        {TOGGLE_ROWS.map((row) => {
          const enabled = state[row.field];
          const isSaving = savingField === row.field;
          return (
            <div
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              key={row.field}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">
                    <EditableTranslation
                      defaultText={row.title}
                      description={`${row.title} setting label in Admin Maintenance settings.`}
                      translationKey={row.titleKey}
                    />
                  </span>
                  <EnabledBadge enabled={enabled} />
                </div>
                <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                  <EditableTranslation
                    defaultText={row.description}
                    description={`${row.title} setting description in Admin Maintenance settings.`}
                    translationKey={row.descriptionKey}
                  />
                </p>
              </div>

              <fieldset
                aria-busy={isSaving}
                className="inline-flex shrink-0 self-start rounded-lg border bg-muted/40 p-0.5 sm:self-center"
              >
                {[false, true].map((value) => {
                  const isActive = enabled === value;
                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        "inline-flex h-8 min-w-14 cursor-pointer items-center justify-center rounded-md px-3 font-medium text-xs transition disabled:cursor-not-allowed",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-60"
                      )}
                      disabled={controlsDisabled}
                      key={String(value)}
                      onClick={() => {
                        void saveToggle(row.field, value);
                      }}
                      type="button"
                    >
                      {isSaving && enabled === value ? (
                        <SavingLabel>Saving...</SavingLabel>
                      ) : value ? (
                        "On"
                      ) : (
                        "Off"
                      )}
                    </button>
                  );
                })}
              </fieldset>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="font-medium text-sm" htmlFor="adminEntryPathClient">
            Admin entry path
          </label>
          <div className="flex gap-2">
            <input
              className={FIELD_INPUT_CLASS}
              disabled={controlsDisabled}
              id="adminEntryPathClient"
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="/your-secret-entry-path"
              type="text"
              value={pathInput}
            />
            <Button
              className="h-9 shrink-0 cursor-pointer"
              disabled={controlsDisabled}
              onClick={() => {
                void savePath();
              }}
              type="button"
            >
              {savingField === "path" ? <SavingLabel>Saving...</SavingLabel> : "Save path"}
            </Button>
          </div>
          <p className="break-all text-muted-foreground text-xs">
            Current URL:{" "}
            <span className="font-mono">
              {currentOrigin ? `${currentOrigin}${state.adminEntryPath}` : state.adminEntryPath}
            </span>
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label className="font-medium text-sm" htmlFor="adminEntryCodeClient">
            Admin access code
          </label>
          <div className="flex gap-2">
            <input
              className={FIELD_INPUT_CLASS}
              disabled={controlsDisabled}
              id="adminEntryCodeClient"
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="Set a new admin code (6+ chars)"
              type="password"
              value={codeInput}
            />
            <Button
              className="h-9 shrink-0 cursor-pointer"
              disabled={controlsDisabled || codeInput.trim().length < 6}
              onClick={() => {
                void saveCode();
              }}
              type="button"
            >
              {savingField === "code" ? <SavingLabel>Saving...</SavingLabel> : "Save code"}
            </Button>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <span>
              Entry path: <span className="font-mono">{state.adminEntryPath}</span>
            </span>
            <AdminStatusPill tone={state.adminEntryCodeConfigured ? "success" : "warning"}>
              {state.adminEntryCodeConfigured ? "Code configured" : "Code not configured yet"}
            </AdminStatusPill>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          {syncedAt
            ? `Last synced: ${syncedAt.toLocaleString()}`
            : "Loaded from the server-rendered settings snapshot."}
        </p>
        <Button
          className="cursor-pointer"
          disabled={controlsDisabled}
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
