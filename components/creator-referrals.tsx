"use client";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { CreatorReferralDashboard } from "@/lib/referrals/creator-dashboard";
import { referralDate, referralExpiry, referralStatus, referralTerm } from "@/lib/referrals/presentation";

function T({ name, values }: { name: keyof typeof REFERRAL_COPY; values?: Record<string, string | number> }) {
  return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} values={values} />;
}
function Term({ label }: { label: ReturnType<typeof referralTerm> }) {
  return <T name={label.key as keyof typeof REFERRAL_COPY} values={label.values} />;
}
const columns = ["link", "percentage", "duration", "expiry", "assigned", "status", "signups", "recharges", "revenue", "earned", "paid", "remaining"] as const;

export function CreatorReferrals() {
  const { translate } = useTranslation();
  const [data, setData] = useState<CreatorReferralDashboard | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: "copy" | "share" } | null>(null);
  const [origin, setOrigin] = useState("");
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
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide"><tr>{columns.map(key => <th className="whitespace-nowrap px-4 py-3 text-left font-medium" scope="col" key={key}><T name={key} /></th>)}</tr></thead>
          <tbody className="divide-y divide-border/70">
            {!data.referrals.length ? <tr><td className="p-6 text-center text-muted-foreground" colSpan={columns.length}><T name="empty" /></td></tr> : null}
            {data.referrals.map(row => {
              const money = (field: "earned" | "paid" | "remaining" | "revenue") => row.balances.length ? row.balances.map(balance => <div className="whitespace-nowrap" key={balance.currency}>{balance.currency} {(balance[field] / 100).toFixed(2)}</div>) : "—";
              return <tr key={row.id}>
                <td className="min-w-80 px-4 py-3"><a className="cursor-pointer break-all underline" href={`/r/${row.code}`}>{origin}/r/{row.code}</a>
                  <div className="mt-3 flex gap-2">{(["share", "copy"] as const).map(action => <Button className="cursor-pointer whitespace-nowrap" key={action} variant="outline" disabled={pending !== null} onClick={() => void act(row.id, row.code, action)}>{pending?.id === row.id && pending.action === action ? <><Loader2 className="size-4 animate-spin" /><T name={action === "share" ? "sharing" : "copying"} /></> : <T name={action} />}</Button>)}</div>
                </td>
                <td className="px-4 py-3">{row.percentage}%</td>
                <td className="min-w-48 px-4 py-3"><Term label={referralTerm(row)} /></td>
                <td className="min-w-48 px-4 py-3"><Term label={referralExpiry(row)} /></td>
                <td className="whitespace-nowrap px-4 py-3">{referralDate(row.createdAt)}</td>
                <td className="px-4 py-3"><T name={referralStatus(row, data.earningEnabled)} /></td>
                <td className="px-4 py-3">{row.signups}</td>
                <td className="px-4 py-3">{row.balances.reduce((sum, balance) => sum + balance.recharges, 0)}</td>
                <td className="px-4 py-3">{money("revenue")}</td>
                <td className="px-4 py-3">{money("earned")}</td>
                <td className="px-4 py-3">{money("paid")}</td>
                <td className="px-4 py-3">{money("remaining")}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 border-t p-4"><Button className="cursor-pointer" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button className="cursor-pointer" variant="outline" disabled={page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
    </> : null}
  </section>;
}
