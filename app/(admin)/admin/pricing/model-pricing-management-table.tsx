"use client";

import { ChevronDown, MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  deleteImageModelConfigAction,
  deleteLiveVoiceModelConfigAction,
  deleteModelConfigAction,
  hardDeleteImageModelConfigAction,
  hardDeleteLiveVoiceModelConfigAction,
  hardDeleteModelConfigAction,
  setActiveImageModelConfigAction,
  setDefaultLiveVoiceModelConfigAction,
  setDefaultModelConfigAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
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
import { cn } from "@/lib/utils";

const DEFAULT_VISIBLE_ROWS = 10;

export type ModelType = "chat" | "image" | "live_voice";

export type ModelPricingRow = {
  creditInputCharge: number | null;
  creditOutputCharge: number | null;
  customerInputChargeInr: number | null;
  customerOutputChargeInr: number | null;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  isEnabled: boolean;
  key: string;
  markupMultiplier: number;
  name: string;
  providerInputCostUsd: number | null;
  providerLabel: string;
  providerModelId: string;
  providerOutputCostUsd: number;
  type: ModelType;
  updatedAt: string | null;
};

export type DeletedModelRow = {
  deletedAt: string | null;
  id: string;
  key: string;
  name: string;
  type: ModelType;
};

function formatCurrency(value: number | null, currency: "INR" | "USD") {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    currency,
    maximumFractionDigits: currency === "USD" ? 6 : 4,
    minimumFractionDigits: currency === "USD" ? 4 : 2,
    style: "currency",
  });
}

function formatCredits(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(date);
}

function ModelActionForm({ action, id, label, pendingLabel }: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label: string;
  pendingLabel: string;
}) {
  return (
    <form action={action}>
      <input name="id" type="hidden" value={id} />
      <ActionSubmitButton className="h-auto w-full cursor-pointer justify-start rounded-sm px-2 py-1.5 font-normal" pendingLabel={pendingLabel} size="sm" type="submit" variant="ghost">
        {label}
      </ActionSubmitButton>
    </form>
  );
}

export function ModelPricingManagementTable({
  baseCreditValueInr,
  basePlanName,
  createForms,
  deletedModels,
  editForms,
  loadWarning = false,
  loading = false,
  modelSettings,
  models,
  modelsConfirmed,
}: {
  baseCreditValueInr: number | null;
  basePlanName: string | null;
  createForms: Record<ModelType, ReactNode>;
  deletedModels: DeletedModelRow[];
  editForms: Record<string, ReactNode>;
  loadWarning?: boolean;
  loading?: boolean;
  modelSettings?: ReactNode;
  models: ModelPricingRow[];
  modelsConfirmed: boolean;
}) {
  const { translate } = useTranslation();
  const [dialogMode, setDialogMode] = useState<"create" | "delete" | "edit" | "hard-delete" | null>(null);
  const [createType, setCreateType] = useState<ModelType>("chat");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [visibleModelCounts, setVisibleModelCounts] = useState<
    Record<ModelType, number>
  >({ chat: DEFAULT_VISIBLE_ROWS, image: DEFAULT_VISIBLE_ROWS, live_voice: DEFAULT_VISIBLE_ROWS });
  const selectedModel = models.find((model) => model.key === selectedKey) ?? null;
  const selectedDeletedModel = deletedModels.find((model) => model.key === selectedKey) ?? null;
  const modelTypes: ModelType[] = ["chat", "image", "live_voice"];

  const typeLabel = (type: ModelType) =>
    type === "image"
      ? translate("admin.pricing.model_type.image", "Image")
      : type === "live_voice"
        ? translate("admin.pricing.model_type.live_voice", "Live voice")
        : translate("admin.pricing.model_type.chat", "Text / chat");

  const sectionTitle = (type: ModelType) =>
    type === "image"
      ? translate("admin.pricing.image_models", "Image models")
      : type === "live_voice"
        ? translate("admin.pricing.voice_models", "Voice models")
        : translate("admin.pricing.chat_models", "Chat models");

  const addModelLabel = (type: ModelType) =>
    type === "image"
      ? translate("admin.pricing.add_image_model", "+ Add image model")
      : type === "live_voice"
        ? translate("admin.pricing.add_voice_model", "+ Add voice model")
        : translate("admin.pricing.add_chat_model", "+ Add chat model");

  const hasCompletePricing = (model: ModelPricingRow) =>
    model.providerOutputCostUsd > 0 &&
    (model.type === "image" || Number(model.providerInputCostUsd ?? 0) > 0);

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedKey(null);
  };

  const deleteAction = selectedModel?.type === "image"
    ? deleteImageModelConfigAction
    : selectedModel?.type === "live_voice"
      ? deleteLiveVoiceModelConfigAction
      : deleteModelConfigAction;
  const hardDeleteAction = selectedDeletedModel?.type === "image"
    ? hardDeleteImageModelConfigAction
    : selectedDeletedModel?.type === "live_voice"
      ? hardDeleteLiveVoiceModelConfigAction
      : hardDeleteModelConfigAction;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-sm">
        <div>
          <p className="font-medium text-sm">
            {modelsConfirmed || models.length > 0
              ? translate("admin.pricing.model_count", "{count} model configurations").replace("{count}", String(models.length))
              : translate("admin.pricing.models_unavailable", "Model pricing is unavailable")}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {loading
              ? translate("admin.pricing.models_loading", "Loading model costs and markups...")
              : baseCreditValueInr !== null
                ? translate("admin.pricing.credit_conversion", "Base conversion: ₹{value} per credit{plan}. Larger recharge packs remain bonus-credit packs.")
                    .replace("{value}", baseCreditValueInr.toFixed(4))
                    .replace("{plan}", basePlanName ? ` · ${basePlanName}` : "")
                : translate("admin.pricing.credit_conversion_unavailable", "Add an active recharge plan to preview model charges in credits.")}
          </p>
        </div>
      </div>

      {loadWarning && !loading ? (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 text-amber-900 text-sm dark:bg-amber-950/20 dark:text-amber-100">
          {translate("admin.pricing.models_partial", "Model pricing or exchange-rate details could not be confirmed. Available rows remain editable; retry before changing model costs.")}
        </p>
      ) : null}

      {modelTypes.map((type) => {
        const typeModels = models.filter((model) => model.type === type);
        const visibleModels = typeModels.slice(0, visibleModelCounts[type]);
        const hasMoreModels = visibleModelCounts[type] < typeModels.length;
        return (
          <Collapsible
            className="overflow-hidden rounded-xl border bg-card/80 shadow-sm"
            defaultOpen={false}
            key={type}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <CollapsibleTrigger asChild>
                <button
                  aria-label={translate(
                    "admin.pricing.toggle_model_section",
                    "Show or hide {section}"
                  ).replace("{section}", sectionTitle(type))}
                  className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg text-left"
                  type="button"
                >
                  <div>
                    <h3 className="font-semibold">{sectionTitle(type)}</h3>
                    <p className="text-muted-foreground text-xs">
                      {translate("admin.pricing.model_type_count", "{count} configured")
                        .replace("{count}", String(typeModels.length))}
                    </p>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <Button
                className="cursor-pointer"
                disabled={loading || !modelsConfirmed}
                onClick={() => {
                  setCreateType(type);
                  setDialogMode("create");
                }}
                type="button"
              >
                {addModelLabel(type)}
              </Button>
            </div>
            <CollapsibleContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">{translate("admin.pricing.model", "Model")}</th>
                    <th className="px-4 py-3 font-medium">{translate("admin.pricing.provider", "Provider")}</th>
                    <th className="px-4 py-3 text-right font-medium">{translate("admin.pricing.provider_cost", "Provider cost")}</th>
                    <th className="px-4 py-3 text-right font-medium">{translate("admin.pricing.markup", "Markup")}</th>
                    <th className="px-4 py-3 text-right font-medium">{translate("admin.pricing.customer_charge", "Customer charge")}</th>
                    <th className="px-4 py-3 text-right font-medium">{translate("admin.pricing.credit_charge", "Credit charge")}</th>
                    <th className="px-4 py-3 font-medium">{translate("admin.pricing.status", "Status")}</th>
                    <th className="px-4 py-3 font-medium">{translate("admin.pricing.last_updated", "Last updated")}</th>
                    <th className="px-4 py-3 text-right font-medium">{translate("admin.pricing.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {loading ? (
                    <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>{translate("admin.pricing.models_loading", "Loading model costs and markups...")}</td></tr>
                  ) : !modelsConfirmed && models.length === 0 ? (
                    <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>{translate("admin.pricing.models_retry", "Model pricing could not be loaded. Recharge plans remain available; retry this page before changing model costs.")}</td></tr>
                  ) : typeModels.length === 0 ? (
                    <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>{translate("admin.pricing.model_type_empty", "No {type} models are configured. Use the add button above to create one.").replace("{type}", typeLabel(type).toLowerCase())}</td></tr>
                  ) : visibleModels.map((model) => {
                    const pricingComplete = hasCompletePricing(model);
                    const unitLabel = model.type === "image" ? translate("admin.pricing.per_output", "per output") : translate("admin.pricing.per_million", "per 1M tokens");
                    return (
                      <tr className="bg-card/70 transition hover:bg-muted/20" key={model.key}>
                        <td className="max-w-[250px] px-4 py-3"><span className="font-medium">{model.name}</span><span className="block truncate font-mono text-muted-foreground text-xs">{model.providerModelId}</span></td>
                        <td className="px-4 py-3">{model.providerLabel}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          {model.providerInputCostUsd !== null ? <span className="block">{translate("admin.pricing.input", "Input")}: {formatCurrency(model.providerInputCostUsd, "USD")}</span> : null}
                          <span className="block">{model.type === "image" ? formatCurrency(model.providerOutputCostUsd, "USD") : `${translate("admin.pricing.output", "Output")}: ${formatCurrency(model.providerOutputCostUsd, "USD")}`}</span>
                          <span className="block text-muted-foreground">{unitLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{model.markupMultiplier.toFixed(2)}×</td>
                        <td className="px-4 py-3 text-right text-xs">
                          {model.customerInputChargeInr !== null ? <span className="block">{translate("admin.pricing.input", "Input")}: {formatCurrency(model.customerInputChargeInr, "INR")}</span> : null}
                          <span className="block">{model.type === "image" ? formatCurrency(model.customerOutputChargeInr, "INR") : `${translate("admin.pricing.output", "Output")}: ${formatCurrency(model.customerOutputChargeInr, "INR")}`}</span>
                          <span className="block text-muted-foreground">{unitLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {model.creditInputCharge !== null ? <span className="block">{translate("admin.pricing.input", "Input")}: {formatCredits(model.creditInputCharge)}</span> : null}
                          <span className="block">{model.type === "image" ? formatCredits(model.creditOutputCharge) : `${translate("admin.pricing.output", "Output")}: ${formatCredits(model.creditOutputCharge)}`}</span>
                          <span className="block text-muted-foreground">{unitLabel}</span>
                        </td>
                        <td className="px-4 py-3"><div className="flex max-w-56 flex-wrap gap-1"><span className={cn("rounded-full px-2 py-0.5 text-xs", model.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>{model.isEnabled ? translate("admin.pricing.active", "Active") : translate("admin.pricing.inactive", "Inactive")}</span>{!pricingComplete ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 text-xs">{translate("admin.pricing.pricing_incomplete", "Pricing incomplete — add provider cost")}</span> : null}{model.isDefault ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 text-xs">{translate("admin.pricing.default", "Default")}</span> : null}{model.isActive ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 text-xs">{translate("admin.pricing.selected", "Selected")}</span> : null}</div></td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{formatUpdatedAt(model.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button aria-label={translate("admin.pricing.model_actions", "Model actions")} className="cursor-pointer" size="icon" type="button" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-48">
                              <DropdownMenuItem className="cursor-pointer" onSelect={() => { setSelectedKey(model.key); setDialogMode("edit"); }}>{translate("admin.pricing.edit_model_action", "Edit model")}</DropdownMenuItem>
                              {pricingComplete && model.type === "chat" && !model.isDefault ? <ModelActionForm action={setDefaultModelConfigAction} id={model.id} label={translate("admin.pricing.make_default", "Make default")} pendingLabel={translate("common.updating", "Updating...")} /> : null}
                              {pricingComplete && model.type === "image" && !model.isActive ? <ModelActionForm action={setActiveImageModelConfigAction} id={model.id} label={translate("admin.pricing.make_active", "Make active")} pendingLabel={translate("common.updating", "Updating...")} /> : null}
                              {pricingComplete && model.type === "live_voice" && !model.isDefault ? <ModelActionForm action={setDefaultLiveVoiceModelConfigAction} id={model.id} label={translate("admin.pricing.make_default", "Make default")} pendingLabel={translate("common.updating", "Updating...")} /> : null}
                              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={() => { setSelectedKey(model.key); setDialogMode("delete"); }}>{translate("admin.pricing.delete_model", "Delete model")}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
              {typeModels.length > DEFAULT_VISIBLE_ROWS ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                  <span aria-live="polite" className="text-muted-foreground text-xs">
                    {translate("admin.pricing.showing_rows", "Showing {visible} of {total}")
                      .replace("{visible}", String(visibleModels.length))
                      .replace("{total}", String(typeModels.length))}
                  </span>
                  {hasMoreModels ? (
                    <Button className="cursor-pointer" onClick={() => setVisibleModelCounts((counts) => ({ ...counts, [type]: Math.min(counts[type] + DEFAULT_VISIBLE_ROWS, typeModels.length) }))} size="sm" type="button" variant="outline">
                      {translate("admin.pricing.load_more", "Load more")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {modelSettings}

      {deletedModels.length > 0 ? (
        <section className="rounded-xl border bg-card/80 p-4 shadow-sm">
          <h3 className="font-semibold text-sm">{translate("admin.pricing.deleted_models", "Deleted models")}</h3>
          <div className="mt-3 grid gap-2">{deletedModels.map((model) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 text-sm" key={model.key}>
              <div><span className="font-medium">{model.name}</span><span className="ml-2 text-muted-foreground text-xs">{typeLabel(model.type)} · {formatUpdatedAt(model.deletedAt)}</span></div>
              <Button className="cursor-pointer" onClick={() => { setSelectedKey(model.key); setDialogMode("hard-delete"); }} size="sm" type="button" variant="destructive">{translate("admin.pricing.hard_delete", "Hard delete")}</Button>
            </div>
          ))}</div>
        </section>
      ) : null}

      <Dialog onOpenChange={(open) => { if (!open) closeDialog(); }} open={dialogMode === "create" || dialogMode === "edit"}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? addModelLabel(createType) : `${translate("admin.pricing.edit_model_action", "Edit model")} · ${selectedModel?.name ?? ""}`}</DialogTitle>
            <DialogDescription>{dialogMode === "create" ? translate("admin.pricing.add_typed_model_description", "Configure the provider, availability, provider cost, and customer markup for this model.") : translate("admin.pricing.edit_full_model_description", "Update this model's provider configuration, availability, provider cost, and customer markup.")}</DialogDescription>
          </DialogHeader>
          {dialogMode === "create" ? <div key={createType}>{createForms[createType]}</div> : selectedKey ? editForms[selectedKey] : null}
          <DialogFooter><DialogClose className="cursor-pointer" type="button">{translate("common.close", "Close")}</DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) closeDialog(); }} open={dialogMode === "delete" || dialogMode === "hard-delete"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "hard-delete" ? translate("admin.pricing.hard_delete_model_title", "Permanently delete model?") : translate("admin.pricing.delete_model_title", "Delete model?")}</DialogTitle>
            <DialogDescription>{dialogMode === "hard-delete" ? translate("admin.pricing.hard_delete_model_description", "This permanently removes the model configuration and cannot be undone.") : translate("admin.pricing.delete_model_description", "This removes the model from active use. Its key remains reserved until the deleted record is permanently removed.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="cursor-pointer" type="button">{translate("common.cancel", "Cancel")}</DialogClose>
            {dialogMode === "delete" && selectedModel ? <form action={deleteAction}><input name="id" type="hidden" value={selectedModel.id} /><ActionSubmitButton pendingLabel={translate("common.deleting", "Deleting...")} type="submit" variant="destructive">{translate("admin.pricing.delete_model", "Delete model")}</ActionSubmitButton></form> : null}
            {dialogMode === "hard-delete" && selectedDeletedModel ? <form action={hardDeleteAction}><input name="id" type="hidden" value={selectedDeletedModel.id} /><ActionSubmitButton pendingLabel={translate("common.deleting", "Deleting...")} type="submit" variant="destructive">{translate("admin.pricing.hard_delete", "Hard delete")}</ActionSubmitButton></form> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
