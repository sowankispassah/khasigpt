"use client";

import { Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminEmptyState, AdminNotice, AdminStatusPill } from "@/components/admin/admin-ui";
import { AdminPromotionSection, PromotionActions, PromotionDeleteDialog, PromotionText as T } from "@/components/admin-promotion-controls";
import { useTranslation } from "@/components/language-provider";
import { useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FeatureAccessMode } from "@/lib/feature-access";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import { creatorPlayStoreUrl } from "@/lib/referrals/links";
import type { ReferralDashboard } from "@/lib/referrals/service";
import type { CreatorOption } from "./admin-coupons-manager";

type Data = ReferralDashboard & { settings: { referralAccessMode: FeatureAccessMode; couponAccessMode: FeatureAccessMode } };
type Referral = Data["referrals"][number];
const cell = "px-4 py-3 text-left align-top";
const headCell = "px-4 py-2.5 text-left font-medium";
const labelClass = "flex flex-col gap-2 text-sm";
const selectClass = "h-10 cursor-pointer rounded-lg border bg-background px-3";
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
  const feedback = error ? <AdminNotice className="flex flex-wrap items-center justify-between gap-2" tone="danger"><T name={error} /><Button className="cursor-pointer" disabled={loading} onClick={() => void load()} size="sm" variant="outline"><T name="retry" /></Button></AdminNotice> : null;
  const statusPill = (row: Referral) => <AdminStatusPill tone={row.isActive ? "success" : "neutral"}><T name={row.isActive ? "active" : "inactive"} /></AdminStatusPill>;
  const rowActions = (row: Referral) => <div className="flex items-center justify-end gap-1"><PromotionActions label={translate("referrals.operations", REFERRAL_COPY.operations).replace("{code}", row.code)} disabled={pending !== null} items={[
    { name: "copy", action: async () => { await navigator.clipboard.writeText(creatorPlayStoreUrl(row.code)); toast.success(translate("referrals.copied", REFERRAL_COPY.copied)); } },
    { name: "details", action: () => setDetailsId(row.id) },
    { name: row.isActive ? "make_inactive" : "make_active", action: () => mutate(row.id, "/api/admin/referrals", { action: "status", id: row.id, active: !row.isActive }) },
    { name: "delete", destructive: true, disabled: row.signups > 0 || row.balances.length > 0, action: () => setDeleteId(row.id) },
  ]} />{pending === row.id ? <output className="text-muted-foreground text-xs"><T name="saving" /></output> : null}</div>;
  const codeButton = (row: Referral, className = "break-all") => <button className={`cursor-pointer text-left font-mono font-semibold underline-offset-2 hover:underline ${className}`} onClick={() => setDetailsId(row.id)} type="button">{row.code}</button>;
  const rechargeCount = (row: Referral) => row.balances.reduce((sum, balance) => sum + balance.recharges, 0);
  const payoutSummary = (row: Referral) => row.balances.length ? row.balances.map(balance => <div key={balance.currency}><T name="paid" /> {money(balance.paid, balance.currency)} · <T name="remaining" /> {money(balance.remaining, balance.currency)}</div>) : <T name="no_activity" />;

  return <div className="space-y-6">
    {feedback}
    <AdminPromotionSection title={<T name="title" />} description={<T name="inventory_description" />} actions={<><Button className="cursor-pointer" onClick={() => setSettingsOpen(true)} variant="outline"><Settings2 className="size-4" /><T name="settings" /></Button><Button className="cursor-pointer" disabled={!creatorsConfirmed || !creators.length || !data} onClick={() => { setCreatorId(""); setDuration("indefinite"); setCreateOpen(true); }}><Plus className="size-4" /><T name="add_new" /></Button></>}>
      {loading ? <output className="block px-5 pt-3 text-muted-foreground text-sm"><T name="loading" /></output> : null}
      {!data || !data.referrals.length ? (
        <AdminEmptyState title={<T name={data ? "empty" : error ? "unavailable" : "loading"} />} />
      ) : (
        <>
          <ul className="divide-y divide-border/60 md:hidden">
            {data.referrals.map(row => <li className="space-y-2 px-5 py-4" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">{codeButton(row)}<p className="truncate text-muted-foreground text-xs">{row.creatorName ?? "—"} · {row.percentage}%</p></div>
                <div className="flex shrink-0 items-center gap-1">{statusPill(row)}{rowActions(row)}</div>
              </div>
              <p className="text-muted-foreground text-xs">{rule(row)}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-muted-foreground text-xs"><T name="signups" /></dt><dd className="tabular-nums">{row.signups} · {rechargeCount(row)} <T name="recharges" /></dd></div>
                <div><dt className="text-muted-foreground text-xs"><T name="revenue" /></dt><dd className="tabular-nums">{totals(row, "revenue")}</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground text-xs"><T name="payouts" /></dt><dd className="tabular-nums">{payoutSummary(row)}</dd></div>
              </dl>
            </li>)}
          </ul>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-sm"><thead className="border-b bg-muted/40 text-muted-foreground text-xs"><tr>
            <th className={headCell}><T name="code" /></th>
            <th className={headCell}><T name="validity" /></th>
            <th className={`${headCell} text-right`}><T name="percentage" /></th>
            <th className={`${headCell} text-right`}><T name="signups" /></th>
            <th className={`${headCell} text-right`}><T name="revenue" /></th>
            <th className={`${headCell} text-right`}><T name="reward" /></th>
            <th className={headCell}><T name="payout_status" /></th>
            <th className={headCell}><T name="status" /></th>
            <th className={headCell}><span className="sr-only"><T name="actions" /></span></th>
          </tr></thead><tbody className="divide-y divide-border/60">
            {data.referrals.map(row => <tr className="transition hover:bg-muted/30" key={row.id}>
              <td className={`${cell} min-w-44`}>{codeButton(row, "whitespace-nowrap")}<span className="block text-muted-foreground text-xs">{row.creatorName ?? "—"}</span></td>
              <td className={`${cell} min-w-44 text-muted-foreground text-xs`}>{rule(row)}</td>
              <td className={`${cell} text-right tabular-nums`}>{row.percentage}%</td>
              <td className={`${cell} text-right tabular-nums`}><span className="font-medium">{row.signups}</span><span className="block text-muted-foreground text-xs">{rechargeCount(row)} <T name="recharges" /></span></td>
              <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{totals(row, "revenue")}</td>
              <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{totals(row, "earned")}</td>
              <td className={`${cell} whitespace-nowrap text-xs tabular-nums`}>{payoutSummary(row)}</td>
              <td className={cell}>{statusPill(row)}</td>
              <td className={cell}>{rowActions(row)}</td>
            </tr>)}
          </tbody></table></div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
        <p className="text-muted-foreground text-xs"><T name="delete_description" /></p>
        <div className="flex gap-2"><Button className="cursor-pointer" size="sm" variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button className="cursor-pointer" size="sm" variant="outline" disabled={!data || page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
      </div>
    </AdminPromotionSection>

    <Dialog open={settingsOpen} onOpenChange={value => { if (!pending) setSettingsOpen(value); }}><DialogContent><DialogHeader><DialogTitle><T name="settings" /></DialogTitle><DialogDescription><T name="description" /></DialogDescription></DialogHeader>{feedback}{data ? <div className="space-y-4">{(["referralAccessMode", "couponAccessMode"] as const).map(field => <label className={labelClass} key={field}><T name={field === "referralAccessMode" ? "referral_access" : "coupon_access"} /><select className={selectClass} value={data.settings[field]} disabled={pending !== null} onChange={event => void mutate(field, "/api/admin/feature-access", { fieldName: field, mode: event.target.value }, "POST")}>{(["disabled", "admin_only", "enabled"] as const).map(mode => <option value={mode} key={mode}>{translate(`referrals.${mode}`, REFERRAL_COPY[mode])}</option>)}</select>{pending === field ? <T name="saving" /> : null}</label>)}</div> : <T name="loading" />}<Button className="cursor-pointer justify-self-end" variant="outline" disabled={pending !== null} onClick={() => setSettingsOpen(false)}><T name="close" /></Button></DialogContent></Dialog>

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
      <label className={labelClass} htmlFor="referral-percentage" aria-label={translate("referrals.percentage", REFERRAL_COPY.percentage)}><T name="percentage" /><input className="h-10 rounded-lg border bg-background px-3" id="referral-percentage" name="percentage" type="number" min={1} max={100} step={1} required /></label>
      <label className={labelClass}><T name="duration" /><select name="duration" className={selectClass} value={duration} onChange={event => setDuration(event.target.value)}>{(["indefinite", "months", "first_recharge", "signup_window"] as const).map(mode => <option value={mode} key={mode}>{translate(`referrals.${mode}`, REFERRAL_COPY[mode])}</option>)}</select></label>
      {duration === "months" ? <label className={labelClass} htmlFor="referral-months" aria-label={translate("referrals.month_count", REFERRAL_COPY.month_count)}><T name="month_count" /><input className="h-10 rounded-lg border bg-background px-3" id="referral-months" name="months" type="number" min={1} max={1200} step={1} required /></label> : null}
      {duration === "signup_window" ? <><label className={labelClass} htmlFor="referral-days" aria-label={translate("referrals.window_days", REFERRAL_COPY.window_days)}><T name="window_days" /><input className="h-10 rounded-lg border bg-background px-3" id="referral-days" name="days" type="number" min={1} max={36500} step={1} /></label><label className={labelClass} htmlFor="referral-cutoff" aria-label={translate("referrals.cutoff", REFERRAL_COPY.cutoff)}><T name="cutoff" /><input className="h-10 rounded-lg border bg-background px-3" id="referral-cutoff" name="cutoff" type="datetime-local" /></label></> : null}
      <div className="sm:col-span-2"><p className="mb-3 text-xs text-muted-foreground"><T name="rule_note" /></p><div className="flex flex-wrap justify-end gap-2"><Button className="cursor-pointer" type="button" variant="outline" disabled={pending !== null} onClick={() => setCreateOpen(false)}><T name="cancel" /></Button><Button type="submit" disabled={!data || !creatorsConfirmed || !creatorId || !creators.length || pending !== null}>{pending === "create" ? <T name="saving" /> : <T name="create" />}</Button></div></div>
    </form>
    </DialogContent></Dialog>

    <Dialog open={Boolean(detailsId)} onOpenChange={value => { if (!value && !pending) setDetailsId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle><T name="details" /></DialogTitle><DialogDescription><T name="inventory_description" /></DialogDescription></DialogHeader>{feedback}
    {data?.referrals.filter(row => row.id === detailsId).map(referral => <div className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm" key={referral.id}>
      <p className="font-medium">{referral.creatorName} · {referral.percentage}% · <T name={referral.duration as "indefinite"} /> {referral.months ?? referral.windowDays ?? ""} {referral.rechargeBefore ? new Date(referral.rechargeBefore).toLocaleString() : ""}</p>
      <p><T name="signups" />: {referral.signups}</p>
      <a className="block cursor-pointer break-all underline" href={creatorPlayStoreUrl(referral.code)} target="_blank" rel="noreferrer">{creatorPlayStoreUrl(referral.code)}</a>
      <Button className="cursor-pointer" variant="outline" disabled={pending !== null} onClick={() => void mutate(referral.id, "/api/admin/referrals", { action: "status", id: referral.id, active: !referral.isActive })}>{pending === referral.id ? <T name="saving" /> : <T name={referral.isActive ? "pause" : "activate"} />}</Button>
      {referral.balances.map(balance => <div className="space-y-3" key={balance.currency}>
        <p>{balance.currency} · <T name="earned" /> {(balance.earned / 100).toFixed(2)} · <T name="paid" /> {(balance.paid / 100).toFixed(2)} · <T name="remaining" /> {(balance.remaining / 100).toFixed(2)}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
          event.preventDefault(); const form = new FormData(event.currentTarget);
          void mutate(`payout-${referral.id}`, "/api/admin/referrals", { action: "payout", referralId: referral.id, currency: balance.currency, amount: Math.round(Number(form.get("amount")) * 100), note: String(form.get("note") ?? "") });
        }}><label className={labelClass} htmlFor={`payout-amount-${referral.id}-${balance.currency}`} aria-label={translate("referrals.amount", REFERRAL_COPY.amount)}><T name="amount" /><input className="h-10 rounded-lg border bg-background px-3" type="number" id={`payout-amount-${referral.id}-${balance.currency}`} name="amount" min="0.01" max={Math.max(balance.remaining, 0) / 100} step="0.01" required /></label><label className={labelClass} htmlFor={`payout-note-${referral.id}-${balance.currency}`} aria-label={translate("referrals.note", REFERRAL_COPY.note)}><T name="note" /><input className="h-10 rounded-lg border bg-background px-3" id={`payout-note-${referral.id}-${balance.currency}`} name="note" maxLength={500} /></label><Button type="submit" disabled={pending !== null || balance.remaining <= 0}>{pending === `payout-${referral.id}` ? <T name="saving" /> : <T name="payout" />}</Button><p className="w-full text-xs text-muted-foreground"><T name="payout_note" /></p></form>
      </div>)}
    </div>)}

    <Button className="cursor-pointer justify-self-end" variant="outline" disabled={pending !== null} onClick={() => setDetailsId(null)}><T name="close" /></Button>
    </DialogContent></Dialog>
    <PromotionDeleteDialog open={Boolean(deleteId)} onOpenChange={value => { if (!value) setDeleteId(null); }} onDelete={() => mutate(`delete-${deleteId}`, "/api/admin/referrals", { id: deleteId }, "DELETE")} />

    <AdminPromotionSection defaultOpen={false} title={<T name="recent" />}>
      {!data?.recentCommissions.length ? (
        <AdminEmptyState title={<T name={data ? "no_activity" : "loading"} />} />
      ) : (
        <ul className="divide-y divide-border/60">
          {data.recentCommissions.map(commission => <li className="flex items-start justify-between gap-3 px-5 py-3 text-sm" key={commission.orderId}>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs" title={commission.orderId}>{commission.orderId}</p>
              <p className="mt-1 tabular-nums"><span className="font-medium">{money(commission.amount, commission.currency)}</span><span className="text-muted-foreground"> · {commission.percentage}% of {money(commission.paymentAmount, commission.currency)}</span></p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <AdminStatusPill tone={commission.reversed ? "neutral" : "success"}><T name={commission.reversed ? "reversed" : "earned"} /></AdminStatusPill>
              <PromotionActions label={translate("referrals.operations", REFERRAL_COPY.operations).replace("{code}", commission.orderId)} disabled={pending !== null} items={[{ name: "reverse", disabled: commission.reversed, action: () => mutate(commission.orderId, "/api/admin/referrals", { action: "reverse", orderId: commission.orderId }) }]} />
              {pending === commission.orderId ? <output className="text-muted-foreground text-xs"><T name="saving" /></output> : null}
            </div>
          </li>)}
        </ul>
      )}
    </AdminPromotionSection>
  </div>;
}
