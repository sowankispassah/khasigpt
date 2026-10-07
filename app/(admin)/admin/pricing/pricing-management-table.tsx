"use client";

import { ChevronDown, MoreVertical, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { deletePricingPlanAction } from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminNotice, AdminStatusPill } from "@/components/admin/admin-ui";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

const DEFAULT_VISIBLE_ROWS = 10;

type PricingPlanRow = {
  billingCycleDays: number;
  credits: number;
  customerInputPerMillionInr: number | null;
  customerOutputPerMillionInr: number | null;
  deletedAt: string | null;
  description: string | null;
  id: string;
  isActive: boolean;
  isRecommended: boolean;
  marginPercent: number | null;
  name: string;
  priceInPaise: number;
  providerInputCostUsd: number | null;
  providerOutputCostUsd: number | null;
  realizedMarkup: number | null;
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

function MarginPill({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <AdminStatusPill tone={value >= 0 ? "success" : "danger"}>
      {value.toFixed(2)}%
    </AdminStatusPill>
  );
}

function PlanStatusPills({ plan }: { plan: PricingPlanRow }) {
  return (
    <>
      <AdminStatusPill tone={plan.isActive ? "success" : "neutral"}>
        {plan.isActive ? "Active" : "Inactive"}
      </AdminStatusPill>
      {plan.isRecommended ? (
        <AdminStatusPill tone="info">Recommended</AdminStatusPill>
      ) : null}
    </>
  );
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

  const planActions = (plan: PricingPlanRow) => (
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
  );

  const emptyMessage = !plansConfirmed
    ? "Pricing plans could not be loaded. Retry the page before changing values."
    : "No pricing configurations yet. Add a plan to get started.";

  return (
    <div className="flex flex-col gap-4">
      <Collapsible className="overflow-hidden rounded-xl border bg-card shadow-xs" defaultOpen={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <CollapsibleTrigger asChild>
            <button
              aria-label={translate(
                "admin.pricing.toggle_pricing_plans",
                "Show or hide pricing plans"
              )}
              className="group flex min-w-0 flex-1 basis-full cursor-pointer items-center gap-3 rounded-lg text-left sm:basis-0"
              type="button"
            >
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              <div className="min-w-0">
                <p className="font-semibold text-base">
                  {plansConfirmed
                    ? `${plans.length} pricing ${plans.length === 1 ? "configuration" : "configurations"}`
                    : "Pricing configurations are unavailable"}
                </p>
                <p className="mt-0.5 text-muted-foreground text-sm">
                  {detailsLoading
                    ? "Loading provider costs and editing details..."
                    : referenceModelName
                      ? `Margin preview uses the default model: ${referenceModelName}. Credits are charged at the base plan rate, so bonus credits lower the realized markup.`
                      : "Margin preview is unavailable until an enabled model cost is configured."}
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <Button className="ml-8 cursor-pointer sm:ml-0" onClick={openCreate} type="button">
            <Plus className="size-4" />
            Add pricing
          </Button>
        </div>

        {plansConfirmed && !detailsLoading && !modelCostsConfirmed ? (
          <div className="px-5 pb-4">
            <AdminNotice>Provider cost data could not be confirmed. Plans remain editable; margin values are shown as unavailable.</AdminNotice>
          </div>
        ) : null}

        <CollapsibleContent>
          <div className="border-t">
            <ul className="divide-y divide-border/60 md:hidden">
              {!plansConfirmed || plans.length === 0 ? (
                <li className="px-5 py-8 text-center text-muted-foreground text-sm">{emptyMessage}</li>
              ) : visiblePlans.map((plan) => (
                <li className="flex items-start justify-between gap-3 px-5 py-4" key={plan.id}>
                  <div className="min-w-0 space-y-1.5">
                    <p className="font-medium">{plan.name}</p>
                    <div className="flex flex-wrap gap-1.5"><PlanStatusPills plan={plan} /></div>
                    <p className="text-sm tabular-nums">
                      {formatCurrency(plan.priceInPaise / 100, "INR")}
                      <span className="text-muted-foreground"> · {plan.credits.toLocaleString()} credits · {formatCurrency(plan.userCreditCostInr, "INR")} each</span>
                    </p>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>Margin</span>
                      <MarginPill value={plan.marginPercent} />
                    </div>
                  </div>
                  {planActions(plan)}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Plan</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Per credit</th>
                    <th className="px-4 py-2.5 text-right font-medium">Customer price / 1M (in / out)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Provider cost / 1M (in / out)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Margin</th>
                    <th className="px-4 py-2.5 font-medium">Last updated</th>
                    <th className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {!plansConfirmed || plans.length === 0 ? (
                    <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>{emptyMessage}</td></tr>
                  ) : visiblePlans.map((plan) => (
                    <tr className="transition hover:bg-muted/30" key={plan.id}>
                      <td className="max-w-[260px] px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-medium">{plan.name}</span>
                          <div className="flex flex-wrap gap-1.5"><PlanStatusPills plan={plan} /></div>
                          {plan.description ? <span className="line-clamp-2 text-muted-foreground text-xs">{plan.description}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="font-medium">{formatCurrency(plan.priceInPaise / 100, "INR")}</span>
                        <span className="block text-muted-foreground text-xs">{plan.credits.toLocaleString()} credits</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(plan.userCreditCostInr, "INR")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className="font-medium">{formatCurrency(plan.customerInputPerMillionInr, "INR")} / {formatCurrency(plan.customerOutputPerMillionInr, "INR")}</span>
                        <span className="block text-muted-foreground text-xs">{plan.realizedMarkup === null ? "—" : `${plan.realizedMarkup.toFixed(2)}x realized markup`}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
                        {formatCurrency(plan.providerInputCostUsd, "USD")}
                        <span className="block">{formatCurrency(plan.providerOutputCostUsd, "USD")}</span>
                      </td>
                      <td className="px-4 py-3 text-right"><MarginPill value={plan.marginPercent} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{formatUpdatedAt(plan.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">{planActions(plan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plans.length > DEFAULT_VISIBLE_ROWS ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
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
        </CollapsibleContent>
      </Collapsible>

      {Object.keys(deletedForms).length > 0 ? (
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="border-b px-5 py-3">
            <h3 className="font-semibold text-sm">Deleted pricing configurations</h3>
            <p className="mt-0.5 text-muted-foreground text-xs">Soft-deleted plans keep their history until you remove them permanently.</p>
          </div>
          <ul className="divide-y divide-border/60">
            {Object.entries(deletedForms).map(([planId, form]) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm" key={planId}>
                <span className="text-muted-foreground">Soft-deleted plan</span>
                {form}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
