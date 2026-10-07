"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { type PhotoCachePolicy, parsePhotoCachePolicy, photoCacheDurationSchema } from "@/lib/explore/photo-cache-policy";
import { EXPLORE_PROVIDER_COPY } from "@/lib/explore/provider-copy";

const endpoint = "/api/admin/explore/photo-cache";
type CopyKey = Extract<keyof typeof EXPLORE_PROVIDER_COPY, `cache_${string}`>;
function Copy({ name }: { name: CopyKey }) {
  return <EditableTranslation translationKey={`admin.explore.provider.${name}`} defaultText={EXPLORE_PROVIDER_COPY[name]} />;
}
export function ExplorePhotoCacheSettings() {
  const { translate } = useTranslation();
  const [policy, setPolicy] = useState<PhotoCachePolicy | null>(null);
  const [amount, setAmount] = useState("7");
  const [unit, setUnit] = useState(86_400);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<"save" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const apply = useCallback((value: unknown, updateInputs = true) => {
    const next = parsePhotoCachePolicy(value);
    setPolicy(next);
    if (updateInputs) {
      const units = next.successTtlSeconds % 86_400 === 0 ? 86_400 : 3600;
      setUnit(units); setAmount(String(next.successTtlSeconds / units));
    }
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("read_failed");
      const value = await response.json();
      if (!value.photoCache) throw new Error("invalid_configuration");
      if (!signal?.aborted) apply(value.photoCache);
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [apply]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const seconds = Number(amount) * unit;
  const valid = amount.trim() !== "" && photoCacheDurationSchema.safeParse(seconds).success;
  async function mutate(action: "save" | "reset") {
    if (pending || (action === "save" && !valid)) return;
    setPending(action); setError(false); setResult(null);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { action, successTtlSeconds: seconds } : { action }), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("save_failed");
      const value = await response.json();
      if (!value.photoCache) throw new Error("invalid_configuration");
      apply(value.photoCache, action === "save"); setResult(action); setConfirmReset(false);
    } catch { setError(true); setConfirmReset(false); }
    finally { setPending(null); }
  }
  return <div className="mt-4 space-y-3 border-t pt-4" aria-busy={loading || Boolean(pending)}>
    <h3 className="font-medium text-sm"><Copy name="cache_title" /></h3>
    <p className="text-muted-foreground text-xs"><Copy name="cache_description" /></p>
    {loading ? <output className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /><Copy name="cache_loading" /></output> : policy && <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm" aria-label={translate("admin.explore.provider.cache_duration", EXPLORE_PROVIDER_COPY.cache_duration)}>
          <span className="block"><Copy name="cache_duration" /></span>
          <input type="number" min={3600 / unit} max={365 * 86_400 / unit} step="any" className="h-10 w-28 rounded-md border bg-background px-3" value={amount} disabled={Boolean(pending)} onChange={(event) => { setAmount(event.target.value); setResult(null); }} />
        </label>
        <label className="space-y-1 text-sm" aria-label={translate("admin.explore.provider.cache_unit", EXPLORE_PROVIDER_COPY.cache_unit)}>
          <span className="block"><Copy name="cache_unit" /></span>
          <select className="h-10 cursor-pointer rounded-md border bg-background px-3" value={unit} disabled={Boolean(pending)} onChange={(event) => { setUnit(Number(event.target.value)); setResult(null); }}>
            {([[3600, "cache_hours"], [86_400, "cache_days"], [7 * 86_400, "cache_weeks"], [365 * 86_400, "cache_years"]] as const).map(([value, name]) => <option key={value} value={value}>{translate(`admin.explore.provider.${name}`, EXPLORE_PROVIDER_COPY[name])}</option>)}
          </select>
        </label>
        <Button className="cursor-pointer" disabled={Boolean(pending) || !valid || seconds === policy.successTtlSeconds} onClick={() => void mutate("save")}>
          {pending === "save" && <Loader2 className="mr-2 size-4 animate-spin" />}<Copy name={pending === "save" ? "cache_saving" : "cache_save"} />
        </Button>
        <Button variant="outline" className="cursor-pointer" disabled={Boolean(pending)} onClick={() => setConfirmReset(true)}><Copy name="cache_reset" /></Button>
      </div>
      <p className="text-muted-foreground text-xs"><Copy name="cache_note" /></p>
    </>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-800 text-sm dark:text-rose-300"><Copy name="cache_error" /><Button variant="outline" className="cursor-pointer" disabled={loading || Boolean(pending)} onClick={() => void load()}><Copy name="cache_retry" /></Button></div>}
    {result && <output className="block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 text-sm dark:text-emerald-300"><Copy name={result === "save" ? "cache_saved" : "cache_reset_done"} /></output>}
    <AlertDialog open={confirmReset} onOpenChange={(open) => { if (!pending) setConfirmReset(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle><Copy name="cache_reset_title" /></AlertDialogTitle><AlertDialogDescription><Copy name="cache_reset_description" /></AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" className="cursor-pointer" disabled={Boolean(pending)} onClick={() => setConfirmReset(false)}><Copy name="cache_cancel" /></Button>
          <Button className="cursor-pointer" disabled={Boolean(pending)} onClick={() => void mutate("reset")}>
            {pending === "reset" && <Loader2 className="mr-2 size-4 animate-spin" />}<Copy name={pending === "reset" ? "cache_resetting" : "cache_reset"} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
