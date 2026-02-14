"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { FeatureAccessMode } from "@/lib/feature-access";

type FeatureAccessAction = (formData: FormData) => Promise<void>;
const FEATURE_TOGGLE_REQUEST_TIMEOUT_MS = 15000;

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
  action,
  currentMode,
  description,
  fieldName,
  successMessage,
  title,
}: {
  action: FeatureAccessAction;
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

    let timeoutId: number | null = null;

    try {
      const formData = new FormData();
      formData.set(fieldName, nextMode);
      await Promise.race([
        action(formData),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            reject(new Error("request_timeout"));
          }, FEATURE_TOGGLE_REQUEST_TIMEOUT_MS);
        }),
      ]);
      toast({ type: "success", description: successMessage });
    } catch (error) {
      setMode(previousMode);
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Save timed out after 15 seconds. Please try again."
          : "Failed to save this setting. Please try again.",
      });
      console.error(
        `[admin/settings] Failed to save feature access mode for "${fieldName}".`,
        error
      );
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
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
