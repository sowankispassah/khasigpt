"use client";

import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { deletePricingPlanAction } from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const DEFAULT_VISIBLE_ROWS = 10;

type PricingPlanRow = {
  billingCycleDays: number;
  credits: number;
  deletedAt: string | null;
  description: string | null;
  effectivePerMillionInr: number | null;
  effectivePerMillionUsd: number | null;
  id: string;
  isActive: boolean;
  isRecommended: boolean;
  marginPercent: number | null;
  name: string;
  priceInPaise: number;
  providerInputCostUsd: number | null;
  providerOutputCostUsd: number | null;
  tokenAllowance: number;
  userCreditCostInr: number | null;
  updatedAt: string | null;
};

function formatCurrency(value: number | null, currency: "INR" | "USD") {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    currency,
    maximumFractionDigits: currency === "USD" ? 6 : 2,
    minimumFractionDigits: currency === "USD" ? 4 : 2,
    style: "currency",
  });
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(date);
}

export function PricingManagementTable({
  referenceModelName,
  createForm,
  deletedForms,
  detailsLoading = false,
  editForms,
  modelCostsConfirmed,
  plans,
  plansConfirmed,
}: {
  referenceModelName: string | null;
  createForm: ReactNode;
  deletedForms: Record<string, ReactNode>;
  detailsLoading?: boolean;
  editForms: Record<string, ReactNode>;
  modelCostsConfirmed: boolean;
  plans: PricingPlanRow[];
  plansConfirmed: boolean;
}) {
  const { translate } = useTranslation();
  const [dialogMode, setDialogMode] = useState<"create" | "delete" | "edit" | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [visiblePlanCount, setVisiblePlanCount] = useState(DEFAULT_VISIBLE_ROWS);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const visiblePlans = plans.slice(0, visiblePlanCount);
  const hasMorePlans = visiblePlanCount < plans.length;

  function openCreate() {
    setSelectedPlanId(null);
    setDialogMode("create");
  }

  function openEdit(planId: string) {
    setSelectedPlanId(planId);
    setDialogMode("edit");
  }

  function openDelete(planId: string) {
    setSelectedPlanId(planId);
    setDialogMode("delete");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-sm">
        <div>
          <p className="font-medium text-sm">
            {plansConfirmed
              ? `${plans.length} pricing ${plans.length === 1 ? "configuration" : "configurations"}`
              : "Pricing configurations are unavailable"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {detailsLoading
              ? "Loading provider costs and editing details..."
              : referenceModelName
                ? `Margin preview uses the default model: ${referenceModelName}.`
                : "Margin preview is unavailable until an enabled model cost is configured."}
          </p>
        </div>
        <Button className="cursor-pointer" onClick={openCreate} type="button">+ Add Pricing</Button>
      </div>

      {plansConfirmed && !detailsLoading && !modelCostsConfirmed ? <p className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 text-amber-900 text-sm dark:bg-amber-950/20 dark:text-amber-100">Provider cost data could not be confirmed. Plans remain editable; margin values are shown as unavailable.</p> : null}

      <div className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">Pricing / model</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Base credits</th>
              <th className="px-4 py-3 text-right font-medium">Provider input / 1M</th>
              <th className="px-4 py-3 text-right font-medium">Provider output / 1M</th>
              <th className="px-4 py-3 text-right font-medium">Effective / 1M</th>
              <th className="px-4 py-3 text-right font-medium">User credit cost</th>
              <th className="px-4 py-3 text-right font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last updated</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {!plansConfirmed ? (
              <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={12}>Pricing plans could not be loaded. Retry the page before changing values.</td></tr>
            ) : plans.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={12}>No pricing configurations yet. Add a plan to get started.</td></tr>
            ) : visiblePlans.map((plan) => (
              <tr className="bg-card/70 transition hover:bg-muted/20" key={plan.id}>
                <td className="max-w-[230px] px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{plan.name}</span>
                    {plan.description ? <span className="line-clamp-2 text-muted-foreground text-xs">{plan.description}</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">Recharge plan</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(plan.priceInPaise / 100, "INR")}</td>
                <td className="px-4 py-3 text-right">{plan.credits.toLocaleString()}<span className="block text-muted-foreground text-xs">{plan.tokenAllowance.toLocaleString()} tokens</span></td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatCurrency(plan.providerInputCostUsd, "USD")}</td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatCurrency(plan.providerOutputCostUsd, "USD")}</td>
                <td className="px-4 py-3 text-right"><span className="font-medium">{formatCurrency(plan.effectivePerMillionInr, "INR")}</span><span className="block text-muted-foreground text-xs">{formatCurrency(plan.effectivePerMillionUsd, "USD")}</span></td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(plan.userCreditCostInr, "INR")}</td>
                <td className={cn("px-4 py-3 text-right font-medium", plan.marginPercent === null ? "text-muted-foreground" : plan.marginPercent >= 0 ? "text-emerald-600" : "text-destructive")}>{plan.marginPercent === null ? "—" : `${plan.marginPercent.toFixed(2)}%`}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><span className={cn("rounded-full px-2 py-0.5 text-xs", plan.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>{plan.isActive ? "Active" : "Inactive"}</span>{plan.isRecommended ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">Recommended</span> : null}</div></td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{formatUpdatedAt(plan.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-label={translate("admin.pricing.plan_actions", "Pricing plan actions")} className="cursor-pointer" disabled={detailsLoading} size="icon" type="button" variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="cursor-pointer" onSelect={() => openEdit(plan.id)}>{translate("admin.pricing.edit_plan", "Edit pricing")}</DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={() => openDelete(plan.id)}>{translate("admin.pricing.delete_plan", "Delete pricing")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        {plans.length > DEFAULT_VISIBLE_ROWS ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
            <span aria-live="polite" className="text-muted-foreground text-xs">
              {translate("admin.pricing.showing_rows", "Showing {visible} of {total}")
                .replace("{visible}", String(visiblePlans.length))
                .replace("{total}", String(plans.length))}
            </span>
            {hasMorePlans ? (
              <Button
                className="cursor-pointer"
                onClick={() =>
                  setVisiblePlanCount((count) =>
                    Math.min(count + DEFAULT_VISIBLE_ROWS, plans.length)
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {translate("admin.pricing.load_more", "Load more")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {Object.keys(deletedForms).length > 0 ? <section className="rounded-xl border bg-card/80 p-4 shadow-sm"><h2 className="font-semibold text-sm">Deleted pricing configurations</h2><div className="mt-3 grid gap-2">{Object.entries(deletedForms).map(([planId, form]) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm" key={planId}><span className="text-muted-foreground">Soft-deleted plan</span>{form}</div>)}</div></section> : null}

      <Dialog onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelectedPlanId(null); } }} open={dialogMode === "create" || dialogMode === "edit"}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add pricing" : `Edit ${selectedPlan?.name ?? "pricing"}`}</DialogTitle>
            <DialogDescription>{dialogMode === "create" ? "Create a recharge tier using the existing pricing validation and calculations." : "Update the pricing configuration and preserve the existing credit and margin calculations."}</DialogDescription>
          </DialogHeader>
          {dialogMode === "create" ? createForm : selectedPlanId ? editForms[selectedPlanId] : null}
          <DialogFooter><DialogClose className="cursor-pointer" type="button">Close</DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelectedPlanId(null); } }} open={dialogMode === "delete"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("admin.pricing.delete_plan_title", "Delete pricing plan?")}</DialogTitle>
            <DialogDescription>
              {selectedPlan
                ? translate("admin.pricing.delete_plan_named_description", "Delete {name} from the available recharge plans? The record can still be permanently removed from the deleted pricing configurations section.").replace("{name}", selectedPlan.name)
                : translate("admin.pricing.delete_plan_description", "Delete this recharge plan? The record can still be permanently removed from the deleted pricing configurations section.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="cursor-pointer" type="button">{translate("common.cancel", "Cancel")}</DialogClose>
            {selectedPlan ? (
              <form action={deletePricingPlanAction}>
                <input name="id" type="hidden" value={selectedPlan.id} />
                <ActionSubmitButton pendingLabel={translate("common.deleting", "Deleting...")} type="submit" variant="destructive">{translate("admin.pricing.delete_plan", "Delete pricing")}</ActionSubmitButton>
              </form>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
