"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPromotionSection, PromotionActions, PromotionDeleteDialog, PromotionText as T } from "@/components/admin-promotion-controls";
import { useTranslation } from "@/components/language-provider";
import { useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FeatureAccessMode } from "@/lib/feature-access";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { ReferralDashboard } from "@/lib/referrals/service";
import type { CreatorOption } from "./admin-coupons-manager";

type Data = ReferralDashboard & { settings: { referralAccessMode: FeatureAccessMode; couponAccessMode: FeatureAccessMode } };
type Referral = Data["referrals"][number];
const cell = "px-3 py-3 text-left align-top";
const labelClass = "flex flex-col gap-2 text-sm";
const selectClass = "h-10 cursor-pointer rounded-md border bg-background px-3";
const money = (amount: number, currency: string) => `${currency} ${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminReferralsManager({ creators, creatorsConfirmed }: { creators: CreatorOption[]; creatorsConfirmed: boolean }) {
  const { translate } = useTranslation();
  const creatorPlaceholder = useEditableTranslation("referrals.select_creator", REFERRAL_COPY.select_creator);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<"unavailable" | "delete_in_use" | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState("");
  const [duration, setDuration] = useState("indefinite");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/referrals?page=${page}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      setData(await response.json()); setError(null);
    } catch { setError("unavailable"); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  async function mutate(id: string, url: string, body: unknown, method = "PATCH") {
    if (pending) return false;
    setPending(id); setError(null);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (!response.ok) { setError(response.status === 409 ? "delete_in_use" : "unavailable"); return false; }
      if (id === "create") { setCreatorId(""); setCreateOpen(false); }
      toast.success(translate("referrals.saved", REFERRAL_COPY.saved));
      await load(); return true;
    } catch { setError("unavailable"); return false; }
    finally { setPending(null); }
  }
  const rule = (row: Referral) => <><T name={row.duration as "indefinite"} />{row.months ? ` (${row.months})` : ""}{row.windowDays ? ` (${row.windowDays})` : ""}{row.rechargeBefore ? ` · ${new Date(row.rechargeBefore).toLocaleString()}` : ""}</>;
  const totals = (row: Referral, field: "earned" | "paid" | "remaining" | "revenue") => row.balances.length ? row.balances.map(balance => <div key={balance.currency}>{money(balance[field], balance.currency)}</div>) : "—";
  const feedback = error ? <div className="text-sm text-destructive" role="alert"><T name={error} /> <Button disabled={loading} onClick={() => void load()} size="sm" variant="outline"><T name="retry" /></Button></div> : null;

  return <div className="space-y-6">
    {feedback}
    <AdminPromotionSection title={<T name="title" />} description={<T name="inventory_description" />} actions={<><Button className="cursor-pointer" onClick={() => setSettingsOpen(true)} variant="outline"><T name="settings" /></Button><Button className="cursor-pointer" disabled={!creatorsConfirmed || !creators.length || !data} onClick={() => { setCreatorId(""); setDuration("indefinite"); setCreateOpen(true); }}><T name="add_new" /></Button></>}>
      {loading ? <output className="text-sm text-muted-foreground"><T name="loading" /></output> : null}
      <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr>{(["code", "creator", "validity", "percentage", "signups", "recharges", "revenue", "reward", "payouts", "payout_status", "status", "actions"] as const).map(name => <th className={`${cell} font-medium`} key={name}><T name={name} /></th>)}</tr></thead><tbody className="divide-y divide-border/50">
        {data?.referrals.map(row => <tr key={row.id}>
          <td className={`${cell} max-w-52 font-mono`}><button className="cursor-pointer break-all text-left underline-offset-2 hover:underline" onClick={() => setDetailsId(row.id)} type="button">{row.code}</button></td>
          <td className={cell}>{row.creatorName ?? "—"}</td><td className={`${cell} min-w-48 text-xs text-muted-foreground`}>{rule(row)}</td><td className={cell}>{row.percentage}%</td><td className={cell}>{row.signups}</td><td className={cell}>{row.balances.reduce((sum, balance) => sum + balance.recharges, 0)}</td><td className={`${cell} whitespace-nowrap`}>{totals(row, "revenue")}</td><td className={`${cell} whitespace-nowrap`}>{totals(row, "earned")}</td><td className={`${cell} whitespace-nowrap`}>{totals(row, "paid")}</td><td className={`${cell} whitespace-nowrap`}>{row.balances.length ? row.balances.map(balance => <div key={balance.currency}><T name={balance.remaining > 0 ? "remaining" : "paid"} />: {money(balance.remaining, balance.currency)}</div>) : <T name="no_activity" />}</td>
          <td className={cell}><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}><T name={row.isActive ? "active" : "inactive"} /></span></td>
          <td className={cell}><PromotionActions label={translate("referrals.operations", REFERRAL_COPY.operations).replace("{code}", row.code)} disabled={pending !== null} items={[
            { name: "copy", action: async () => { await navigator.clipboard.writeText(`${window.location.origin}/r/${row.code}`); toast.success(translate("referrals.copied", REFERRAL_COPY.copied)); } },
            { name: "details", action: () => setDetailsId(row.id) },
            { name: row.isActive ? "make_inactive" : "make_active", action: () => mutate(row.id, "/api/admin/referrals", { action: "status", id: row.id, active: !row.isActive }) },
            { name: "delete", destructive: true, disabled: row.signups > 0 || row.balances.length > 0, action: () => setDeleteId(row.id) },
          ]} />{pending === row.id ? <output className="text-xs"><T name="saving" /></output> : null}</td>
        </tr>)}
        {!data || !data.referrals.length ? <tr><td className={`${cell} text-center text-muted-foreground`} colSpan={12}><T name={data ? "empty" : error ? "unavailable" : "loading"} /></td></tr> : null}
      </tbody></table></div>
      <div className="mt-4 flex gap-3"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button variant="outline" disabled={!data || page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
      <p className="mt-3 text-xs text-muted-foreground"><T name="delete_description" /></p>
    </AdminPromotionSection>

    <Dialog open={settingsOpen} onOpenChange={value => { if (!pending) setSettingsOpen(value); }}><DialogContent><DialogHeader><DialogTitle><T name="settings" /></DialogTitle><DialogDescription><T name="description" /></DialogDescription></DialogHeader>{feedback}{data ? <div className="space-y-4">{(["referralAccessMode", "couponAccessMode"] as const).map(field => <label className={labelClass} key={field}><T name={field === "referralAccessMode" ? "referral_access" : "coupon_access"} /><select className={selectClass} value={data.settings[field]} disabled={pending !== null} onChange={event => void mutate(field, "/api/admin/feature-access", { fieldName: field, mode: event.target.value }, "POST")}>{(["disabled", "admin_only", "enabled"] as const).map(mode => <option value={mode} key={mode}>{translate(`referrals.${mode}`, REFERRAL_COPY[mode])}</option>)}</select>{pending === field ? <T name="saving" /> : null}</label>)}</div> : <T name="loading" />}</DialogContent></Dialog>

    <Dialog open={createOpen} onOpenChange={value => { if (!pending) setCreateOpen(value); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle><T name="add_new" /></DialogTitle><DialogDescription><T name="description" /></DialogDescription></DialogHeader>{feedback}
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      if (!creatorId || pending) return;
      const form = new FormData(event.currentTarget);
      const cutoff = String(form.get("cutoff") ?? "");
      void mutate("create", "/api/admin/referrals", {
        creatorId: form.get("creator"), percentage: Number(form.get("percentage")), duration,
        months: duration === "months" ? Number(form.get("months")) : null,
        windowDays: duration === "signup_window" && !cutoff ? Number(form.get("days")) : null,
        rechargeBefore: duration === "signup_window" && cutoff ? new Date(cutoff).toISOString() : null,
      }, "POST");
    }}>
      <label className={labelClass}><span><T name="creator" />{creatorPlaceholder.editButton}</span><select name="creator" className={selectClass} value={creatorId} onChange={event => setCreatorId(event.target.value)} required disabled={!creatorsConfirmed || pending !== null}><option value="" disabled>{creatorPlaceholder.text}</option>{creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>
      <label className={labelClass} htmlFor="referral-percentage" aria-label={translate("referrals.percentage", REFERRAL_COPY.percentage)}><T name="percentage" /><input className="h-10 rounded-md border bg-background px-3" id="referral-percentage" name="percentage" type="number" min={1} max={100} step={1} required /></label>
      <label className={labelClass}><T name="duration" /><select name="duration" className={selectClass} value={duration} onChange={event => setDuration(event.target.value)}>{(["indefinite", "months", "first_recharge", "signup_window"] as const).map(mode => <option value={mode} key={mode}>{translate(`referrals.${mode}`, REFERRAL_COPY[mode])}</option>)}</select></label>
      {duration === "months" ? <label className={labelClass} htmlFor="referral-months" aria-label={translate("referrals.month_count", REFERRAL_COPY.month_count)}><T name="month_count" /><input className="h-10 rounded-md border bg-background px-3" id="referral-months" name="months" type="number" min={1} max={1200} step={1} required /></label> : null}
      {duration === "signup_window" ? <><label className={labelClass} htmlFor="referral-days" aria-label={translate("referrals.window_days", REFERRAL_COPY.window_days)}><T name="window_days" /><input className="h-10 rounded-md border bg-background px-3" id="referral-days" name="days" type="number" min={1} max={36500} step={1} /></label><label className={labelClass} htmlFor="referral-cutoff" aria-label={translate("referrals.cutoff", REFERRAL_COPY.cutoff)}><T name="cutoff" /><input className="h-10 rounded-md border bg-background px-3" id="referral-cutoff" name="cutoff" type="datetime-local" /></label></> : null}
      <div className="sm:col-span-2"><p className="mb-3 text-xs text-muted-foreground"><T name="rule_note" /></p><Button type="submit" disabled={!data || !creatorsConfirmed || !creatorId || !creators.length || pending !== null}>{pending === "create" ? <T name="saving" /> : <T name="create" />}</Button></div>
    </form>
    </DialogContent></Dialog>

    <Dialog open={Boolean(detailsId)} onOpenChange={value => { if (!value && !pending) setDetailsId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle><T name="details" /></DialogTitle><DialogDescription><T name="inventory_description" /></DialogDescription></DialogHeader>{feedback}
    {data?.referrals.filter(row => row.id === detailsId).map(referral => <div className="space-y-3 rounded-lg border p-4" key={referral.id}>
      <p className="font-medium">{referral.creatorName} · {referral.percentage}% · <T name={referral.duration as "indefinite"} /> {referral.months ?? referral.windowDays ?? ""} {referral.rechargeBefore ? new Date(referral.rechargeBefore).toLocaleString() : ""}</p>
      <p><T name="signups" />: {referral.signups}</p>
      <a className="block cursor-pointer break-all underline" href={`/r/${referral.code}`} target="_blank" rel="noreferrer">{typeof window === "undefined" ? "" : window.location.origin}/r/{referral.code}</a>
      <Button variant="outline" disabled={pending !== null} onClick={() => void mutate(referral.id, "/api/admin/referrals", { action: "status", id: referral.id, active: !referral.isActive })}>{pending === referral.id ? <T name="saving" /> : <T name={referral.isActive ? "pause" : "activate"} />}</Button>
      {referral.balances.map(balance => <div className="space-y-3" key={balance.currency}>
        <p>{balance.currency} · <T name="earned" /> {(balance.earned / 100).toFixed(2)} · <T name="paid" /> {(balance.paid / 100).toFixed(2)} · <T name="remaining" /> {(balance.remaining / 100).toFixed(2)}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void mutate(`payout-${referral.id}`, "/api/admin/referrals", { action: "payout", referralId: referral.id, currency: balance.currency, amount: Math.round(Number(form.get("amount")) * 100), note: String(form.get("note") ?? "") });
        }}><label className={labelClass} htmlFor={`payout-amount-${referral.id}-${balance.currency}`} aria-label={translate("referrals.amount", REFERRAL_COPY.amount)}><T name="amount" /><input className="h-10 rounded-md border bg-background px-3" type="number" id={`payout-amount-${referral.id}-${balance.currency}`} name="amount" min="0.01" max={Math.max(balance.remaining, 0) / 100} step="0.01" required /></label><label className={labelClass} htmlFor={`payout-note-${referral.id}-${balance.currency}`} aria-label={translate("referrals.note", REFERRAL_COPY.note)}><T name="note" /><input className="h-10 rounded-md border bg-background px-3" id={`payout-note-${referral.id}-${balance.currency}`} name="note" maxLength={500} /></label><Button type="submit" disabled={pending !== null || balance.remaining <= 0}>{pending === `payout-${referral.id}` ? <T name="saving" /> : <T name="payout" />}</Button><p className="w-full text-xs text-muted-foreground"><T name="payout_note" /></p></form>
      </div>)}
    </div>)}

    </DialogContent></Dialog>
    <PromotionDeleteDialog open={Boolean(deleteId)} onOpenChange={value => { if (!value) setDeleteId(null); }} onDelete={() => mutate(`delete-${deleteId}`, "/api/admin/referrals", { id: deleteId }, "DELETE")} />

    <AdminPromotionSection title={<T name="recent" />}><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr>{(["code", "revenue", "percentage", "reward", "status", "actions"] as const).map(name => <th className={cell} key={name}><T name={name} /></th>)}</tr></thead><tbody>{data?.recentCommissions.map(commission => <tr className="border-b" key={commission.orderId}><td className={`${cell} break-all`}>{commission.orderId}</td><td className={cell}>{money(commission.paymentAmount, commission.currency)}</td><td className={cell}>{commission.percentage}%</td><td className={cell}>{money(commission.amount, commission.currency)}</td><td className={cell}><T name={commission.reversed ? "reversed" : "earned"} /></td><td className={cell}><PromotionActions label={translate("referrals.operations", REFERRAL_COPY.operations).replace("{code}", commission.orderId)} disabled={pending !== null} items={[{ name: "reverse", disabled: commission.reversed, action: () => mutate(commission.orderId, "/api/admin/referrals", { action: "reverse", orderId: commission.orderId }) }]} />{pending === commission.orderId ? <T name="saving" /> : null}</td></tr>)}{!data?.recentCommissions.length ? <tr><td colSpan={6} className={cell}><T name={data ? "no_activity" : "loading"} /></td></tr> : null}</tbody></table></div></AdminPromotionSection>
  </div>;
}
