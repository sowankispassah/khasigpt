"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { EXPLORE_FALLBACK_PROVIDERS, type GoogleBudget, googleBillingMonth, parseGoogleBudget } from "@/lib/explore/google-budget-policy";
import { EXPLORE_PROVIDER_COPY } from "@/lib/explore/provider-copy";
import { EXPLORE_PROVIDERS, type ExploreProvider } from "@/lib/explore/providers";
import { parseSerpentMapsQuickEnabled, parseSerpentPhotoSource, type SerpentPhotoSource } from "@/lib/explore/serpent-policy";
import { ExplorePhotoCacheSettings } from "./explore-photo-cache-settings";

const names: Record<ExploreProvider, string> = EXPLORE_PROVIDER_COPY;
type Configuration = { provider: ExploreProvider; configured: Record<ExploreProvider, boolean>; googleBudget: GoogleBudget; serpentMapsQuickEnabled?: boolean; serpentPhotoSource?: SerpentPhotoSource };
const endpoint = "/api/admin/explore/provider";
function Copy({ name, text }: { name: string; text: string }) {
  return <EditableTranslation translationKey={`admin.explore.provider.${name}`} defaultText={text} />;
}
export function ExploreProviderSettings() {
  const { translate } = useTranslation();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [selected, setSelected] = useState<ExploreProvider>("openstreetmap");
  const [budget, setBudget] = useState<GoogleBudget>(() => parseGoogleBudget(undefined));
  const [serpentMapsQuickEnabled, setSerpentMapsQuickEnabled] = useState(true);
  const [serpentPhotoSource, setSerpentPhotoSource] = useState<SerpentPhotoSource>("maps_quick");
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
      setSerpentMapsQuickEnabled(parseSerpentMapsQuickEnabled(value.serpentMapsQuickEnabled));
      setSerpentPhotoSource(parseSerpentPhotoSource(value.serpentPhotoSource));
    } catch {
      if (!signal?.aborted) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function save() {
    setSaving(true); setError(false); setSaved(false);
    try {
      const { searchUsed: _searchUsed, photoUsed: _photoUsed, ...googleBudget } = budget;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selected, googleBudget, serpentMapsQuickEnabled, serpentPhotoSource }), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error("save_failed");
      const value: Configuration = await response.json();
      setConfiguration(value); setBudget(value.googleBudget); setSaved(true);
      setSerpentMapsQuickEnabled(parseSerpentMapsQuickEnabled(value.serpentMapsQuickEnabled));
      setSerpentPhotoSource(parseSerpentPhotoSource(value.serpentPhotoSource));
    } catch { setError(true); } finally { setSaving(false); }
  }
  return <section className="flex flex-col rounded-xl border bg-card shadow-xs" aria-busy={loading || saving}>
    <div className="border-b px-5 py-4">
      <h2 className="font-semibold text-base"><Copy name="title" text="Place search provider" /></h2>
      <p className="mt-0.5 text-muted-foreground text-sm"><Copy name="description" text={EXPLORE_PROVIDER_COPY.description} /></p>
    </div>
    <div className="p-5">
    {loading ? <output className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="size-4 animate-spin" /><Copy name="loading" text="Loading provider settings…" /></output> : configuration ? <>
      <ul className="mb-4 flex flex-wrap gap-2 text-xs">{(["google", "serper", "serpent"] as const).map((provider) => <li className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${configuration.configured[provider] ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-400"}`} key={provider}><Copy name={provider} text={names[provider]} />: <Copy name={configuration.configured[provider] ? "configured" : "missing"} text={configuration.configured[provider] ? "Key configured" : "Key missing"} /></li>)}</ul>
      <label htmlFor="explore-provider" className="block font-medium text-sm">{translate("admin.explore.provider.label", "Provider")}</label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select id="explore-provider" className="h-10 min-w-0 flex-1 cursor-pointer rounded-md border bg-background px-3 text-sm sm:flex-none" value={selected} disabled={saving} onChange={(event) => { setSelected(event.target.value as ExploreProvider); setSaved(false); }}>
          {EXPLORE_PROVIDERS.map((provider) => <option key={provider} value={provider} disabled={!configuration.configured[provider]}>{translate(`admin.explore.provider.${provider}`, names[provider])}</option>)}
        </select>
        <Button className="cursor-pointer" disabled={saving || (selected === configuration.provider && JSON.stringify(budget) === JSON.stringify(configuration.googleBudget) && serpentMapsQuickEnabled === parseSerpentMapsQuickEnabled(configuration.serpentMapsQuickEnabled) && serpentPhotoSource === parseSerpentPhotoSource(configuration.serpentPhotoSource)) || !configuration.configured[selected] || (selected === "google" && budget.enabled && !configuration.configured[budget.fallbackProvider]) || budget.month !== googleBillingMonth()} onClick={save}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}<Copy name={saving ? "saving" : "save"} text={saving ? "Saving…" : "Save provider"} />
        </Button>
      </div>
      {selected === "google" && <div className="mt-5 space-y-3 border-t pt-4">
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
      {(selected === "serpent" || (selected === "google" && budget.enabled && budget.fallbackProvider === "serpent")) && <div className="mt-5 space-y-2 border-t pt-4">
        <h3 className="font-medium text-sm"><Copy name="serpent_options" text={EXPLORE_PROVIDER_COPY.serpent_options} /></h3>
        <label aria-label={translate("admin.explore.provider.serpent_maps_quick", EXPLORE_PROVIDER_COPY.serpent_maps_quick)} className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="cursor-pointer" checked={serpentMapsQuickEnabled} disabled={saving} onChange={(event) => { setSerpentMapsQuickEnabled(event.target.checked); setSaved(false); }} />
          <Copy name="serpent_maps_quick" text={EXPLORE_PROVIDER_COPY.serpent_maps_quick} />
        </label>
        <label aria-label={translate("admin.explore.provider.photo_source", EXPLORE_PROVIDER_COPY.photo_source)} htmlFor="explore-photo-source" className="block text-sm"><Copy name="photo_source" text={EXPLORE_PROVIDER_COPY.photo_source} /></label>
        <select id="explore-photo-source" className="h-10 cursor-pointer rounded-md border bg-background px-3 text-sm" value={serpentPhotoSource} disabled={saving || !serpentMapsQuickEnabled} onChange={(event) => { setSerpentPhotoSource(event.target.value as SerpentPhotoSource); setSaved(false); }}>
          <option value="maps_quick">{translate("admin.explore.provider.photo_maps_quick", EXPLORE_PROVIDER_COPY.photo_maps_quick)}</option>
          <option value="image_search">{translate("admin.explore.provider.photo_image_search", EXPLORE_PROVIDER_COPY.photo_image_search)}</option>
          <option value="maps_place">{translate("admin.explore.provider.photo_maps_place", EXPLORE_PROVIDER_COPY.photo_maps_place)}</option>
        </select>
        <p className="text-muted-foreground text-xs"><Copy name="serpent_maps_quick_description" text={EXPLORE_PROVIDER_COPY.serpent_maps_quick_description} /></p>
        <ExplorePhotoCacheSettings />
      </div>}
      <p className="mt-5 border-t pt-4 text-muted-foreground text-xs"><Copy name="credentials" text="Services without a configured server API key are unavailable. A configured key still requires an active account, sufficient credits, and the appropriate API enabled." /></p>
    </> : null}
    {error && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-800 text-sm dark:text-rose-300"><Copy name="error" text="Provider settings could not be loaded or saved. Please try again." /><Button variant="outline" className="cursor-pointer" disabled={loading || saving} onClick={() => void load()}><Copy name="retry" text="Reload settings" /></Button></div>}
    {saved && <output className="mt-4 block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 text-sm dark:text-emerald-300"><Copy name="saved" text="Provider saved. New searches will use this selection." /></output>}
    </div>
  </section>;
}
