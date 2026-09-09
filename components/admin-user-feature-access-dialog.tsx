"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/utils/async";

type OverrideValue = boolean | null;
type FeatureRow = {
  defaultDescription: string;
  defaultLabel: string;
  descriptionKey: string;
  effectiveEnabled: boolean;
  globalMode: "admin_only" | "disabled" | "enabled";
  globalEnabled: boolean;
  labelKey: string;
  override: OverrideValue;
  settingKey: string;
};

type FeatureAccessResponse = {
  features: FeatureRow[];
  meta: { degraded: boolean; globalSettingsStatus: string };
  user: { email: string; id: string; role: string };
};

type Props = {
  email: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  userId: string;
};

const REQUEST_TIMEOUT_MS = 12_000;

function readError(response: Response) {
  return response
    .json()
    .catch(() => null)
    .then((data) =>
      data && typeof data.message === "string"
        ? data.message
        : "Feature access could not be loaded. Please retry."
    );
}

function modeLabel(mode: FeatureRow["globalMode"]) {
  if (mode === "enabled") return "Enable for all";
  if (mode === "admin_only") return "Admin only";
  return "Disable for all";
}

function overrideKey(value: OverrideValue) {
  return value === null ? "inherit" : value ? "allow" : "block";
}

export function AdminUserFeatureAccessDialog({
  email,
  onOpenChange,
  open,
  userId,
}: Props) {
  const { translate } = useTranslation();
  const [data, setData] = useState<FeatureAccessResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OverrideValue>>({});
  const [initialOverrides, setInitialOverrides] = useState<Record<string, OverrideValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/users/${userId}/feature-access`,
        { cache: "no-store", credentials: "include" },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as FeatureAccessResponse;
      const nextOverrides = Object.fromEntries(
        next.features.map((feature) => [feature.settingKey, feature.override])
      );
      setData(next);
      setOverrides(nextOverrides);
      setInitialOverrides(nextOverrides);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : translate(
              "admin.users.feature_access.load_error",
              "Feature access could not be loaded. Please retry."
            )
      );
    } finally {
      setLoading(false);
    }
  }, [translate, userId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const changed = useMemo(
    () => JSON.stringify(overrides) !== JSON.stringify(initialOverrides),
    [initialOverrides, overrides]
  );

  async function save() {
    if (!changed || saving) return;
    setSaving(true);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/users/${userId}/feature-access`,
        {
          body: JSON.stringify({ overrides }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok) throw new Error(await readError(response));
      const next = (await response.json()) as FeatureAccessResponse;
      const nextOverrides = Object.fromEntries(
        next.features.map((feature) => [feature.settingKey, feature.override])
      );
      setData(next);
      setOverrides(nextOverrides);
      setInitialOverrides(nextOverrides);
      toast({
        description: translate(
          "admin.users.feature_access.save_success",
          "Feature access saved for this user."
        ),
        type: "success",
      });
      onOpenChange(false);
    } catch (saveError) {
      toast({
        description:
          saveError instanceof Error
            ? saveError.message
            : translate(
                "admin.users.feature_access.save_error",
                "Feature access could not be saved. Please retry."
              ),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => !saving && onOpenChange(next)} open={open}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>
            <EditableTranslation
              defaultText="Feature Access"
              description="Title of the per-user feature access dialog."
              translationKey="admin.users.feature_access.title"
            />
          </DialogTitle>
          <DialogDescription>
            {translate(
              "admin.users.feature_access.description",
              "Choose which features {email} can use. Follow global keeps the normal app setting."
            ).replace("{email}", email)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <EditableTranslation
                defaultText="Loading feature access..."
                description="Loading state in the per-user feature access dialog."
                translationKey="admin.users.feature_access.loading"
              />
            </div>
          )}

          {!loading && error && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <p className="text-destructive text-sm">{error}</p>
              <Button className="cursor-pointer" onClick={() => void load()} variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                <EditableTranslation
                  defaultText="Retry"
                  description="Retry button in the per-user feature access dialog."
                  translationKey="admin.users.feature_access.retry"
                />
              </Button>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-3">
              {data.meta.degraded && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-xs dark:bg-amber-950/30 dark:text-amber-200">
                  <EditableTranslation
                    defaultText="Global settings are using the last confirmed values. Refresh before saving if you recently changed them."
                    description="Warning when global feature settings are stale in the per-user feature dialog."
                    translationKey="admin.users.feature_access.global_stale"
                  />
                </p>
              )}
              {data.features.map((feature) => {
                const value = overrides[feature.settingKey] ?? null;
                const effective =
                  value === null ? feature.globalEnabled : value;
                return (
                  <div
                    className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    key={feature.settingKey}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm">
                          <EditableTranslation
                            defaultText={feature.defaultLabel}
                            description={`Feature label for ${feature.defaultLabel} in per-user access settings.`}
                            translationKey={feature.labelKey}
                          />
                        </p>
                        <Badge variant="outline">
                          {translate(
                            `admin.users.feature_access.global.${feature.globalMode}`,
                            modeLabel(feature.globalMode)
                          )}
                        </Badge>
                        <Badge variant={effective ? "default" : "secondary"}>
                          {effective
                            ? translate("admin.users.feature_access.effective.on", "Access on")
                            : translate("admin.users.feature_access.effective.off", "Access off")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground text-xs">
                        <EditableTranslation
                          defaultText={feature.defaultDescription}
                          description={`Description for ${feature.defaultLabel} in per-user access settings.`}
                          translationKey={feature.descriptionKey}
                        />
                      </p>
                    </div>
                    <fieldset
                      aria-label={translate(
                        "admin.users.feature_access.setting_label",
                        "User access setting"
                      )}
                      className="grid grid-cols-3 rounded-md border bg-muted/40 p-1"
                    >
                      {(
                        [
                          ["inherit", null, "Follow global"],
                          ["allow", true, "Allow"],
                          ["block", false, "Block"],
                        ] as const
                      ).map(([key, nextValue, label]) => (
                        <button
                          aria-pressed={overrideKey(value) === key}
                          className={cn(
                            "cursor-pointer rounded px-3 py-1.5 text-xs transition-colors",
                            overrideKey(value) === key
                              ? "bg-background font-medium shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          disabled={saving}
                          key={key}
                          onClick={() =>
                            setOverrides((current) => ({
                              ...current,
                              [feature.settingKey]: nextValue,
                            }))
                          }
                          type="button"
                        >
                          {translate(`admin.users.feature_access.setting.${key}`, label)}
                        </button>
                      ))}
                    </fieldset>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            className="cursor-pointer"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            <EditableTranslation
              defaultText="Cancel"
              description="Cancel button in the per-user feature access dialog."
              translationKey="admin.users.feature_access.cancel"
            />
          </Button>
          <Button
            className="cursor-pointer"
            disabled={!data || !changed || loading || saving}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving
              ? translate("admin.users.feature_access.saving", "Saving...")
              : translate("admin.users.feature_access.save", "Save access")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
