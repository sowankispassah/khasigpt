"use client";

import { useEffect, useState } from "react";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

type AddCreditsFormProps = {
  userId: string;
  creditsRemaining: number | null;
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

async function readErrorMessage(response: Response) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Unable to grant credits.";
}

async function grantCredits({
  credits,
  userId,
}: {
  credits: number;
  userId: string;
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
      throw new Error(await readErrorMessage(response));
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
}: AddCreditsFormProps) {
  const [creditInput, setCreditInput] = useState("");
  const [localCreditsRemaining, setLocalCreditsRemaining] =
    useState<number | null>(creditsRemaining);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalCreditsRemaining(creditsRemaining);
  }, [creditsRemaining]);

  const creditsLabel =
    localCreditsRemaining === null
      ? "Credits unavailable"
      : `${formatCredits(localCreditsRemaining)} credits available`;

  return (
    <form
      className="flex flex-nowrap items-center gap-2 whitespace-nowrap"
      onSubmit={async (event) => {
        event.preventDefault();
        if (isSaving) {
          return;
        }

        const credits = Number(creditInput);
        if (!(Number.isFinite(credits) && credits > 0)) {
          toast({
            description: "Enter a credit amount greater than zero.",
            type: "error",
          });
          return;
        }

        setIsSaving(true);
        try {
          const result = await grantCredits({ credits, userId });
          setLocalCreditsRemaining((current) =>
            result.creditsRemaining !== null
              ? result.creditsRemaining
              : current === null
                ? null
                : current + credits
          );
          setCreditInput("");
          toast({ description: "Credits granted", type: "success" });
        } catch (error) {
          toast({
            description:
              isAbortError(error)
                ? "Granting credits timed out. Please retry."
                : error instanceof Error
                ? error.message
                : "Unable to grant credits.",
            type: "error",
          });
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <div
        className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs"
        title={
          localCreditsRemaining === null
            ? "The latest balance could not be confirmed."
            : undefined
        }
      >
        <span>{creditsLabel}</span>
        <AdminUserCreditHistoryMenu userId={userId} />
      </div>
      <input
        aria-label="Credits to grant"
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
        min={0}
        name="credits"
        onChange={(event) => setCreditInput(event.target.value)}
        placeholder="Credits"
        required
        step="0.5"
        type="number"
        value={creditInput}
      />
      <Button disabled={isSaving} size="sm" type="submit" variant="secondary">
        {isSaving ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin">
              <LoaderIcon size={16} />
            </span>
            <span>Adding...</span>
          </span>
        ) : (
          "Add credits"
        )}
      </Button>
    </form>
  );
}
