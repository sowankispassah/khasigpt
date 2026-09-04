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
import {
  getRequiredWebSearchCostProviders,
  hasValidWebSearchProviderCosts,
} from "@/lib/web-search/pricing";
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
    value: "serper",
    labelKey: "admin.web_search.provider.serper",
    defaultLabel: "Serper Google Search",
  },
  {
    value: "disabled",
    labelKey: "admin.web_search.provider.disabled",
    defaultLabel: "Disabled",
  },
];

export function WebSearchPricingForm({
  config,
  serperConfigured,
}: {
  config: WebSearchConfig;
  serperConfigured: boolean;
}) {
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
  const [serperCostPerCallUsd, setSerperCostPerCallUsd] = useState(
    String(config.providerCostPerCallUsd.serper)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pricingContext, setPricingContext] =
    useState<PricingPreviewContext | null>(null);
  const requiredCostProviders = getRequiredWebSearchCostProviders({
    fallbackProvider,
    provider,
  });
  const requiresGeminiCost = requiredCostProviders.includes("gemini_grounding");
  const requiresOpenAiCost = requiredCostProviders.includes("openai_web_search");
  const requiresSerperCost = requiredCostProviders.includes("serper");

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
      !hasValidWebSearchProviderCosts({
        fallbackProvider,
        provider,
        providerCostPerCallUsd: {
          gemini_grounding: Number(geminiCostPerCallUsd),
          openai_web_search: Number(openaiCostPerCallUsd),
          serper: Number(serperCostPerCallUsd),
        },
      }) ||
      Number(markupMultiplier) < 1 ||
      Number(markupMultiplier) > 20
    ) {
      toast({
        type: "error",
        description: translate(
          "admin.web_search.invalid_selected_pricing",
          "Add a provider cost greater than zero for each selected provider. Disabled providers may remain at zero, and markup must be between 1 and 20."
        ),
      });
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/pricing/web-search", {
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
          serperCostPerCallUsd: Number(serperCostPerCallUsd),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error === "invalid_pricing" ||
            body?.error === "provider_not_configured"
            ? body.error
            : "save_failed"
        );
      }
      toast({
        type: "success",
        description: translate("admin.web_search.saved", "Web Search settings saved."),
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error && error.message === "invalid_pricing"
            ? translate(
                "admin.web_search.invalid_selected_pricing",
                "Add a provider cost greater than zero for each selected provider. Disabled providers may remain at zero, and markup must be between 1 and 20."
              )
            : error instanceof Error && error.message === "provider_not_configured"
              ? translate(
                  "admin.web_search.serper_not_configured",
                  "Add SERPER_API_KEY to the server environment before activating Serper."
                )
              : translate(
                "admin.web_search.save_failed",
                "Failed to save Web Search settings."
                ),
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
  const selectedProviderCost =
    provider === "gemini_grounding"
      ? Number(geminiCostPerCallUsd)
      : provider === "openai_web_search"
        ? Number(openaiCostPerCallUsd)
        : provider === "serper"
          ? Number(serperCostPerCallUsd)
          : null;

  return (
    <div className="space-y-6">
      {(selectedProviderCost !== null && selectedProviderCost <= 0) ||
      !hasValidWebSearchProviderCosts({
        fallbackProvider,
        provider,
        providerCostPerCallUsd: {
          gemini_grounding: Number(geminiCostPerCallUsd),
          openai_web_search: Number(openaiCostPerCallUsd),
          serper: Number(serperCostPerCallUsd),
        },
      }) ? (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 text-amber-900 text-sm dark:bg-amber-950/20 dark:text-amber-100">
          {translate(
            "admin.web_search.pricing_incomplete",
            "Web search cannot run until a provider cost greater than zero is added for the selected provider."
          )}
        </p>
      ) : null}
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
              <option
                disabled={option.value === "serper" && !serperConfigured}
                key={option.value}
                value={option.value}
              >
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
              <option
                disabled={option.value === "serper" && !serperConfigured}
                key={option.value}
                value={option.value}
              >
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
      {provider === "serper" ? (
        <p className="text-muted-foreground text-xs">
          {translate(
            "admin.web_search.serper_single_call_note",
            "Serper uses one provider search call per user search. The max-calls setting applies only to providers that support multiple grounded searches."
          )}
        </p>
      ) : null}
      {!serperConfigured ? (
        <p className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-amber-900 text-xs dark:bg-amber-950/20 dark:text-amber-100">
          {translate(
            "admin.web_search.serper_not_configured",
            "Add SERPER_API_KEY to the server environment before activating Serper."
          )}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label(
              "admin.web_search.gemini_cost_per_call",
              "Grounded search provider cost (USD / call)"
            )}
          </span>
          <input
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            aria-required={requiresGeminiCost}
            disabled={isSaving || !requiresGeminiCost}
            max={100}
            min={0}
            onChange={(event) => setGeminiCostPerCallUsd(event.target.value)}
            required={requiresGeminiCost}
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
            aria-required={requiresOpenAiCost}
            disabled={isSaving || !requiresOpenAiCost}
            max={100}
            min={0}
            onChange={(event) => setOpenaiCostPerCallUsd(event.target.value)}
            required={requiresOpenAiCost}
            step={0.000001}
            type="number"
            value={openaiCostPerCallUsd}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label(
              "admin.web_search.serper_cost_per_call",
              "Serper provider cost (USD / call)"
            )}
          </span>
          <input
            className="cursor-pointer rounded-md border bg-background px-3 py-2"
            aria-required={requiresSerperCost}
            disabled={isSaving || !requiresSerperCost}
            max={100}
            min={0}
            onChange={(event) => setSerperCostPerCallUsd(event.target.value)}
            required={requiresSerperCost}
            step={0.000001}
            type="number"
            value={serperCostPerCallUsd}
          />
        </label>
      </div>

      <div className="space-y-3">
        {requiresGeminiCost ? (
          <CostPlusPreviewCard
            context={pricingContext}
            markupMultiplier={Number(markupMultiplier)}
            providerCostUsd={Number(geminiCostPerCallUsd)}
            title={label(
              "admin.web_search.gemini_price_preview",
              "Grounded search pricing per call"
            )}
          />
        ) : null}
        {requiresOpenAiCost ? (
          <CostPlusPreviewCard
            context={pricingContext}
            markupMultiplier={Number(markupMultiplier)}
            providerCostUsd={Number(openaiCostPerCallUsd)}
            title={label(
              "admin.web_search.openai_price_preview",
              "Fallback search pricing per call"
            )}
          />
        ) : null}
        {requiresSerperCost ? (
          <CostPlusPreviewCard
            context={pricingContext}
            markupMultiplier={Number(markupMultiplier)}
            providerCostUsd={Number(serperCostPerCallUsd)}
            title={label(
              "admin.web_search.serper_price_preview",
              "Serper search pricing per call"
            )}
          />
        ) : null}
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
