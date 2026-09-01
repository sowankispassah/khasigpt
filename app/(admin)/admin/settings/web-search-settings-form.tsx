"use client";

import { useEffect, useState } from "react";
import {
  CostPlusPreviewCard,
  type PricingPreviewContext,
} from "@/app/(admin)/admin/pricing/cost-plus-pricing-fields";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { WebSearchConfig, WebSearchProvider } from "@/lib/web-search/types";

const PROVIDERS: Array<{
  value: WebSearchProvider;
  labelKey: string;
  defaultLabel: string;
}> = [
  {
    value: "gemini_grounding",
    labelKey: "admin.web_search.provider.gemini",
    defaultLabel: "Gemini Grounding with Google Search",
  },
  {
    value: "openai_web_search",
    labelKey: "admin.web_search.provider.openai",
    defaultLabel: "OpenAI web search (when implemented)",
  },
  {
    value: "disabled",
    labelKey: "admin.web_search.provider.disabled",
    defaultLabel: "Disabled",
  },
];

export function WebSearchSettingsForm({ config }: { config: WebSearchConfig }) {
  const { translate } = useTranslation();
  const [provider, setProvider] = useState(config.provider);
  const [fallbackProvider, setFallbackProvider] = useState(config.fallbackProvider);
  const [enabledWeb, setEnabledWeb] = useState(config.enabledWeb);
  const [enabledNative, setEnabledNative] = useState(config.enabledNative);
  const [freeUsersEnabled, setFreeUsersEnabled] = useState(config.freeUsersEnabled);
  const [paidUsersEnabled, setPaidUsersEnabled] = useState(config.paidUsersEnabled);
  const [maxCalls, setMaxCalls] = useState(String(config.maxCalls));
  const [markupMultiplier, setMarkupMultiplier] = useState(String(config.markupMultiplier));
  const [geminiCostPerCallUsd, setGeminiCostPerCallUsd] = useState(
    String(config.providerCostPerCallUsd.gemini_grounding)
  );
  const [openaiCostPerCallUsd, setOpenaiCostPerCallUsd] = useState(
    String(config.providerCostPerCallUsd.openai_web_search)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pricingContext, setPricingContext] =
    useState<PricingPreviewContext | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/pricing-preview", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("pricing_context_unavailable");
        }
        return (await response.json()) as PricingPreviewContext;
      })
      .then(setPricingContext)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPricingContext(null);
      });
    return () => controller.abort();
  }, []);

  const save = async () => {
    if (
      Number(geminiCostPerCallUsd) <= 0 ||
      Number(openaiCostPerCallUsd) <= 0 ||
      Number(markupMultiplier) < 1 ||
      Number(markupMultiplier) > 20
    ) {
      toast({
        type: "error",
        description: translate(
          "admin.web_search.invalid_pricing",
          "Provider costs must be greater than zero and markup must be between 1 and 20."
        ),
      });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/settings/web-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          provider,
          fallbackProvider,
          enabledWeb,
          enabledNative,
          freeUsersEnabled,
          paidUsersEnabled,
          maxCalls: Number(maxCalls),
          markupMultiplier: Number(markupMultiplier),
          geminiCostPerCallUsd: Number(geminiCostPerCallUsd),
          openaiCostPerCallUsd: Number(openaiCostPerCallUsd),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.message ?? "save_failed");
      }
      toast({
        type: "success",
        description: translate("admin.web_search.saved", "Web Search settings saved."),
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error && error.message !== "save_failed"
            ? error.message
            : translate("admin.web_search.save_failed", "Failed to save Web Search settings."),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const label = (key: string, fallback: string) => translate(key, fallback);
  const readStateText = translate(
    "admin.web_search.read_state",
    "Configuration read: {readState}. Access mode: {accessMode}."
  )
    .replace("{readState}", config.readState)
    .replace("{accessMode}", config.accessMode);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.provider", "Primary provider")}</span>
          <select
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            disabled={isSaving}
            onChange={(event) => setProvider(event.target.value as WebSearchProvider)}
            value={provider}
          >
            {PROVIDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {translate(option.labelKey, option.defaultLabel)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.fallback", "Fallback provider")}</span>
          <select
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            disabled={isSaving}
            onChange={(event) => setFallbackProvider(event.target.value as WebSearchProvider)}
            value={fallbackProvider}
          >
            {PROVIDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {translate(option.labelKey, option.defaultLabel)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["enabledWeb", enabledWeb, setEnabledWeb, "Enable on web"],
          ["enabledNative", enabledNative, setEnabledNative, "Enable on native"],
          ["freeUsersEnabled", freeUsersEnabled, setFreeUsersEnabled, "Allow free users"],
          ["paidUsersEnabled", paidUsersEnabled, setPaidUsersEnabled, "Allow paid users"],
        ].map(([key, value, setter, text]) => (
          <label className="flex cursor-pointer items-center gap-3 text-sm" key={key as string}>
            <input
              checked={value as boolean}
              className="h-4 w-4 cursor-pointer"
              disabled={isSaving}
              onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)}
              type="checkbox"
            />
            <span>{label(`admin.web_search.${key}`, text as string)}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.max_calls", "Max search calls")}</span>
          <input className="cursor-pointer rounded-md border bg-background px-3 py-2" disabled={isSaving} max={10} min={1} onChange={(event) => setMaxCalls(event.target.value)} type="number" value={maxCalls} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.multiplier", "Customer markup")}</span>
          <input className="cursor-pointer rounded-md border bg-background px-3 py-2" disabled={isSaving} max={20} min={1} onChange={(event) => setMarkupMultiplier(event.target.value)} required step={0.01} type="number" value={markupMultiplier} />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label(
              "admin.web_search.gemini_cost_per_call",
              "Grounded search provider cost (USD / call)"
            )}
          </span>
          <input
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            disabled={isSaving}
            max={100}
            min={0.000001}
            onChange={(event) => setGeminiCostPerCallUsd(event.target.value)}
            required
            step={0.000001}
            type="number"
            value={geminiCostPerCallUsd}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label(
              "admin.web_search.openai_cost_per_call",
              "Fallback search provider cost (USD / call)"
            )}
          </span>
          <input
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            disabled={isSaving}
            max={100}
            min={0.000001}
            onChange={(event) => setOpenaiCostPerCallUsd(event.target.value)}
            required
            step={0.000001}
            type="number"
            value={openaiCostPerCallUsd}
          />
        </label>
      </div>

      <div className="space-y-3">
        <CostPlusPreviewCard
          context={pricingContext}
          markupMultiplier={Number(markupMultiplier)}
          providerCostUsd={Number(geminiCostPerCallUsd)}
          title={label(
            "admin.web_search.gemini_price_preview",
            "Grounded search pricing per call"
          )}
        />
        <CostPlusPreviewCard
          context={pricingContext}
          markupMultiplier={Number(markupMultiplier)}
          providerCostUsd={Number(openaiCostPerCallUsd)}
          title={label(
            "admin.web_search.openai_price_preview",
            "Fallback search pricing per call"
          )}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-3 text-muted-foreground text-xs">
        <span>{readStateText}</span>
        <Button className="shrink-0" disabled={isSaving} onClick={save} type="button">
          {isSaving ? <LoaderIcon /> : null}
          {isSaving ? label("common.saving", "Saving...") : label("common.save", "Save settings")}
        </Button>
      </div>
    </div>
  );
}
