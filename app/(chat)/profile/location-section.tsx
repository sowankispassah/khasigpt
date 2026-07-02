"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";

type LocationSectionProps = {
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialAccuracy: number | null;
  updatedAt: string | null;
};

export function LocationSection({
  initialLatitude,
  initialLongitude,
  initialAccuracy,
  updatedAt,
}: LocationSectionProps) {
  const [latitude, setLatitude] = useState<number | null>(initialLatitude);
  const [longitude, setLongitude] = useState<number | null>(initialLongitude);
  const [accuracy, setAccuracy] = useState<number | null>(initialAccuracy);
  const [lastUpdated, setLastUpdated] = useState<string | null>(updatedAt);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasAutoCapturedRef = useRef(false);
  const { translate } = useTranslation();

  useEffect(() => {
    setLatitude(initialLatitude);
  }, [initialLatitude]);

  useEffect(() => {
    setLongitude(initialLongitude);
  }, [initialLongitude]);

  useEffect(() => {
    setAccuracy(initialAccuracy);
  }, [initialAccuracy]);

  useEffect(() => {
    setLastUpdated(updatedAt);
  }, [updatedAt]);

  const persistLocation = useCallback(
    async ({
      accuracy,
      latitude,
      longitude,
    }: {
      accuracy: number | null;
      latitude: number;
      longitude: number;
    }) => {
      setIsSaving(true);
      const response = await fetch("/api/profile/location", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accuracy,
          latitude,
          longitude,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean; updatedAt?: string | null }
        | null;

      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error ?? "Failed to save location.");
      }

      setLatitude(latitude);
      setLongitude(longitude);
      setAccuracy(accuracy);
      setLastUpdated(body?.updatedAt ?? new Date().toISOString());
    },
    []
  );

  const handleCapture = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus(
        translate(
          "profile.location.error.unavailable",
          "Geolocation is not available in this browser."
        )
      );
      return;
    }

    setStatus(
      translate(
        "profile.location.status.requesting",
        "Requesting your location (optional)..."
      )
    );
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await persistLocation({
            accuracy: position.coords.accuracy,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setStatus(translate("profile.location.status.saved", "Location saved."));
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Failed to save location."
          );
        } finally {
          setIsSaving(false);
        }
      },
      (error) => {
        setIsSaving(false);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus(
            translate(
              "profile.location.error.permission_denied",
              "Location permission denied. You can enable it later when needed."
            )
          );
        } else {
          setStatus(
            translate(
              "profile.location.error.capture_failed",
              "Unable to get location. Please try again later."
            )
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (hasAutoCapturedRef.current) {
      return;
    }
    hasAutoCapturedRef.current = true;
    if (
      typeof navigator === "undefined" ||
      !navigator.permissions ||
      !navigator.geolocation
    ) {
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state !== "granted") {
          return;
        }
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              await persistLocation({
                accuracy: position.coords.accuracy,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
              setStatus(
                translate(
                  "profile.location.status.auto_captured",
                  "Location captured automatically."
                )
              );
            } catch {
              setStatus(
                translate(
                  "profile.location.error.save_failed",
                  "Failed to save location."
                )
              );
            } finally {
              setIsSaving(false);
            }
          },
          () => {
            // Silent failure; user can use the manual button later.
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      })
      .catch(() => {
        // Ignore permission query errors.
      });
  }, [persistLocation, translate]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">
            <EditableTranslation
              defaultText="Location (optional)"
              translationKey="profile.location.title"
            />
          </h2>
          <p className="text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Save your current location to power nearby business searches. If your device already allows location, we capture it automatically; otherwise you can save it manually."
              translationKey="profile.location.description"
            />
          </p>
        </div>
        <Button
          disabled={isSaving}
          onClick={handleCapture}
          size="sm"
          variant="outline"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              <span>
                <EditableTranslation
                  defaultText="Saving..."
                  translationKey="profile.location.saving"
                />
              </span>
            </span>
          ) : (
            <EditableTranslation
              defaultText="Save current location"
              translationKey="profile.location.save_button"
            />
          )}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs uppercase">
            <EditableTranslation
              defaultText="Latitude"
              translationKey="profile.location.latitude_label"
            />
          </p>
          <p className="font-mono">{latitude ?? "—"}</p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs uppercase">
            <EditableTranslation
              defaultText="Longitude"
              translationKey="profile.location.longitude_label"
            />
          </p>
          <p className="font-mono">{longitude ?? "—"}</p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs uppercase">
            <EditableTranslation
              defaultText="Accuracy (m)"
              translationKey="profile.location.accuracy_label"
            />
          </p>
          <p className="font-mono">
            {accuracy !== null && accuracy !== undefined
              ? Math.round(accuracy)
              : "—"}
          </p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs uppercase">
            <EditableTranslation
              defaultText="Last updated"
              translationKey="profile.location.last_updated_label"
            />
          </p>
          <p className="font-mono">
            {lastUpdated
              ? new Date(lastUpdated).toLocaleString()
              : translate(
                  "profile.location.not_captured",
                  "Not captured yet"
                )}
          </p>
        </div>
      </div>

      {status ? (
        <p className="mt-3 text-muted-foreground text-sm">{status}</p>
      ) : null}
    </section>
  );
}
