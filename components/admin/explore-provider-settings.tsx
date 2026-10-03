"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { EXPLORE_FALLBACK_PROVIDERS, type GoogleBudget, googleBillingMonth, parseGoogleBudget } from "@/lib/explore/google-budget-policy";
import { EXPLORE_PROVIDER_COPY } from "@/lib/explore/provider-copy";
import { EXPLORE_PROVIDERS, type ExploreProvider } from "@/lib/explore/providers";

const names: Record<ExploreProvider, string> = EXPLORE_PROVIDER_COPY;
type Configuration = { provider: ExploreProvider; configured: Record<ExploreProvider, boolean>; googleBudget: GoogleBudget };
const endpoint = "/api/admin/explore/provider";
function Copy({ name, text }: { name: string; text: string }) {
  return <EditableTranslation translationKey={`admin.explore.provider.${name}`} defaultText={text} />;
}
export function ExploreProviderSettings() {
  const { translate } = useTranslation();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [selected, setSelected] = useState<ExploreProvider>("openstreetmap");
  const [budget, setBudget] = useState<GoogleBudget>(() => parseGoogleBudget(undefined));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error("read_failed");
      const value: Configuration = await response.json();
      if (signal?.aborted) return;
      setConfiguration(value); setSelected(value.provider); setBudget(value.googleBudget);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function save() {
    setSaving(true); setError(false); setSaved(false);
    try {
      const { searchUsed: _searchUsed, photoUsed: _photoUsed, ...googleBudget } = budget;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selected, googleBudget }), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error("save_failed");
      const value: Configuration = await response.json();
      setConfiguration(value); setBudget(value.googleBudget); setSaved(true);
    } catch { setError(true); } finally { setSaving(false); }
  }
  return <section className="rounded-xl border bg-card p-5" aria-busy={loading || saving}>
    <h2 className="font-semibold text-lg"><Copy name="title" text="Place search provider" /></h2>
    <p className="mt-1 text-muted-foreground text-sm"><Copy name="description" text={EXPLORE_PROVIDER_COPY.description} /></p>
    {loading ? <output className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /><Copy name="loading" text="Loading provider settings…" /></output> : configuration ? <>
      <label htmlFor="explore-provider" className="mt-4 block text-sm">{translate("admin.explore.provider.label", "Provider")}</label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select id="explore-provider" className="h-10 cursor-pointer rounded-md border bg-background px-3 text-sm" value={selected} disabled={saving} onChange={(event) => { setSelected(event.target.value as ExploreProvider); setSaved(false); }}>
          {EXPLORE_PROVIDERS.map((provider) => <option key={provider} value={provider} disabled={!configuration.configured[provider]}>{translate(`admin.explore.provider.${provider}`, names[provider])}</option>)}
        </select>
        <Button className="cursor-pointer" disabled={saving || (selected === configuration.provider && JSON.stringify(budget) === JSON.stringify(configuration.googleBudget)) || !configuration.configured[selected] || (selected === "google" && budget.enabled && !configuration.configured[budget.fallbackProvider]) || budget.month !== googleBillingMonth()} onClick={save}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}<Copy name={saving ? "saving" : "save"} text={saving ? "Saving…" : "Save provider"} />
        </Button>
      </div>
      {selected === "google" && <div className="mt-4 space-y-3 rounded-lg border p-4">
        <label aria-label={translate("admin.explore.provider.fallback_enabled", EXPLORE_PROVIDER_COPY.fallback_enabled)} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="cursor-pointer" checked={budget.enabled} disabled={saving} onChange={(event) => { setBudget({ ...budget, enabled: event.target.checked }); setSaved(false); }} /><Copy name="fallback_enabled" text={EXPLORE_PROVIDER_COPY.fallback_enabled} /></label>
        {budget.enabled && <>
          <label aria-label={translate("admin.explore.provider.fallback_label", EXPLORE_PROVIDER_COPY.fallback_label)} htmlFor="explore-fallback" className="block text-sm"><Copy name="fallback_label" text={EXPLORE_PROVIDER_COPY.fallback_label} /></label>
          <select id="explore-fallback" className="h-10 cursor-pointer rounded-md border bg-background px-3 text-sm" value={budget.fallbackProvider} disabled={saving} onChange={(event) => { setBudget({ ...budget, fallbackProvider: event.target.value as GoogleBudget["fallbackProvider"] }); setSaved(false); }}>
            {EXPLORE_FALLBACK_PROVIDERS.map((provider) => <option key={provider} value={provider} disabled={!configuration.configured[provider]}>{translate(`admin.explore.provider.${provider}`, names[provider])}</option>)}
          </select>
          <p className="text-muted-foreground text-xs"><Copy name="fallback_description" text={EXPLORE_PROVIDER_COPY.fallback_description} /></p>
          <div className="grid gap-3 sm:grid-cols-2">{([
            ["searchLimit", "search_limit"], ["photoLimit", "photo_limit"], ["searchOffset", "search_offset"], ["photoOffset", "photo_offset"],
          ] as const).map(([field, copy]) => <label key={field} aria-label={translate(`admin.explore.provider.${copy}`, EXPLORE_PROVIDER_COPY[copy])} className="block space-y-1 text-sm"><Copy name={copy} text={EXPLORE_PROVIDER_COPY[copy]} /><input type="number" min="0" max="10000000" step="1" className="block h-10 w-full rounded-md border bg-background px-3" value={budget[field]} disabled={saving} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 10_000_000) { setBudget({ ...budget, [field]: value }); setSaved(false); } }} /></label>)}</div>
          <p className="text-muted-foreground text-xs"><Copy name="budget_note" text={EXPLORE_PROVIDER_COPY.budget_note} /></p>
          <p className="text-sm"><EditableTranslation translationKey="admin.explore.provider.usage_counts" defaultText={EXPLORE_PROVIDER_COPY.usage_counts} values={{ searches: budget.searchUsed, photos: budget.photoUsed, month: budget.month }} /></p>
          <p className="text-muted-foreground text-xs"><Copy name="reservation_note" text={EXPLORE_PROVIDER_COPY.reservation_note} /></p>
        </>}
      </div>}
      <p className="mt-3 text-muted-foreground text-xs"><Copy name="credentials" text="Services without a configured server API key are unavailable. A configured key still requires an active account, sufficient credits, and the appropriate API enabled." /></p>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs">{(["google", "serper", "serpent"] as const).map((provider) => <li key={provider}><Copy name={provider} text={names[provider]} />: <Copy name={configuration.configured[provider] ? "configured" : "missing"} text={configuration.configured[provider] ? "Key configured" : "Key missing"} /></li>)}</ul>
    </> : null}
    {error && <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-destructive"><Copy name="error" text="Provider settings could not be loaded or saved. Please try again." /><Button variant="outline" className="cursor-pointer" disabled={loading || saving} onClick={() => void load()}><Copy name="retry" text="Reload settings" /></Button></div>}
    {saved && <output className="mt-3 block text-sm"><Copy name="saved" text="Provider saved. New searches will use this selection." /></output>}
  </section>;
}
