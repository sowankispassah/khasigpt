"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { updateUserLocationAction } from "./actions";

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
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hasAutoCapturedRef = useRef(false);

  const handleCapture = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("Geolocation is not available in this browser.");
      return;
    }

    setStatus("Requesting your location (optional)...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        startTransition(async () => {
          const result = await updateUserLocationAction({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          if (result.success) {
            setStatus("Location saved.");
          } else {
            setStatus(result.error ?? "Failed to save location.");
          }
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("Location permission denied. You can enable it later when needed.");
        } else {
          setStatus("Unable to get location. Please try again later.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (hasAutoCapturedRef.current) {
      return;
    }
    hasAutoCapturedRef.current = true;
    if (typeof navigator === "undefined" || !navigator.permissions || !navigator.geolocation) {
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state !== "granted") {
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            startTransition(async () => {
              await updateUserLocationAction({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
              });
              setStatus("Location captured automatically.");
            });
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
  }, [startTransition]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Location (optional)</h2>
          <p className="text-muted-foreground text-sm">
            Save your current location to power nearby business searches. If your device already
            allows location, we capture it automatically; otherwise you can save it manually.
          </p>
        </div>
        <Button
          onClick={handleCapture}
          disabled={isPending}
          variant="outline"
          size="sm"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </span>
          ) : (
            "Save current location"
          )}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-xs uppercase text-muted-foreground">Latitude</p>
          <p className="font-mono">{initialLatitude ?? "—"}</p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-xs uppercase text-muted-foreground">Longitude</p>
          <p className="font-mono">{initialLongitude ?? "—"}</p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-xs uppercase text-muted-foreground">Accuracy (m)</p>
          <p className="font-mono">
            {initialAccuracy !== null && initialAccuracy !== undefined
              ? Math.round(initialAccuracy)
              : "—"}
          </p>
        </div>
        <div className="rounded-md border border-dashed px-3 py-2 text-sm">
          <p className="text-xs uppercase text-muted-foreground">Last updated</p>
          <p className="font-mono">
            {updatedAt ? new Date(updatedAt).toLocaleString() : "Not captured yet"}
          </p>
        </div>
      </div>

      {status ? (
        <p className="mt-3 text-sm text-muted-foreground">{status}</p>
      ) : null}
    </section>
  );
}
