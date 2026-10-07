"use client";

import { useEffect, useState } from "react";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";

type AddCreditsFormProps = {
  userId: string;
  creditsRemaining: number | null;
  layout?: "inline" | "stacked";
  disabled?: boolean;
  /** Called with the new balance, or null when it could not be confirmed. */
  onCreditsAdded?: (creditsRemaining: number | null) => void;
};

const ADD_CREDITS_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatCredits(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

async function readErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

async function grantCredits({
  credits,
  userId,
  errorMessage,
}: {
  credits: number;
  userId: string;
  errorMessage: string;
}): Promise<{ creditsRemaining: number | null }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    ADD_CREDITS_TIMEOUT_MS
  );

  try {
    const response = await fetch(`/api/admin/users/${userId}/credits`, {
      body: JSON.stringify({ billingCycleDays: 90, credits }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, errorMessage));
    }

    const data = (await response.json().catch(() => null)) as
      | { creditsRemaining?: unknown }
      | null;

    return {
      creditsRemaining:
        typeof data?.creditsRemaining === "number"
          ? data.creditsRemaining
          : null,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function AddCreditsForm({
  userId,
  creditsRemaining,
  layout = "inline",
  disabled = false,
  onCreditsAdded,
}: AddCreditsFormProps) {
  const { translate } = useTranslation();
  const [creditInput, setCreditInput] = useState("");
  const [localCreditsRemaining, setLocalCreditsRemaining] =
    useState<number | null>(creditsRemaining);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalCreditsRemaining(creditsRemaining);
  }, [creditsRemaining]);

  return (
    <form
      className={layout === "stacked" ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" : "flex flex-nowrap items-center gap-2 whitespace-nowrap"}
      onSubmit={async (event) => {
        event.preventDefault();
        if (isSaving || disabled) {
          return;
        }

        const credits = Number(creditInput);
        if (!(Number.isFinite(credits) && credits > 0)) {
          toast({
            description: translate("admin.users.credits.invalid", "Enter a credit amount greater than zero."),
            type: "error",
          });
          return;
        }

        setIsSaving(true);
        try {
          const result = await grantCredits({ credits, userId, errorMessage: translate("admin.users.credits.error", "Unable to grant credits.") });
          const nextBalance =
            result.creditsRemaining !== null
              ? result.creditsRemaining
              : localCreditsRemaining === null
                ? null
                : localCreditsRemaining + credits;
          setLocalCreditsRemaining(nextBalance);
          setCreditInput("");
          toast({ description: translate("admin.users.credits.success", "Credits granted"), type: "success" });
          onCreditsAdded?.(nextBalance);
        } catch (error) {
          toast({
            description:
              isAbortError(error)
                ? translate("admin.users.credits.timeout", "Granting credits timed out. Please retry.")
                : error instanceof Error
                ? error.message
                : translate("admin.users.credits.error", "Unable to grant credits."),
            type: "error",
          });
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <div
        className={`flex flex-wrap items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs ${layout === "stacked" ? "col-span-2" : ""}`}
        title={
          localCreditsRemaining === null
            ? translate("admin.users.credits.unconfirmed", "The latest balance could not be confirmed.")
            : undefined
        }
      >
        <span>{localCreditsRemaining === null ? <EditableTranslation defaultText="Credits unavailable" description="User credit balance unavailable." translationKey="admin.users.credits.unavailable" /> : <EditableTranslation defaultText="{credits} credits available" description="User available credit balance." translationKey="admin.users.credits.available" values={{ credits: formatCredits(localCreditsRemaining) }} />}</span>
        {layout === "inline" ? <AdminUserCreditHistoryMenu userId={userId} /> : null}
      </div>
      {layout === "stacked" ? <div className="col-span-2 text-muted-foreground text-xs" id={`credits-label-${userId}`}><EditableTranslation defaultText="Credits to grant" description="Admin credit grant input label." translationKey="admin.users.credits.input" /></div> : null}
      <input
        aria-label={translate("admin.users.credits.input", "Credits to grant")}
        aria-labelledby={layout === "stacked" ? `credits-label-${userId}` : undefined}
        className={`h-8 rounded-md border border-input bg-background px-2 text-sm ${layout === "stacked" ? "w-full min-w-0" : "w-24"}`}
        disabled={disabled || isSaving}
        id={`credits-${userId}`}
        min={0}
        name="credits"
        onChange={(event) => setCreditInput(event.target.value)}
        placeholder={translate("admin.users.credits.placeholder", "Credits")}
        required
        step="0.5"
        type="number"
        value={creditInput}
      />
      <Button className="cursor-pointer" disabled={disabled || isSaving} size="sm" type="submit" variant="secondary">
        {isSaving ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <EditableTranslation defaultText="Adding..." description="Admin credit grant pending button." translationKey="admin.users.credits.adding" />
          </span>
        ) : (
          <EditableTranslation defaultText="Add credits" description="Admin credit grant submit button." translationKey="admin.users.credits.add" />
        )}
      </Button>
    </form>
  );
}
