"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { EXPLORE_PROVIDER_COPY } from "@/lib/explore/provider-copy";
import { EXPLORE_PROVIDERS, type ExploreProvider } from "@/lib/explore/providers";

const names: Record<ExploreProvider, string> = EXPLORE_PROVIDER_COPY;
type Configuration = { provider: ExploreProvider; configured: Record<ExploreProvider, boolean> };
const endpoint = "/api/admin/explore/provider";
function Copy({ name, text }: { name: string; text: string }) {
  return <EditableTranslation translationKey={`admin.explore.provider.${name}`} defaultText={text} />;
}
export function ExploreProviderSettings() {
  const { translate } = useTranslation();
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [selected, setSelected] = useState<ExploreProvider>("openstreetmap");
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
      setConfiguration(value); setSelected(value.provider);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function save() {
    setSaving(true); setError(false); setSaved(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selected }), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error("save_failed");
      setConfiguration(await response.json()); setSaved(true);
    } catch { setError(true); } finally { setSaving(false); }
  }
  return <section className="rounded-xl border bg-card p-5" aria-busy={loading || saving}>
    <h2 className="font-semibold text-lg"><Copy name="title" text="Place search provider" /></h2>
    <p className="mt-1 text-muted-foreground text-sm"><Copy name="description" text="Choose the service used for place results and photos on web and mobile. An explicit selection uses that service without switching to another provider." /></p>
    {loading ? <output className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /><Copy name="loading" text="Loading provider settings…" /></output> : configuration ? <>
      <label htmlFor="explore-provider" className="mt-4 block text-sm">{translate("admin.explore.provider.label", "Provider")}</label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select id="explore-provider" className="h-10 cursor-pointer rounded-md border bg-background px-3 text-sm" value={selected} disabled={saving} onChange={(event) => { setSelected(event.target.value as ExploreProvider); setSaved(false); }}>
          {EXPLORE_PROVIDERS.map((provider) => <option key={provider} value={provider} disabled={!configuration.configured[provider]}>{translate(`admin.explore.provider.${provider}`, names[provider])}</option>)}
        </select>
        <Button className="cursor-pointer" disabled={saving || selected === configuration.provider || !configuration.configured[selected]} onClick={save}>
          {saving && <Loader2 className="mr-2 size-4 animate-spin" />}<Copy name={saving ? "saving" : "save"} text={saving ? "Saving…" : "Save provider"} />
        </Button>
      </div>
      <p className="mt-3 text-muted-foreground text-xs"><Copy name="credentials" text="Services without a configured server API key are unavailable. A configured key still requires an active account, sufficient credits, and the appropriate API enabled." /></p>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs">{(["google", "serper", "serpent"] as const).map((provider) => <li key={provider}><Copy name={provider} text={names[provider]} />: <Copy name={configuration.configured[provider] ? "configured" : "missing"} text={configuration.configured[provider] ? "Key configured" : "Key missing"} /></li>)}</ul>
    </> : null}
    {error && <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-destructive"><Copy name="error" text="Provider settings could not be loaded or saved. Please try again." /><Button variant="outline" className="cursor-pointer" disabled={loading || saving} onClick={() => void load()}><Copy name="retry" text="Reload settings" /></Button></div>}
    {saved && <output className="mt-3 block text-sm"><Copy name="saved" text="Provider saved. New searches will use this selection." /></output>}
  </section>;
}
