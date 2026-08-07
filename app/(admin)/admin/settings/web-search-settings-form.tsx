"use client";

import { useState } from "react";
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
  const [creditMultiplier, setCreditMultiplier] = useState(String(config.creditMultiplier));
  const [dailyLimit, setDailyLimit] = useState(String(config.dailyLimit));
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
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
          creditMultiplier: Number(creditMultiplier),
          dailyLimit: Number(dailyLimit),
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

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.max_calls", "Max search calls")}</span>
          <input className="cursor-pointer rounded-md border bg-background px-3 py-2" disabled={isSaving} max={10} min={1} onChange={(event) => setMaxCalls(event.target.value)} type="number" value={maxCalls} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.multiplier", "Credit multiplier")}</span>
          <input className="cursor-pointer rounded-md border bg-background px-3 py-2" disabled={isSaving} max={10} min={1} onChange={(event) => setCreditMultiplier(event.target.value)} step={0.1} type="number" value={creditMultiplier} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{label("admin.web_search.daily_limit", "Daily search limit")}</span>
          <input className="cursor-pointer rounded-md border bg-background px-3 py-2" disabled={isSaving} max={1000} min={0} onChange={(event) => setDailyLimit(event.target.value)} type="number" value={dailyLimit} />
        </label>
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
