"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation, useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import type { FeatureAccessMode } from "@/lib/feature-access";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { ReferralDashboard } from "@/lib/referrals/service";
import type { CreatorOption } from "./admin-coupons-manager";

function T({ name }: { name: keyof typeof REFERRAL_COPY }) {
  return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} />;
}
type Data = ReferralDashboard & { settings: { referralAccessMode: FeatureAccessMode; couponAccessMode: FeatureAccessMode } };

export function AdminReferralsManager({ creators, creatorsConfirmed }: { creators: CreatorOption[]; creatorsConfirmed: boolean }) {
  const { translate } = useTranslation();
  const creatorPlaceholder = useEditableTranslation("referrals.select_creator", REFERRAL_COPY.select_creator);
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [creatorId, setCreatorId] = useState("");
  const [duration, setDuration] = useState("indefinite");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/referrals?page=${page}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      setData(await response.json()); setError(false);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);

  async function mutate(id: string, url: string, body: unknown, method = "PATCH") {
    if (pending) return;
    setPending(id); setError(false); setSaved(false);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error();
      if (id === "create") setCreatorId("");
      setSaved(true); await load();
    } catch { setError(true); }
    finally { setPending(null); }
  }
  const labelClass = "flex flex-col gap-2 text-sm";
  const selectClass = "h-10 cursor-pointer rounded-md border bg-background px-3";
  return <section className="space-y-5 rounded-2xl border bg-card p-5">
    <h2 className="text-xl font-semibold"><T name="title" /></h2>
    <p className="text-sm text-muted-foreground"><T name="description" /></p>
    {loading ? <output><T name="loading" /></output> : null}
    {error ? <div role="alert"><T name="unavailable" /> <Button disabled={loading} onClick={() => void load()} variant="outline"><T name="retry" /></Button></div> : null}
    {saved ? <output><T name="saved" /></output> : null}
    {data ? <div className="grid gap-4 sm:grid-cols-2">
      {(["referralAccessMode", "couponAccessMode"] as const).map(field => <label className={labelClass} key={field}>
        <T name={field === "referralAccessMode" ? "referral_access" : "coupon_access"} />
        <select className={selectClass} value={data.settings[field]} disabled={pending !== null} onChange={event => void mutate(field, "/api/admin/feature-access", { fieldName: field, mode: event.target.value }, "POST")}>
          {(["disabled", "admin_only", "enabled"] as const).map(mode => <option value={mode} key={mode}>{translate(`referrals.${mode}`, REFERRAL_COPY[mode])}</option>)}
        </select>
        {pending === field ? <T name="saving" /> : null}
      </label>)}
    </div> : null}
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
    {data?.referrals.map(referral => <div className="space-y-3 rounded-lg border p-4" key={referral.id}>
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
    {data && !data.referrals.length ? <p><T name="empty" /></p> : null}
    <div className="flex gap-3"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button variant="outline" disabled={!data || page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
    {data?.recentCommissions.length ? <div className="space-y-3"><h3 className="font-semibold"><T name="recent" /></h3>{data.recentCommissions.map(commission => <div className="flex flex-wrap items-center gap-3 border-b py-2" key={commission.orderId}><span>{commission.orderId} · {commission.currency} {(commission.paymentAmount / 100).toFixed(2)} · {commission.percentage}% · {(commission.amount / 100).toFixed(2)}</span>{commission.reversed ? <T name="reversed" /> : <Button variant="outline" disabled={pending !== null} onClick={() => void mutate(commission.orderId, "/api/admin/referrals", { action: "reverse", orderId: commission.orderId })}>{pending === commission.orderId ? <T name="saving" /> : <T name="reverse" />}</Button>}</div>)}</div> : null}
  </section>;
}
