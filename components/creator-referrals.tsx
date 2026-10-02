"use client";
import { useCallback, useEffect, useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import type { ReferralDashboard } from "@/lib/referrals/service";

function T({ name }: { name: keyof typeof REFERRAL_COPY }) { return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} />; }
export function CreatorReferrals() {
  const [data, setData] = useState<(ReferralDashboard & { available: boolean }) | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch(`/api/creator/referrals?page=${page}`, { cache: "no-store", signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); setData(await response.json()); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  if (data && !data.available) return null;
  return <section className="space-y-4 rounded-xl border p-5">
    <h2 className="font-semibold text-xl"><T name="title" /></h2>
    {loading ? <output><T name="loading" /></output> : null}
    {error ? <p role="alert"><T name="unavailable" /> <Button variant="outline" disabled={loading} onClick={() => void load()}><T name="retry" /></Button></p> : null}
    {data && !data.referrals.length ? <p><T name="empty" /></p> : null}
    {data?.referrals.map(referral => <div className="space-y-2 rounded-lg border p-3" key={referral.id}>
      <p>{referral.percentage}% · <T name={referral.duration as "indefinite"} /> {referral.months ?? referral.windowDays ?? ""} {referral.rechargeBefore ? new Date(referral.rechargeBefore).toLocaleString() : ""}</p>
      <p><T name="signups" />: {referral.signups} · <T name={referral.isActive ? "enabled" : "disabled"} /></p>
      <a className="block cursor-pointer break-all underline" href={`/r/${referral.code}`}>/r/{referral.code}</a>
      <Button variant="outline" disabled={copying !== null} onClick={async () => { setCopying(referral.id); try { await navigator.clipboard.writeText(`${window.location.origin}/r/${referral.code}`); } catch { setError(true); } finally { setCopying(null); } }}><T name={copying === referral.id ? "saving" : "copy"} /></Button>
      {referral.balances.map(balance => <p key={balance.currency}>{balance.currency} · <T name="earned" /> {(balance.earned / 100).toFixed(2)} · <T name="paid" /> {(balance.paid / 100).toFixed(2)} · <T name="remaining" /> {(balance.remaining / 100).toFixed(2)}</p>)}
    </div>)}
    <div className="flex gap-3"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}><T name="previous" /></Button><Button variant="outline" disabled={!data || page * 20 >= data.totalCount || loading} onClick={() => setPage(page + 1)}><T name="next" /></Button></div>
  </section>;
}
