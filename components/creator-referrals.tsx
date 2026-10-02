"use client";
import { Loader2, MoreVertical } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { CreatorReferralDashboard } from "@/lib/referrals/creator-dashboard";
import { referralCompactExpiry, referralCompactTerm, referralDate, referralExpiry, referralStatus, referralTerm } from "@/lib/referrals/presentation";

function T({ name, values }: { name: keyof typeof REFERRAL_COPY; values?: Record<string, string | number> }) {
  return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} values={values} />;
}
function Term({ label }: { label: ReturnType<typeof referralTerm> }) {
  return <T name={label.key as keyof typeof REFERRAL_COPY} values={label.values} />;
}
const columns = ["link", "short_expiry", "short_duration", "assigned", "status"] as const;
type ReferralRow = CreatorReferralDashboard["referrals"][number];
function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100); }
  catch { return `${currency} ${(amount / 100).toFixed(2)}`; }
}

export function CreatorReferrals() {
  const { translate } = useTranslation();
  const [data, setData] = useState<CreatorReferralDashboard | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: "copy" | "share" } | null>(null);
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<{ row: ReferralRow; mode: "link" | "details" } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/creator/referrals?page=${page}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const result: CreatorReferralDashboard = await response.json();
      if (!signal?.aborted) { setData(result); setError(false); }
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [page]);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const act = async (id: string, code: string, action: "copy" | "share") => {
    if (pending) return;
    setPending({ id, action });
    try {
      const url = `${window.location.origin}/r/${code}`;
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
    } finally { setPending(null); }
  };
  return <section className="overflow-hidden rounded-2xl border bg-card/70 shadow-sm">
    <header className="space-y-2 border-b px-4 py-4 sm:px-6">
      <h2 className="font-semibold text-lg"><T name="title" /></h2>
      <p className="text-muted-foreground text-sm"><T name="creator_description" /></p>
      {data && !data.earningEnabled ? <p className="text-muted-foreground text-sm"><T name="program_note" /></p> : null}
    </header>
    {loading ? <output className="flex items-center gap-2 p-4"><Loader2 className="size-4 animate-spin" /><T name="loading" /></output> : null}
    {error ? <div className="space-y-2 p-4" role="alert"><p><T name="unavailable" /></p><Button className="cursor-pointer" variant="outline" disabled={loading} onClick={() => void load()}><T name="retry" /></Button></div> : null}
    {data ? <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide"><tr>{columns.map(key => <th className="whitespace-nowrap px-4 py-3 text-left font-medium" scope="col" key={key}><T name={key} /></th>)}<th scope="col" className="px-2"><span className="sr-only"><T name="link_options" /></span></th></tr></thead>
          <tbody className="divide-y divide-border/70">
            {!data.referrals.length ? <tr><td className="p-6 text-center text-muted-foreground" colSpan={columns.length + 1}><T name="empty" /></td></tr> : null}
            {data.referrals.map(row => {
              return <tr key={row.id}>
                <td className="px-4 py-3"><Button className="cursor-pointer whitespace-nowrap px-0 underline" variant="link" onClick={() => setSelected({ row, mode: "link" })}><T name="view_link" /></Button></td>
                <td className="px-4 py-3"><Term label={referralCompactExpiry(row)} /></td>
                <td className="px-4 py-3"><Term label={referralCompactTerm(row)} /></td>
                <td className="whitespace-nowrap px-4 py-3">{referralDate(row.createdAt)}</td>
                <td className="px-4 py-3"><T name={referralStatus(row, data.earningEnabled)} /></td>
                <td className="px-2 py-3"><DropdownMenu><DropdownMenuTrigger asChild><Button className="cursor-pointer" variant="ghost" size="icon" disabled={pending !== null} aria-label={translate("referrals.link_options", REFERRAL_COPY.link_options)}>{pending?.id === row.id ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                  {(["share", "copy"] as const).map(action => <DropdownMenuItem key={action} disabled={pending !== null} onSelect={() => void act(row.id, row.code, action)}><T name={action} /></DropdownMenuItem>)}
                  <DropdownMenuItem onSelect={() => setSelected({ row, mode: "details" })}><T name="details" /></DropdownMenuItem>
                </DropdownMenuContent></DropdownMenu></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 border-t p-4"><Button className="cursor-pointer" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button className="cursor-pointer" variant="outline" disabled={page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
    </> : null}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      {selected ? <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader><DialogTitle><T name={selected.mode === "link" ? "link" : "link_details"} /></DialogTitle><DialogDescription><T name={selected.mode === "link" ? "share_message" : "link_details_description"} /></DialogDescription></DialogHeader>
        <a className="cursor-pointer break-all underline" href={`/r/${selected.row.code}`} target="_blank" rel="noopener noreferrer">{origin}/r/{selected.row.code}</a>
        {selected.mode === "details" ? <>
          <dl className="grid grid-cols-2 gap-4 text-sm">{([
            ["commission_percentage", `${selected.row.percentage}%`], ["short_duration", <Term key="duration" label={referralTerm(selected.row)} />],
            ["short_expiry", <Term key="expiry" label={referralExpiry(selected.row)} />], ["assigned", referralDate(selected.row.createdAt)],
            ["status", <T key="status" name={referralStatus(selected.row, data?.earningEnabled ?? false)} />], ["signups", selected.row.signups],
          ] as const).map(([key, value]) => <div key={key}><dt className="text-muted-foreground"><T name={key} /></dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
          {!selected.row.balances.length ? <p className="text-muted-foreground text-sm"><T name="no_activity" /></p> : selected.row.balances.map(balance => <div className="space-y-3 rounded-lg border p-4" key={balance.currency}>
            <h3 className="font-medium"><T name="balance_chart" /> · {balance.currency}</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt><T name="recharges" /></dt><dd>{balance.recharges ?? 0}</dd></div><div><dt><T name="revenue" /></dt><dd>{money(balance.revenue ?? 0, balance.currency)}</dd></div></dl>
            {(["earned", "paid", "remaining"] as const).map((field, index) => <div key={field} className="space-y-1"><div className="flex justify-between gap-3 text-sm"><T name={field} /><span>{money(balance[field], balance.currency)}</span></div><div className="h-2 overflow-hidden rounded bg-muted" aria-hidden="true"><div className={["bg-blue-500", "bg-emerald-500", "bg-amber-500"][index]} style={{ height: "100%", width: `${Math.max(0, balance[field]) / Math.max(1, balance.earned, balance.paid, balance.remaining) * 100}%` }} /></div></div>)}
          </div>)}
        </> : null}
        <div className="flex flex-wrap gap-2">{(["share", "copy"] as const).map(action => <Button key={action} className="cursor-pointer" variant="outline" disabled={pending !== null} onClick={() => void act(selected.row.id, selected.row.code, action)}>{pending?.id === selected.row.id && pending.action === action ? <><Loader2 className="size-4 animate-spin" /><T name={action === "share" ? "sharing" : "copying"} /></> : <T name={action} />}</Button>)}<DialogClose className="cursor-pointer"><T name="close" /></DialogClose></div>
      </DialogContent> : null}
    </Dialog>
  </section>;
}
