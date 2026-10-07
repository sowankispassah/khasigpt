"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricingPreviewContext } from "@/app/(admin)/admin/pricing/cost-plus-pricing-fields";
import { AdminNotice, AdminStatusPill } from "@/components/admin/admin-ui";
import { GoogleSearchAllowanceSettings } from "@/components/admin/google-search-allowance-settings";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { calculateCostPlusPreview } from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { GOOGLE_ALLOWANCE_COPY } from "@/lib/web-search/google-allowance-copy";
import {
  type BillableWebSearchProvider,
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
  { value: "serpent", labelKey: "admin.web_search.provider.serpent", defaultLabel: "Serpent Web Search" },
  {
    value: "disabled",
    labelKey: "admin.web_search.provider.disabled",
    defaultLabel: "Disabled",
  },
];

const BILLABLE_PROVIDER_ROWS = PROVIDERS.filter(
  (provider): provider is (typeof PROVIDERS)[number] & {
    value: BillableWebSearchProvider;
  } => provider.value !== "disabled"
);

type ProviderPricingState = Record<
  BillableWebSearchProvider,
  { markupMultiplier: string; providerCostPerCallUsd: string }
>;

function formatNumber(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function initialProviderPricing(config: WebSearchConfig): ProviderPricingState {
  return {
    gemini_grounding: {
      markupMultiplier: String(
        config.providerMarkupMultiplier.gemini_grounding
      ),
      providerCostPerCallUsd: String(
        config.providerCostPerCallUsd.gemini_grounding
      ),
    },
    openai_web_search: {
      markupMultiplier: String(
        config.providerMarkupMultiplier.openai_web_search
      ),
      providerCostPerCallUsd: String(
        config.providerCostPerCallUsd.openai_web_search
      ),
    },
    serpent: { markupMultiplier: String(config.providerMarkupMultiplier.serpent), providerCostPerCallUsd: String(config.providerCostPerCallUsd.serpent) },
    serper: {
      markupMultiplier: String(config.providerMarkupMultiplier.serper),
      providerCostPerCallUsd: String(config.providerCostPerCallUsd.serper),
    },
  };
}

export function WebSearchPricingForm({
  config,
  serperConfigured,
  serpentConfigured,
}: {
  config: WebSearchConfig;
  serperConfigured: boolean;
  serpentConfigured: boolean;
}) {
  const { translate } = useTranslation();
  const [provider, setProvider] = useState(config.provider);
  const [googleAllowanceEnabled, setGoogleAllowanceEnabled] = useState(config.googleAllowanceEnabled ?? false);
  const [allowanceRefresh, setAllowanceRefresh] = useState(0);
  const [fallbackProvider, setFallbackProvider] = useState(
    config.fallbackProvider
  );
  const [enabledWeb, setEnabledWeb] = useState(config.enabledWeb);
  const [enabledNative, setEnabledNative] = useState(config.enabledNative);
  const [freeUsersEnabled, setFreeUsersEnabled] = useState(
    config.freeUsersEnabled
  );
  const [paidUsersEnabled, setPaidUsersEnabled] = useState(
    config.paidUsersEnabled
  );
  const [maxCalls, setMaxCalls] = useState(String(config.maxCalls));
  const [serpentProductCost, setSerpentProductCost] = useState(String(config.serpentProductCostPerCallUsd ?? 0));
  const [providerPricing, setProviderPricing] = useState<ProviderPricingState>(
    () => initialProviderPricing(config)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pricingContext, setPricingContext] =
    useState<PricingPreviewContext | null>(null);
  const maxCallsApplies = provider !== "serper" && provider !== "serpent";
  const allowanceMode = googleAllowanceEnabled && provider === "gemini_grounding";

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

  const numericProviderCosts = useMemo(
    () => ({
      gemini_grounding: Number(
        providerPricing.gemini_grounding.providerCostPerCallUsd
      ),
      openai_web_search: Number(
        providerPricing.openai_web_search.providerCostPerCallUsd
      ),
      serper: Number(providerPricing.serper.providerCostPerCallUsd),
      serpent: Number(providerPricing.serpent.providerCostPerCallUsd),
    }),
    [providerPricing]
  );

  const orderedProviderRows = useMemo(() => {
    const rank = (providerKey: BillableWebSearchProvider) => {
      if (providerKey === provider) return 0;
      if (providerKey === fallbackProvider) return 1;
      return 2;
    };
    return [...BILLABLE_PROVIDER_ROWS].sort(
      (left, right) => rank(left.value) - rank(right.value)
    );
  }, [fallbackProvider, provider]);

  const pricingIsValid =
    Number.isFinite(Number(serpentProductCost)) && Number(serpentProductCost) >= 0 && Number(serpentProductCost) <= 100 &&
    hasValidWebSearchProviderCosts({
      fallbackProvider,
      provider,
      providerCostPerCallUsd: numericProviderCosts,
      googleAllowanceEnabled,
    }) &&
    BILLABLE_PROVIDER_ROWS.every(({ value }) => {
      const markup = Number(providerPricing[value].markupMultiplier);
      const cost = Number(providerPricing[value].providerCostPerCallUsd);
      return (
        Number.isFinite(markup) &&
        markup >= 1 &&
        markup <= 20 &&
        Number.isFinite(cost) &&
        cost >= 0 &&
        cost <= 100
      );
    });

  const updateProviderPricing = (
    providerKey: BillableWebSearchProvider,
    field: keyof ProviderPricingState[BillableWebSearchProvider],
    value: string
  ) => {
    setProviderPricing((current) => ({
      ...current,
      [providerKey]: { ...current[providerKey], [field]: value },
    }));
  };

  const save = async () => {
    const numericMaxCalls = Number(maxCalls);
    if (
      !pricingIsValid ||
      !Number.isInteger(numericMaxCalls) ||
      numericMaxCalls < 1 ||
      numericMaxCalls > 10
    ) {
      toast({
        type: "error",
        description: translate(
          "admin.web_search.invalid_selected_pricing",
          "Add a provider cost greater than zero for each selected provider. Inactive providers may remain at zero, and every provider markup must be between 1 and 20."
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
          maxCalls: numericMaxCalls,
          serpentProductCostPerCallUsd: Number(serpentProductCost),
          providerPricing: Object.fromEntries(
            BILLABLE_PROVIDER_ROWS.map(({ value }) => [
              value,
              {
                markupMultiplier: Number(
                  providerPricing[value].markupMultiplier
                ),
                providerCostPerCallUsd: Number(
                  providerPricing[value].providerCostPerCallUsd
                ),
              },
            ])
          ),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
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
        description: translate(
          "admin.web_search.saved",
          "Web Search settings saved."
        ),
      });
      if (provider !== "gemini_grounding") setGoogleAllowanceEnabled(false);
      setAllowanceRefresh((current) => current + 1);
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error && error.message === "invalid_pricing"
            ? translate(
                "admin.web_search.invalid_selected_pricing",
                "Add a provider cost greater than zero for each selected provider. Inactive providers may remain at zero, and every provider markup must be between 1 and 20."
              )
            : error instanceof Error &&
                error.message === "provider_not_configured"
              ? translate(
                  "admin.web_search.provider_not_configured",
                  "Add the selected provider’s server API key before activating it."
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

  const providerGrid =
    "lg:grid lg:grid-cols-[minmax(0,1.4fr)_9.5rem_6.5rem_repeat(4,minmax(0,0.8fr))] lg:items-center lg:gap-4";
  const statLabel = "block text-muted-foreground text-xs lg:hidden";

  return (
    <div className="space-y-6">
      {!pricingIsValid ? (
        <AdminNotice>
          {translate(
            "admin.web_search.pricing_incomplete",
            "Web search cannot run until a provider cost greater than zero is added for the selected provider."
          )}
        </AdminNotice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label("admin.web_search.provider", "Primary provider")}
          </span>
          <select
            className="h-10 cursor-pointer rounded-lg border bg-background px-3"
            disabled={isSaving}
            onChange={(event) =>
              setProvider(event.target.value as WebSearchProvider)
            }
            value={provider}
          >
            {PROVIDERS.map((option) => (
              <option
                disabled={(option.value === "serper" && !serperConfigured) || (option.value === "serpent" && !serpentConfigured)}
                key={option.value}
                value={option.value}
              >
                {translate(option.labelKey, option.defaultLabel)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">
            {label("admin.web_search.fallback", "Fallback provider")}
          </span>
          <select
            className="h-10 cursor-pointer rounded-lg border bg-background px-3"
            disabled={isSaving}
            onChange={(event) =>
              setFallbackProvider(event.target.value as WebSearchProvider)
            }
            value={fallbackProvider}
          >
            {PROVIDERS.map((option) => (
              <option
                disabled={(option.value === "serper" && !serperConfigured) || (option.value === "serpent" && !serpentConfigured)}
                key={option.value}
                value={option.value}
              >
                {translate(option.labelKey, option.defaultLabel)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["enabledWeb", enabledWeb, setEnabledWeb, "Enable on web"],
          [
            "enabledNative",
            enabledNative,
            setEnabledNative,
            "Enable on native",
          ],
          [
            "freeUsersEnabled",
            freeUsersEnabled,
            setFreeUsersEnabled,
            "Allow free users",
          ],
          [
            "paidUsersEnabled",
            paidUsersEnabled,
            setPaidUsersEnabled,
            "Allow paid users",
          ],
        ].map(([key, value, setter, text]) => (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition hover:bg-muted/40"
            key={key as string}
          >
            <input
              checked={value as boolean}
              className="h-4 w-4 cursor-pointer"
              disabled={isSaving}
              onChange={(event) =>
                (setter as (next: boolean) => void)(event.target.checked)
              }
              type="checkbox"
            />
            <span>{label(`admin.web_search.${key}`, text as string)}</span>
          </label>
        ))}
      </div>

      {!allowanceMode && <label className="flex max-w-sm flex-col gap-2 text-sm">
        <span className="font-medium">
          {maxCallsApplies
            ? label("admin.web_search.max_calls", "Max search calls")
            : label(
                "admin.web_search.max_calls_gemini_only",
                "Max search calls (Gemini Grounding only)"
              )}
        </span>
        <input
          aria-describedby={
            maxCallsApplies ? undefined : "web-search-max-calls-note"
          }
          aria-label={
            maxCallsApplies
              ? label("admin.web_search.max_calls", "Max search calls")
              : label(
                  "admin.web_search.max_calls_not_applicable",
                  "Max search calls not applicable for Serper"
                )
          }
          className="h-10 cursor-pointer rounded-lg border bg-background px-3 disabled:cursor-not-allowed disabled:bg-muted"
          disabled={isSaving || !maxCallsApplies}
          max={10}
          min={1}
          onChange={(event) => setMaxCalls(event.target.value)}
          type={maxCallsApplies ? "number" : "text"}
          value={
            maxCallsApplies
              ? maxCalls
              : label("admin.web_search.not_applicable", "N/A")
          }
        />
      </label>}
      {provider === "serper" ? (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
          <p className="font-medium text-red-600 dark:text-red-400">
            {translate(
              "admin.web_search.serper_billing_units_note",
              "Serper Shopping searches consume 2 Serper credits for one provider request. Product images are included and do not add another request."
            )}
          </p>
          <p
            className="text-muted-foreground"
            id="web-search-max-calls-note"
          >
            {translate(
              "admin.web_search.serper_single_call_note",
              "Serper uses one provider call per user search. Max search calls is not applicable to Serper; it is only used by providers that support multiple grounded searches."
            )}
          </p>
        </div>
      ) : null}
      {provider === "serpent" && <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground text-xs"><EditableTranslation translationKey="admin.web_search.serpent_note" defaultText="Serpent uses one Google Web SERP page per search, localized to India. Shopping cards appear when listings are returned; otherwise retailer browse links are shown. Its dedicated Shopping endpoint has not launched. Provider cost is per page: Default $0.0006, Growth $0.00006, Scale $0.00003. Enter your account rate below. News and videos also use this Web SERP request, with inline video cards when available. No paid AI add-ons are requested." description="Serpent search coverage and billing explanation." /></p>}
      {!serperConfigured ? (
        <AdminNotice className="text-xs">
          {translate(
            "admin.web_search.serper_not_configured",
            "Add SERPER_API_KEY to the server environment before activating Serper."
          )}
        </AdminNotice>
      ) : null}
      {!serpentConfigured && <AdminNotice className="text-xs"><EditableTranslation translationKey="admin.web_search.serpent_not_configured" defaultText="Add SERPENT_API_KEY to the server environment before activating Serpent." description="Missing Serpent server credential." /></AdminNotice>}
      {serpentConfigured && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <label htmlFor="serpent-product-cost" className="text-sm font-medium">
            <EditableTranslation translationKey="admin.web_search.serpent_product_cost" defaultText="Serpent product lookup cost (USD per call)" description="Admin price for the optional Amazon India product lookup." />
          </label>
          <input id="serpent-product-cost" className="block h-10 w-44 cursor-pointer rounded-lg border bg-background px-3" type="number" min={0} max={100} step={0.000001} value={serpentProductCost} disabled={isSaving} onChange={event => setSerpentProductCost(event.target.value)} />
          <p className="text-xs text-muted-foreground"><EditableTranslation translationKey="admin.web_search.serpent_product_note" defaultText="Set zero to disable. A positive price enables one Amazon India lookup when Serpent shopping results have no product photos. Default $0.00002, Growth $0.000018, Scale $0.000014 per call. Matching items keep their own photos, prices and links. Completed lookups add this cost to the web-search cost and use the Serpent markup; ordinary searches do not run it." description="Serpent product lookup coverage, pricing and disabled state." /></p>
        </div>
      )}

      <GoogleSearchAllowanceSettings refreshToken={allowanceRefresh} onSaved={(allowance) => { setGoogleAllowanceEnabled(allowance.enabled); if (allowance.enabled) { setProvider("gemini_grounding"); setFallbackProvider(allowance.fallbackProvider); } }} />

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold text-base">
            {translate(
              "admin.web_search.provider_pricing_title",
              "Web Search provider pricing"
            )}
          </h3>
          <p className="mt-0.5 text-muted-foreground text-sm">
            {translate(
              "admin.web_search.provider_pricing_description",
              "Set provider cost and customer markup independently for every search provider. Changing the active provider does not change these saved prices."
            )}
          </p>
          {allowanceMode && <p className="mt-2 text-muted-foreground text-xs">{translate("admin.web_search.allowance.pricingNote", GOOGLE_ALLOWANCE_COPY.pricingNote)}</p>}
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className={`hidden border-b bg-muted/40 px-4 py-2.5 font-medium text-muted-foreground text-xs ${providerGrid}`}>
            <span>{translate("admin.pricing.provider", "Provider")}</span>
            <span>{translate("admin.web_search.provider_unit_cost", "Provider unit cost (USD)")}</span>
            <span>{translate("admin.pricing.markup", "Markup")}</span>
            <span className="text-right">{translate("admin.pricing.customer_charge", "Customer charge")}</span>
            <span className="text-right">{translate("admin.pricing.preview.profit", "Profit")}</span>
            <span className="text-right">{translate("admin.pricing.preview.margin", "Profit margin")}</span>
            <span className="text-right">{translate("admin.pricing.credit_charge", "Credit charge")}</span>
          </div>
          <ul className="divide-y divide-border/60">
            {orderedProviderRows.map((providerRow) => {
              const providerKey = providerRow.value;
              const pricing = providerPricing[providerKey];
              const isPrimary = provider === providerKey;
              const isFallback = fallbackProvider === providerKey;
              const usesTokenPricing = allowanceMode && providerKey === "gemini_grounding";
              const preview = pricingContext && !usesTokenPricing
                ? calculateCostPlusPreview({
                    markupMultiplier: Number(pricing.markupMultiplier),
                    providerCostUsd: Number(pricing.providerCostPerCallUsd),
                    usdToInr: pricingContext.usdToInr,
                    walletUnitsPerCredit: TOKENS_PER_CREDIT,
                    walletUnitsPerInr: pricingContext.walletUnitsPerInr,
                  })
                : null;
              const providerUnavailable =
                (providerKey === "serper" && !serperConfigured) || (providerKey === "serpent" && !serpentConfigured);
              const providerName = translate(providerRow.labelKey, providerRow.defaultLabel);

              return (
                <li className={`grid gap-3 px-4 py-4 transition hover:bg-muted/30 lg:py-3 ${providerGrid}`} key={providerKey}>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{providerName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {isPrimary ? (
                        <AdminStatusPill tone="success">
                          {translate("admin.pricing.active", "Active")}
                        </AdminStatusPill>
                      ) : null}
                      {isFallback ? (
                        <AdminStatusPill tone="info">
                          {translate(
                            "admin.web_search.fallback_status",
                            "Fallback"
                          )}
                        </AdminStatusPill>
                      ) : null}
                      {!isPrimary && !isFallback ? (
                        <AdminStatusPill>
                          {translate("admin.pricing.inactive", "Inactive")}
                        </AdminStatusPill>
                      ) : null}
                      {providerUnavailable ? (
                        <AdminStatusPill tone="warning">
                          {translate(
                            "admin.web_search.not_configured",
                            "API key missing"
                          )}
                        </AdminStatusPill>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 items-end gap-3 lg:contents">
                    <label className="flex flex-col gap-1">
                      <span className={statLabel}>{translate("admin.web_search.provider_unit_cost", "Provider unit cost (USD)")}</span>
                      <input
                        aria-label={translate(
                          "admin.web_search.provider_cost_for",
                          "Provider cost for {provider}"
                        ).replace("{provider}", providerName)}
                        aria-required={!usesTokenPricing && (isPrimary || isFallback)}
                        className="h-9 w-full min-w-0 cursor-pointer rounded-lg border bg-background px-3 text-sm"
                        disabled={isSaving || usesTokenPricing}
                        max={100}
                        min={0}
                        onChange={(event) =>
                          updateProviderPricing(
                            providerKey,
                            "providerCostPerCallUsd",
                            event.target.value
                          )
                        }
                        required={!usesTokenPricing && (isPrimary || isFallback)}
                        step={0.000001}
                        type="number"
                        value={pricing.providerCostPerCallUsd}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={statLabel}>{translate("admin.pricing.markup", "Markup")}</span>
                      <input
                        aria-label={translate(
                          "admin.web_search.markup_for",
                          "Customer markup for {provider}"
                        ).replace("{provider}", providerName)}
                        className="h-9 w-full min-w-0 cursor-pointer rounded-lg border bg-background px-3 text-sm"
                        disabled={isSaving}
                        max={20}
                        min={1}
                        onChange={(event) =>
                          updateProviderPricing(
                            providerKey,
                            "markupMultiplier",
                            event.target.value
                          )
                        }
                        required
                        step={0.01}
                        type="number"
                        value={pricing.markupMultiplier}
                      />
                    </label>
                  </div>
                  <dl className="grid grid-cols-4 gap-2 text-sm tabular-nums lg:contents">
                    <div className="lg:text-right">
                      <dt className={statLabel}>{translate("admin.pricing.customer_charge", "Customer charge")}</dt>
                      <dd className="font-medium">
                        {usesTokenPricing ? translate("admin.web_search.allowance.variableCharge", GOOGLE_ALLOWANCE_COPY.variableCharge) : preview
                          ? `₹${formatNumber(preview.billedChargeInr)}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="lg:text-right">
                      <dt className={statLabel}>{translate("admin.pricing.preview.profit", "Profit")}</dt>
                      <dd className="font-medium">{preview ? `₹${formatNumber(preview.profitInr)}` : "—"}</dd>
                    </div>
                    <div className="lg:text-right">
                      <dt className={statLabel}>{translate("admin.pricing.preview.margin", "Profit margin")}</dt>
                      <dd className="font-medium">
                        {preview
                          ? `${formatNumber(preview.marginPercent, 2)}%`
                          : "—"}
                      </dd>
                    </div>
                    <div className="lg:text-right">
                      <dt className={statLabel}>{translate("admin.pricing.credit_charge", "Credit charge")}</dt>
                      <dd className="font-medium">{preview ? formatNumber(preview.credits, 2) : "—"}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <p className="border-t bg-muted/30 px-4 py-2.5 text-muted-foreground text-xs">
            {pricingContext?.basePlanName
              ? translate(
                  "admin.pricing.preview.base_plan",
                  "Credit conversion: {plan}"
                ).replace("{plan}", pricingContext.basePlanName)
              : translate(
                  "admin.pricing.preview.unavailable",
                  "Add an active recharge plan to calculate customer charges and credits."
                )}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground text-xs">{readStateText}</span>
        <Button
          className="shrink-0 cursor-pointer"
          disabled={isSaving}
          onClick={save}
          type="button"
        >
          {isSaving ? <LoaderIcon /> : null}
          {isSaving
            ? label("common.saving", "Saving...")
            : label("admin.web_search.save", "Save settings")}
        </Button>
      </div>
    </div>
  );
}
