"use client";

import { useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PlanPricingFields } from "./plan-pricing-fields";

type ModelCostPreview = {
  id: string;
  isMarginBaseline: boolean;
  name: string;
  providerCostPerMillionInr: number;
  providerCostPerMillionUsd: number;
  providerLabel: string;
};

type PricingPlanForEdit = {
  androidProductId: string | null;
  billingCycleDays: number;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  priceInPaise: number;
  tokenAllowance: number;
};

export function PricingPlanEditForm({
  modelCosts,
  plan,
  usdToInr,
}: {
  modelCosts: ModelCostPreview[];
  plan: PricingPlanForEdit;
  usdToInr: number;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/pricing-plans/${plan.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name")?.toString() ?? "",
          description: formData.get("description")?.toString() ?? "",
          androidProductId:
            formData.get("androidProductId")?.toString().trim() || null,
          priceInRupees: formData.get("priceInRupees")?.toString() ?? "0",
          tokenAllowance: formData.get("tokenAllowance")?.toString() ?? "0",
          billingCycleDays: formData.get("billingCycleDays")?.toString() ?? "0",
          isActive: formData.get("isActive") === "on",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const error =
          typeof payload?.error === "string"
            ? payload.error.replaceAll("_", " ")
            : "Unable to save pricing plan.";
        throw new Error(error);
      }

      toast({ type: "success", description: "Plan updated" });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Unable to save pricing plan.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`plan-update-name-${plan.id}`}
        >
          Plan name (English)
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={plan.name}
          id={`plan-update-name-${plan.id}`}
          name="name"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`plan-update-description-${plan.id}`}
        >
          Description (English)
        </label>
        <textarea
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={plan.description ?? ""}
          id={`plan-update-description-${plan.id}`}
          name="description"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`plan-update-android-product-id-${plan.id}`}
        >
          Android product id
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={plan.androidProductId ?? ""}
          id={`plan-update-android-product-id-${plan.id}`}
          name="androidProductId"
          placeholder="khasigpt_starter"
        />
        <p className="text-muted-foreground text-xs">
          Must exactly match the in-app product id configured in Google Play
          Console.
        </p>
      </div>
      <div className="space-y-3">
        <PlanPricingFields
          initialPriceInRupees={plan.priceInPaise / 100}
          initialTokenAllowance={plan.tokenAllowance}
          modelCosts={modelCosts}
          usdToInr={usdToInr}
        />
        <p className="text-muted-foreground text-xs">
          Display credits are calculated automatically.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:w-48">
        <label
          className="font-medium text-sm"
          htmlFor={`plan-cycle-${plan.id}`}
        >
          Cycle (days)
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          defaultValue={plan.billingCycleDays}
          id={`plan-cycle-${plan.id}`}
          min={0}
          name="billingCycleDays"
          type="number"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          className="h-4 w-4"
          defaultChecked={plan.isActive}
          id={`plan-active-${plan.id}`}
          name="isActive"
          type="checkbox"
        />
        <label
          className="font-medium text-sm"
          htmlFor={`plan-active-${plan.id}`}
        >
          Plan is active
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button disabled={isSaving} type="submit">
          {isSaving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>Saving...</span>
            </span>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
