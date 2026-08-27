"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

const ACTIVE_IMAGE_MODEL_ENDPOINT =
  "/api/admin/settings/image-models/active";
const ACTIVATION_TIMEOUT_MS = 12_000;
const RECONCILIATION_TIMEOUT_MS = 8000;

type ImageModelActivationContextValue = {
  activeId: string | null;
  pendingId: string | null;
  setActiveId: (id: string | null) => void;
  setPendingId: (id: string | null) => void;
};

const ImageModelActivationContext =
  createContext<ImageModelActivationContextValue | null>(null);

function useImageModelActivation() {
  const value = useContext(ImageModelActivationContext);
  if (!value) {
    throw new Error(
      "Image model activation controls must be inside their provider."
    );
  }
  return value;
}

async function requestActiveImageModel(
  options: { imageModelId: string } | null,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort("request_timeout"),
    timeoutMs
  );

  try {
    const response = await fetch(ACTIVE_IMAGE_MODEL_ENDPOINT, {
      method: options ? "POST" : "GET",
      headers: options ? { "content-type": "application/json" } : undefined,
      body: options ? JSON.stringify(options) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error("request_failed");
    }

    const activeImageModelId =
      body && typeof body === "object" && "activeImageModelId" in body
        ? (body as { activeImageModelId?: unknown }).activeImageModelId
        : null;
    if (activeImageModelId === null || typeof activeImageModelId === "string") {
      return activeImageModelId;
    }
    throw new Error("invalid_response");
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function ImageModelActivationProvider({
  children,
  initialActiveId,
}: {
  children: ReactNode;
  initialActiveId: string | null;
}) {
  const [activeId, setActiveId] = useState(initialActiveId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ activeId, pendingId, setActiveId, setPendingId }),
    [activeId, pendingId]
  );

  return (
    <ImageModelActivationContext.Provider value={value}>
      {children}
    </ImageModelActivationContext.Provider>
  );
}

export function ImageModelActiveBadge({ modelId }: { modelId: string }) {
  const { activeId } = useImageModelActivation();
  const { translate } = useTranslation();

  if (activeId !== modelId) {
    return null;
  }

  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
      {translate("admin.settings.image_model.active", "Active")}
    </span>
  );
}

export function ImageModelActivationButton({ modelId }: { modelId: string }) {
  const { activeId, pendingId, setActiveId, setPendingId } =
    useImageModelActivation();
  const { translate } = useTranslation();
  const isPending = pendingId === modelId;
  const activationInProgress = pendingId !== null;

  if (activeId === modelId) {
    return null;
  }

  const activate = async () => {
    if (activationInProgress) {
      return;
    }

    setPendingId(modelId);
    try {
      let confirmedActiveId: string | null;
      try {
        confirmedActiveId = await requestActiveImageModel(
          { imageModelId: modelId },
          ACTIVATION_TIMEOUT_MS
        );
      } catch (error) {
        if (!(error instanceof Error && error.message === "request_timeout")) {
          throw error;
        }
        confirmedActiveId = await requestActiveImageModel(
          null,
          RECONCILIATION_TIMEOUT_MS
        );
      }

      if (confirmedActiveId !== modelId) {
        throw new Error("activation_not_confirmed");
      }

      setActiveId(confirmedActiveId);
      toast({
        type: "success",
        description: translate(
          "admin.settings.image_model.activated",
          "Active image model updated."
        ),
      });
    } catch (error) {
      console.error("[admin/settings/image-models] Activation failed.", error);
      toast({
        type: "error",
        description: translate(
          "admin.settings.image_model.activate_error",
          "The active image model could not be updated. Please refresh and try again."
        ),
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Button
      className="cursor-pointer"
      disabled={activationInProgress}
      onClick={() => void activate()}
      size="sm"
      type="button"
      variant="outline"
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>
            {translate(
              "admin.settings.image_model.activating",
              "Updating..."
            )}
          </span>
        </span>
      ) : (
        translate("admin.settings.image_model.activate", "Set as active")
      )}
    </Button>
  );
}
