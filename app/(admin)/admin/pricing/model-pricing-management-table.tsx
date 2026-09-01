"use client";

import type { ReactNode } from "react";
import { useState } from "react";

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
import { cn } from "@/lib/utils";

export type ModelPricingRow = {
  creditInputCharge: number | null;
  creditOutputCharge: number | null;
  customerInputChargeInr: number | null;
  customerOutputChargeInr: number | null;
  id: string;
  isEnabled: boolean;
  key: string;
  markupMultiplier: number;
  name: string;
  providerInputCostUsd: number | null;
  providerLabel: string;
  providerModelId: string;
  providerOutputCostUsd: number;
  type: "chat" | "image" | "live_voice";
  updatedAt: string | null;
};

export function ModelPricingSubmitButton() {
  const { translate } = useTranslation();
  return (
    <ActionSubmitButton
      pendingLabel={translate("common.saving", "Saving...")}
      type="submit"
    >
      {translate("admin.pricing.save_model_pricing", "Save model pricing")}
    </ActionSubmitButton>
  );
}

function formatCurrency(value: number | null, currency: "INR" | "USD") {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    currency,
    maximumFractionDigits: currency === "USD" ? 6 : 4,
    minimumFractionDigits: currency === "USD" ? 4 : 2,
    style: "currency",
  });
}

function formatCredits(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(date);
}

export function ModelPricingManagementTable({
  baseCreditValueInr,
  basePlanName,
  editForms,
  loadWarning = false,
  loading = false,
  models,
  modelsConfirmed,
}: {
  baseCreditValueInr: number | null;
  basePlanName: string | null;
  editForms: Record<string, ReactNode>;
  loadWarning?: boolean;
  loading?: boolean;
  models: ModelPricingRow[];
  modelsConfirmed: boolean;
}) {
  const { translate } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedModel =
    models.find((model) => model.key === selectedKey) ?? null;

  const typeLabel = (type: ModelPricingRow["type"]) => {
    if (type === "image") {
      return translate("admin.pricing.model_type.image", "Image");
    }
    if (type === "live_voice") {
      return translate("admin.pricing.model_type.live_voice", "Live voice");
    }
    return translate("admin.pricing.model_type.chat", "Chat");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-sm">
        <div>
          <p className="font-medium text-sm">
            {modelsConfirmed || models.length > 0
              ? translate(
                  "admin.pricing.model_count",
                  "{count} model pricing configurations"
                ).replace("{count}", String(models.length))
              : translate(
                  "admin.pricing.models_unavailable",
                  "Model pricing is unavailable"
                )}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {loading
              ? translate(
                  "admin.pricing.models_loading",
                  "Loading model costs and markups..."
                )
              : baseCreditValueInr !== null
                ? translate(
                    "admin.pricing.credit_conversion",
                    "Base conversion: ₹{value} per credit{plan}. Larger recharge packs remain bonus-credit packs."
                  )
                    .replace("{value}", baseCreditValueInr.toFixed(4))
                    .replace("{plan}", basePlanName ? ` · ${basePlanName}` : "")
                : translate(
                    "admin.pricing.credit_conversion_unavailable",
                    "Add an active recharge plan to preview model charges in credits."
                  )}
          </p>
        </div>
      </div>

      {loadWarning && !loading ? (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 text-amber-900 text-sm dark:bg-amber-950/20 dark:text-amber-100">
          {translate(
            "admin.pricing.models_partial",
            "Model pricing or exchange-rate details could not be confirmed. Available rows remain editable; retry before changing model costs."
          )}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border bg-card/80 shadow-sm">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 font-medium">
                {translate("admin.pricing.model", "Model")}
              </th>
              <th className="px-4 py-3 font-medium">
                {translate("admin.pricing.type", "Type")}
              </th>
              <th className="px-4 py-3 font-medium">
                {translate("admin.pricing.provider", "Provider")}
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {translate("admin.pricing.provider_cost", "Provider cost")}
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {translate("admin.pricing.markup", "Markup")}
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {translate("admin.pricing.customer_charge", "Customer charge")}
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {translate("admin.pricing.credit_charge", "Credit charge")}
              </th>
              <th className="px-4 py-3 font-medium">
                {translate("admin.pricing.status", "Status")}
              </th>
              <th className="px-4 py-3 font-medium">
                {translate("admin.pricing.last_updated", "Last updated")}
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {translate("admin.pricing.actions", "Actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>
                  {translate(
                    "admin.pricing.models_loading",
                    "Loading model costs and markups..."
                  )}
                </td>
              </tr>
            ) : !modelsConfirmed && models.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>
                  {translate(
                    "admin.pricing.models_retry",
                    "Model pricing could not be loaded. Recharge plans remain available; retry this page before changing model costs."
                  )}
                </td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={10}>
                  {translate(
                    "admin.pricing.models_empty",
                    "No configured models are available for pricing."
                  )}
                </td>
              </tr>
            ) : (
              models.map((model) => {
                const unitLabel =
                  model.type === "image"
                    ? translate("admin.pricing.per_output", "per output")
                    : translate("admin.pricing.per_million", "per 1M tokens");
                return (
                  <tr className="bg-card/70 transition hover:bg-muted/20" key={model.key}>
                    <td className="max-w-[250px] px-4 py-3">
                      <span className="font-medium">{model.name}</span>
                      <span className="block truncate font-mono text-muted-foreground text-xs">
                        {model.providerModelId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {typeLabel(model.type)}
                    </td>
                    <td className="px-4 py-3">{model.providerLabel}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {model.providerInputCostUsd !== null ? (
                        <span className="block">
                          {translate("admin.pricing.input", "Input")}: {formatCurrency(model.providerInputCostUsd, "USD")}
                        </span>
                      ) : null}
                      <span className="block">
                        {model.type === "image"
                          ? formatCurrency(model.providerOutputCostUsd, "USD")
                          : `${translate("admin.pricing.output", "Output")}: ${formatCurrency(model.providerOutputCostUsd, "USD")}`}
                      </span>
                      <span className="block text-muted-foreground">{unitLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {model.markupMultiplier.toFixed(2)}×
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {model.customerInputChargeInr !== null ? (
                        <span className="block">
                          {translate("admin.pricing.input", "Input")}: {formatCurrency(model.customerInputChargeInr, "INR")}
                        </span>
                      ) : null}
                      <span className="block">
                        {model.type === "image"
                          ? formatCurrency(model.customerOutputChargeInr, "INR")
                          : `${translate("admin.pricing.output", "Output")}: ${formatCurrency(model.customerOutputChargeInr, "INR")}`}
                      </span>
                      <span className="block text-muted-foreground">{unitLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {model.creditInputCharge !== null ? (
                        <span className="block">
                          {translate("admin.pricing.input", "Input")}: {formatCredits(model.creditInputCharge)}
                        </span>
                      ) : null}
                      <span className="block">
                        {model.type === "image"
                          ? formatCredits(model.creditOutputCharge)
                          : `${translate("admin.pricing.output", "Output")}: ${formatCredits(model.creditOutputCharge)}`}
                      </span>
                      <span className="block text-muted-foreground">{unitLabel}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          model.isEnabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {model.isEnabled
                          ? translate("admin.pricing.active", "Active")
                          : translate("admin.pricing.inactive", "Inactive")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                      {formatUpdatedAt(model.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        className="cursor-pointer"
                        onClick={() => setSelectedKey(model.key)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {translate("common.edit", "Edit")}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedKey(null);
          }
        }}
        open={selectedKey !== null}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {translate("admin.pricing.edit_model", "Edit model pricing")}
              {selectedModel ? ` · ${selectedModel.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "admin.pricing.edit_model_description",
                "Set the provider cost and customer markup for this model. Recharge-plan credits are converted automatically."
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedKey ? editForms[selectedKey] : null}
          <DialogFooter>
            <DialogClose className="cursor-pointer" type="button">
              {translate("common.close", "Close")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
