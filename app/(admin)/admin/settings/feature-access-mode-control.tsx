"use client";

import { useState, useTransition } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { FeatureAccessMode } from "@/lib/feature-access";

type FeatureAccessAction = (formData: FormData) => Promise<void>;

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
  const [isPending, startTransition] = useTransition();

  const currentModeSummary =
    mode === "enabled"
      ? "Current: everyone can access."
      : mode === "admin_only"
        ? "Current: only admin users can access."
        : "Current: access is disabled for everyone.";

  const submitMode = (nextMode: FeatureAccessMode) => {
    if (isPending || nextMode === mode) {
      return;
    }

    const previousMode = mode;
    setMode(nextMode);
    setPendingTarget(nextMode);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set(fieldName, nextMode);
        await action(formData);
        toast({ type: "success", description: successMessage });
      } catch (error) {
        setMode(previousMode);
        toast({
          type: "error",
          description: "Failed to save this setting. Please try again.",
        });
        console.error(
          `[admin/settings] Failed to save feature access mode for "${fieldName}".`,
          error
        );
      } finally {
        setPendingTarget(null);
      }
    });
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
                disabled={isPending}
                key={button.mode}
                onClick={() => submitMode(button.mode)}
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
