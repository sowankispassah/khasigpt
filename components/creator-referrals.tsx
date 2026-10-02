"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Copy, Info, Link2, Loader2, MoreVertical, Share2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { CreatorReferralDashboard } from "@/lib/referrals/creator-dashboard";
import { creatorPlayStoreUrl } from "@/lib/referrals/links";
import { referralCompactExpiry, referralDate, referralExpiry, referralStatus, referralTerm } from "@/lib/referrals/presentation";

function T({ name, values }: { name: keyof typeof REFERRAL_COPY; values?: Record<string, string | number> }) {
  return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} values={values} />;
}
function Term({ label }: { label: ReturnType<typeof referralTerm> }) {
  return <T name={label.key as keyof typeof REFERRAL_COPY} values={label.values} />;
}
type ReferralRow = CreatorReferralDashboard["referrals"][number];
function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100); }
  catch { return `${currency} ${(amount / 100).toFixed(2)}`; }
}
function Status({ row }: { row: ReferralRow }) {
  const status = referralStatus(row);
  const color = status === "active" ? "text-emerald-700 dark:text-emerald-400" : status === "expired" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold text-xs ${color}`}><span className="size-1.5 rounded-full bg-current" /><T name={status} /></span>;
}

export function CreatorReferrals() {
  const { translate } = useTranslation();
  const [data, setData] = useState<CreatorReferralDashboard | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: "copy" | "share" } | null>(null);
  const [selected, setSelected] = useState<{ row: ReferralRow; mode: "link" | "details" } | null>(null);
  const generation = useRef(0);
  const actionInFlight = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/creator/referrals?page=${page}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const result: CreatorReferralDashboard = await response.json();
      if (!signal?.aborted && request === generation.current) { setData(result); setError(false); }
    } catch { if (!signal?.aborted && request === generation.current) setError(true); }
    finally { if (!signal?.aborted && request === generation.current) setLoading(false); }
  }, [page]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => { controller.abort(); generation.current++; }; }, [load]);
  const act = async (id: string, code: string, action: "copy" | "share") => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPending({ id, action });
    try {
      const url = creatorPlayStoreUrl(code);
      if (action === "share" && navigator.share) {
        await navigator.share({ title: "KhasiGPT", text: translate("referrals.share_message", REFERRAL_COPY.share_message), url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(translate("referrals.copied", REFERRAL_COPY.copied));
      }
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) {
        const key = action === "share" ? "share_unavailable" : "copy_unavailable";
        toast.error(translate(`referrals.${key}`, REFERRAL_COPY[key]));
      }
    } finally { actionInFlight.current = false; setPending(null); }
  };
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / 20));
  return <section aria-labelledby="earnings-referral-links" className="space-y-4">
    <header className="flex items-center justify-between gap-3">
      <h2 id="earnings-referral-links" className="font-semibold text-xl tracking-tight"><T name="mobile_links" /></h2>
      {loading ? <output><Loader2 className="size-4 animate-spin" /><span className="sr-only"><T name="loading" /></span></output> : data ? <span className="text-muted-foreground text-sm">{data.totalCount}</span> : null}
    </header>
    {data && !data.earningEnabled ? <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-muted-foreground text-xs leading-relaxed"><Info className="mt-0.5 size-4 shrink-0" /><T name="mobile_program_note" /></p> : null}
    {error ? <div className="space-y-3 rounded-2xl border p-4" role="alert"><p className="text-muted-foreground text-sm"><T name="unavailable" /></p><Button className="cursor-pointer" variant="outline" disabled={loading} onClick={() => void load()}>{loading ? <Loader2 className="size-4 animate-spin" /> : null}<T name="retry" /></Button></div> : null}
    {data?.referrals.length === 0 ? <div className="flex flex-col items-center gap-3 rounded-3xl bg-muted px-5 py-8 text-center text-muted-foreground text-sm"><Link2 className="size-6" /><T name="empty" /></div> : null}
    <div className="grid gap-4 md:grid-cols-2">
      {data?.referrals.map(row => <article key={row.id} className="min-w-0 space-y-5 rounded-3xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <button type="button" className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-left font-semibold text-sm hover:opacity-70" onClick={() => setSelected({ row, mode: "link" })}><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Link2 className="size-4" /></span><T name="view_link" /><ArrowUpRight className="size-3.5 text-muted-foreground" /></button>
          <Status row={row} />
          <DropdownMenu><DropdownMenuTrigger asChild><Button className="size-11 shrink-0 cursor-pointer text-muted-foreground" variant="ghost" size="icon" disabled={pending !== null} aria-label={translate("referrals.link_options", REFERRAL_COPY.link_options)}>{pending?.id === row.id ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-5" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52 rounded-2xl p-2">
            {(["share", "copy"] as const).map(action => <DropdownMenuItem className="min-h-11 cursor-pointer gap-3 rounded-xl" key={action} disabled={pending !== null} onSelect={() => void act(row.id, row.code, action)}>{action === "share" ? <Share2 className="size-4" /> : <Copy className="size-4" />}<T name={action} /></DropdownMenuItem>)}
            <DropdownMenuItem className="min-h-11 cursor-pointer gap-3 rounded-xl" onSelect={() => setSelected({ row, mode: "details" })}><Info className="size-4" /><T name="details" /></DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
        <div className="space-y-1.5"><p className="text-muted-foreground text-xs"><T name="short_duration" /></p><p className="font-semibold text-base"><Term label={referralTerm(row)} /></p></div>
        <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm"><div className="min-w-0"><dt className="text-muted-foreground text-xs"><T name="short_expiry" /></dt><dd className="mt-1.5"><Term label={referralCompactExpiry(row)} /></dd></div><div><dt className="text-muted-foreground text-xs"><T name="assigned" /></dt><dd className="mt-1.5">{referralDate(row.createdAt)}</dd></div></dl>
      </article>)}
    </div>
    {totalPages > 1 ? <div className="flex items-center justify-center gap-3"><Button className="cursor-pointer" variant="ghost" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /><T name="previous" /></Button><span className="text-muted-foreground text-sm">{page} / {totalPages}</span><Button className="cursor-pointer" variant="ghost" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}><T name="next" /><ChevronRight className="size-4" /></Button></div> : null}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      {selected ? <DialogContent className="bottom-0 top-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg translate-y-0 flex-col gap-0 overflow-hidden rounded-t-3xl border bg-card p-0 sm:bottom-auto sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:translate-y-[-50%] sm:rounded-3xl">
        <DialogHeader className="shrink-0 px-6 pt-5 text-left"><div className="flex items-center justify-between gap-3"><DialogTitle className="font-bold text-xl tracking-tight"><T name={selected.mode === "link" ? "link" : "link_details"} /></DialogTitle><DialogClose className="size-11 shrink-0 cursor-pointer rounded-full border-0 bg-muted p-0" aria-label={translate("referrals.close", REFERRAL_COPY.close)}><X className="size-4" /></DialogClose></div><DialogDescription className="sr-only"><T name="mobile_link_hint" /></DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-3 rounded-2xl bg-muted p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card"><ArrowUpRight className="size-5" /></span><div className="min-w-0 flex-1 space-y-1"><p className="font-semibold text-sm"><T name="play_destination" /></p><p className="text-muted-foreground text-xs leading-relaxed"><T name="mobile_link_hint" /></p></div><Status row={selected.row} /></div>
          {selected.mode === "link" ? <><a className="block cursor-pointer break-all rounded-2xl border p-4 text-muted-foreground text-xs leading-relaxed underline" href={creatorPlayStoreUrl(selected.row.code)} target="_blank" rel="noopener noreferrer">{creatorPlayStoreUrl(selected.row.code)}</a><Button className="cursor-pointer" variant="ghost" onClick={() => setSelected({ ...selected, mode: "details" })}><T name="details" /><ChevronRight className="size-4" /></Button></> : <>
            <div className="space-y-1"><p className="text-muted-foreground text-xs"><T name="commission_percentage" /></p><p className="font-bold text-4xl tracking-tight">{selected.row.percentage}%</p></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">{([
              ["short_duration", <Term key="duration" label={referralTerm(selected.row)} />], ["short_expiry", <Term key="expiry" label={referralExpiry(selected.row)} />],
              ["assigned", referralDate(selected.row.createdAt)], ["signups", selected.row.signups],
            ] as const).map(([key, value]) => <div className="rounded-2xl bg-muted p-4" key={key}><dt className="text-muted-foreground text-xs"><T name={key} /></dt><dd className="mt-2 font-medium">{value}</dd></div>)}</dl>
            {!selected.row.balances.length ? <p className="py-4 text-center text-muted-foreground text-sm"><T name="no_activity" /></p> : selected.row.balances.map(balance => <div className="space-y-4" key={balance.currency}>
              <h3 className="flex justify-between gap-3 font-semibold text-sm"><T name="balance_chart" /><span className="text-muted-foreground text-xs">{balance.currency}</span></h3>
              {(["earned", "paid", "remaining"] as const).map((field, index) => <div key={field} className="space-y-2"><div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground"><T name={field} /></span><span className="font-semibold">{money(balance[field], balance.currency)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={["bg-foreground", "bg-emerald-500", "bg-amber-500"][index]} style={{ height: "100%", borderRadius: 3, width: `${Math.max(0, balance[field]) / Math.max(1, balance.earned, balance.paid, balance.remaining) * 100}%` }} /></div></div>)}
              <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><dt className="text-muted-foreground text-xs"><T name="recharges" /></dt><dd className="mt-1">{balance.recharges ?? 0}</dd></div><div><dt className="text-muted-foreground text-xs"><T name="revenue" /></dt><dd className="mt-1">{money(balance.revenue ?? 0, balance.currency)}</dd></div></dl>
            </div>)}
          </>}
        </div>
        <div className="flex shrink-0 gap-3 border-t px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button className="h-13 min-w-0 flex-1 cursor-pointer rounded-2xl" disabled={pending !== null} onClick={() => void act(selected.row.id, selected.row.code, "share")}>{pending?.id === selected.row.id && pending.action === "share" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}<T name={pending?.action === "share" ? "sharing" : "share"} /></Button>
          <Button className="size-13 shrink-0 cursor-pointer rounded-2xl" variant="outline" aria-label={translate("referrals.copy", REFERRAL_COPY.copy)} disabled={pending !== null} onClick={() => void act(selected.row.id, selected.row.code, "copy")}>{pending?.id === selected.row.id && pending.action === "copy" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}</Button>
        </div>
      </DialogContent> : null}
    </Dialog>
  </section>;
}
