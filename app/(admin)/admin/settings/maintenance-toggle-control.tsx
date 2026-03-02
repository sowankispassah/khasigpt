"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const MAINTENANCE_API_ENDPOINT = "/api/admin/maintenance";
const SAVE_TIMEOUT_MS = 12_000;

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

async function saveMaintenanceSetting({
  enabled,
  fieldName,
}: {
  enabled: boolean;
  fieldName: string;
}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort("request_timeout");
  }, SAVE_TIMEOUT_MS);

  try {
    const response = await fetch(MAINTENANCE_API_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ fieldName, enabled }),
    });

    if (!response.ok) {
      throw new Error("save_failed");
    }

    const body = (await response.json().catch(() => null)) as
      | { enabled?: unknown }
      | null;
    if (typeof body?.enabled === "boolean") {
      return body.enabled;
    }

    return enabled;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function MaintenanceToggleControl({
  currentValue,
  description,
  fieldName,
  title,
}: {
  currentValue: boolean;
  description: string;
  fieldName: string;
  title: string;
}) {
  const [enabled, setEnabled] = useState(currentValue);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateValue = async (nextValue: boolean) => {
    if (isSaving || nextValue === enabled) {
      return;
    }

    const previousValue = enabled;
    setEnabled(nextValue);
    setPendingValue(nextValue);
    setIsSaving(true);

    try {
      const savedValue = await saveMaintenanceSetting({
        fieldName,
        enabled: nextValue,
      });
      setEnabled(savedValue);
      toast({
        type: "success",
        description: `${title} updated.`,
      });
    } catch (error) {
      setEnabled(previousValue);
      const timedOut =
        error instanceof Error && error.message === "request_timeout";
      toast({
        type: "error",
        description: timedOut
          ? "Save timed out. Please try again."
          : "Failed to save this setting. Please try again.",
      });
    } finally {
      setPendingValue(null);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{title}</span>
          <EnabledBadge enabled={enabled} />
        </div>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isSaving}
          onClick={() => {
            void updateValue(false);
          }}
          type="button"
          variant={!enabled ? "default" : "outline"}
        >
          {pendingValue === false ? (
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
          disabled={isSaving}
          onClick={() => {
            void updateValue(true);
          }}
          type="button"
          variant={enabled ? "default" : "outline"}
        >
          {pendingValue === true ? (
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
}
