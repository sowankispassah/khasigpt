"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountSection } from "@/components/account/account-ui";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { formatProfileDateTime } from "./profile-ui";

type LocationSectionProps = {
  /** Anchor for the in-page section index. */
  id?: string;
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialAccuracy: number | null;
  updatedAt: string | null;
};

export function LocationSection({
  id,
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

  const formatCoordinate = (value: number | null) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? "—"
      : value.toFixed(5);
  const lastUpdatedLabel = formatProfileDateTime(lastUpdated);
  const values = [
    {
      key: "latitude",
      label: (
        <EditableTranslation
          defaultText="Latitude"
          translationKey="profile.location.latitude_label"
        />
      ),
      value: formatCoordinate(latitude),
    },
    {
      key: "longitude",
      label: (
        <EditableTranslation
          defaultText="Longitude"
          translationKey="profile.location.longitude_label"
        />
      ),
      value: formatCoordinate(longitude),
    },
    {
      key: "accuracy",
      label: (
        <EditableTranslation
          defaultText="Accuracy (m)"
          translationKey="profile.location.accuracy_label"
        />
      ),
      value:
        accuracy !== null && accuracy !== undefined ? String(Math.round(accuracy)) : "—",
    },
  ];

  return (
    <AccountSection
      action={
        <Button
          className="h-10 w-full cursor-pointer rounded-lg sm:w-auto"
          disabled={isSaving}
          onClick={handleCapture}
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
            <span className="flex items-center gap-2">
              <LocateFixed aria-hidden="true" className="size-4" />
              <EditableTranslation
                defaultText="Save current location"
                translationKey="profile.location.save_button"
              />
            </span>
          )}
        </Button>
      }
      description={
        <EditableTranslation
          defaultText="Save your current location to power nearby business searches. If your device already allows location, we capture it automatically; otherwise you can save it manually."
          translationKey="profile.location.description"
        />
      }
      icon={MapPin}
      id={id}
      title={
        <EditableTranslation
          defaultText="Location (optional)"
          translationKey="profile.location.title"
        />
      }
    >
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {values.map((item) => (
          <div className="min-w-0 rounded-xl bg-muted/50 px-3 py-3 sm:px-4" key={item.key}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="mt-1 truncate font-medium font-mono text-sm tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-sm">
        <span>
          <EditableTranslation
            defaultText="Last updated"
            translationKey="profile.location.last_updated_label"
          />
          :
        </span>
        <span className="font-medium text-foreground">
          {lastUpdatedLabel ??
            translate("profile.location.not_captured", "Not captured yet")}
        </span>
      </p>
      {status ? (
        <p aria-live="polite" className="mt-2 text-muted-foreground text-sm">
          {status}
        </p>
      ) : null}
    </AccountSection>
  );
}
