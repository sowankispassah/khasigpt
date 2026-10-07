"use client";

import { ChevronDown, HandCoins, IndianRupee, Plus, Repeat, TicketPercent } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  recordCouponPayoutAction,
  setCouponRewardStatusAction,
  setCouponStatusAction,
  upsertCouponAction,
} from "@/app/(admin)/actions";
import { AdminEmptyState, AdminNotice, AdminStatCard, AdminStatusPill } from "@/components/admin/admin-ui";
import { AdminPromotionSection, PromotionActions, PromotionDeleteDialog, PromotionText as T } from "@/components/admin-promotion-controls";
import { FormSubmitButton } from "@/components/form-submit-button";
import { useTranslation } from "@/components/language-provider";
import { useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import { cn } from "@/lib/utils";

export type AdminCoupon = {
  id: string;
  code: string;
  discountPercentage: number;
  creatorRewardPercentage: number;
  creatorRewardStatus: string;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  description: string | null;
  usageCount: number;
  totalRevenueInPaise: number;
  totalDiscountInPaise: number;
  lastRedemptionAt: string | null;
  estimatedRewardInPaise: number;
  totalPaidInPaise: number;
  remainingRewardInPaise: number;
  recentRedemptions: Array<{
    id: string;
    couponCode: string;
    userLabel: string;
    paymentAmountInPaise: number;
    discountAmountInPaise: number;
    rewardInPaise: number;
    redeemedAt: string;
  }>;
  recentPayouts: Array<{
    id: string;
    amountInPaise: number;
    note: string | null;
    createdAt: string;
  }>;
};

export type CreatorOption = {
  id: string;
  name: string;
  email: string | null;
};

export function AdminCouponsManager({
  coupons,
  couponsConfirmed,
  creators,
  creatorsConfirmed,
  payoutsConfirmed,
  redemptionsConfirmed,
}: {
  coupons: AdminCoupon[];
  couponsConfirmed: boolean;
  creators: CreatorOption[];
  creatorsConfirmed: boolean;
  payoutsConfirmed: boolean;
  redemptionsConfirmed: boolean;
}) {
  const router = useRouter();
  const { translate } = useTranslation();
  const creatorPlaceholder = useEditableTranslation("referrals.select_creator", REFERRAL_COPY.select_creator);
  const descriptionPlaceholder = useEditableTranslation("referrals.coupon_description_placeholder", REFERRAL_COPY.coupon_description_placeholder);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedCoupons, setExpandedCoupons] = useState<
    Record<string, boolean>
  >({});

  const formatCurrency = useCallback((valueInPaise: number) => {
    const hasFraction = valueInPaise % 100 !== 0;
    return (valueInPaise / 100).toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    });
  }, []);

  const formatDateLabel = useCallback((value: string | null) => {
    if (!value) {
      return "—";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }
    return parsed.toLocaleDateString("en-IN", { dateStyle: "medium" });
  }, []);

  const selectedCoupon = useMemo(
    () => coupons.find((coupon) => coupon.id === selectedId) ?? null,
    [coupons, selectedId]
  );

  const summary = useMemo(
    () =>
      coupons.reduce(
        (acc, coupon) => {
          acc.totalUsage += coupon.usageCount;
          acc.totalRevenue += coupon.totalRevenueInPaise;
          acc.totalDiscount += coupon.totalDiscountInPaise;
          acc.totalReward += coupon.estimatedRewardInPaise;
          return acc;
        },
        {
          totalUsage: 0,
          totalRevenue: 0,
          totalDiscount: 0,
          totalReward: 0,
        }
      ),
    [coupons]
  );

  const creatorSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        usage: number;
        revenue: number;
        reward: number;
      }
    >();

    for (const coupon of coupons) {
      const current = map.get(coupon.creatorId) ?? {
        id: coupon.creatorId,
        name: coupon.creatorName ?? coupon.creatorEmail ?? "Unknown creator",
        usage: 0,
        revenue: 0,
        reward: 0,
      };

      current.usage += coupon.usageCount;
      current.revenue += coupon.totalRevenueInPaise;
      current.reward += coupon.estimatedRewardInPaise;

      map.set(coupon.creatorId, current);
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [coupons]);

  const hasCreators = creatorsConfirmed && creators.length > 0;

  const editCoupon = (id: string | null) => { setSelectedId(id); setEditorOpen(true); };
  async function changeStatus(coupon: AdminCoupon) {
    const form = new FormData();
    form.set("couponId", coupon.id); form.set("isActive", String(!coupon.isActive));
    await setCouponStatusAction(form); router.refresh();
  }
  async function deleteCoupon() {
    try {
      const response = await fetch("/api/admin/coupons", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleteId }), signal: AbortSignal.timeout(25000) });
      if (!response.ok) { toast.error(translate(`referrals.${response.status === 409 ? "delete_in_use" : "unavailable"}`, response.status === 409 ? REFERRAL_COPY.delete_in_use : REFERRAL_COPY.unavailable)); return false; }
      router.refresh(); toast.success(translate("referrals.saved", REFERRAL_COPY.saved)); return true;
    } catch { toast.error(translate("referrals.unavailable", REFERRAL_COPY.unavailable)); return false; }
  }

  const toggleCouponDetails = useCallback((couponId: string) => {
    setExpandedCoupons((previous) => ({
      ...previous,
      [couponId]: !previous[couponId],
    }));
  }, []);

  const queryNotices = [
    !couponsConfirmed
      ? "Coupon rows could not be confirmed. Coupon tables are hidden instead of showing empty fallback data."
      : null,
    !creatorsConfirmed
      ? "Creator options could not be confirmed. Coupon creation is disabled until this section is refreshed."
      : null,
    !redemptionsConfirmed
      ? "Recent redemption rows could not be confirmed."
      : null,
    !payoutsConfirmed ? "Recent payout rows could not be confirmed." : null,
  ].filter((message): message is string => Boolean(message));
  const activeCouponCount = coupons.filter((coupon) => coupon.isActive).length;
  const totalPaidInPaise = coupons.reduce((total, coupon) => total + coupon.totalPaidInPaise, 0);

  const statusPill = (coupon: AdminCoupon) => (
    <AdminStatusPill tone={coupon.isActive ? "success" : "neutral"}>
      <T name={coupon.isActive ? "active" : "inactive"} />
    </AdminStatusPill>
  );

  const couponActions = (coupon: AdminCoupon) => (
    <PromotionActions label={translate("referrals.operations", REFERRAL_COPY.operations).replace("{code}", coupon.code)} items={[
      { name: "copy_code", action: async () => { await navigator.clipboard.writeText(coupon.code); toast.success(translate("referrals.copied", REFERRAL_COPY.copied)); } },
      { name: "edit_coupon", action: () => editCoupon(coupon.id) },
      { name: "details", action: () => toggleCouponDetails(coupon.id) },
      { name: coupon.isActive ? "make_inactive" : "make_active", action: () => changeStatus(coupon) },
      { name: "delete", destructive: true, disabled: coupon.usageCount > 0 || coupon.totalPaidInPaise > 0, action: () => setDeleteId(coupon.id) },
    ]} />
  );

  const codeButton = (coupon: AdminCoupon) => (
    <button
      className="cursor-pointer font-mono font-semibold uppercase tracking-wide underline-offset-2 hover:underline"
      onClick={() => editCoupon(coupon.id)}
      type="button"
    >
      {coupon.code}
    </button>
  );

  const usageToggle = (coupon: AdminCoupon, className?: string) => {
    const isExpanded = Boolean(expandedCoupons[coupon.id]);
    return (
      <Button
        aria-expanded={isExpanded}
        className={cn("cursor-pointer", className)}
        onClick={() => toggleCouponDetails(coupon.id)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ChevronDown className={cn("size-4 transition-transform", isExpanded ? "rotate-180" : "")} />
        {isExpanded ? "Hide usage" : "View usage"}
      </Button>
    );
  };

  const rewardStatusForm = (coupon: AdminCoupon) =>
    coupon.usageCount > 0 ? (
      <form
        action={setCouponRewardStatusAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="couponId"
          type="hidden"
          value={coupon.id}
        />
        <input
          name="usageCount"
          type="hidden"
          value={coupon.usageCount}
        />
        <select
          aria-label={`Payout status for ${coupon.code}`}
          className="h-8 cursor-pointer rounded-lg border border-input bg-background px-2 text-xs"
          defaultValue={coupon.creatorRewardStatus}
          name="rewardStatus"
        >
          <option value="pending">Payment pending</option>
          <option value="paid">Paid</option>
        </select>
        <FormSubmitButton
          className="h-8 min-w-[72px]"
          size="sm"
          variant="outline"
        >
          Save
        </FormSubmitButton>
      </form>
    ) : (
      <span className="text-muted-foreground text-xs">
        No redemptions
      </span>
    );

  const usageDetails = (coupon: AdminCoupon) => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <section className="min-w-0">
        <h4 className="font-medium text-sm">Recent redemptions</h4>
        {!redemptionsConfirmed ? (
          <p className="mt-2 text-muted-foreground text-sm">
            Recent redemptions could not be loaded.
          </p>
        ) : coupon.recentRedemptions.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">
            No users have redeemed this code yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 rounded-lg border bg-background">
            {coupon.recentRedemptions.map((redemption) => (
              <li
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                key={redemption.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{redemption.userLabel}</p>
                  <p className="text-muted-foreground text-xs">
                    {redemption.couponCode} · {formatDateLabel(redemption.redeemedAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs tabular-nums sm:text-sm">
                  <div className="font-medium">₹{formatCurrency(redemption.paymentAmountInPaise)}</div>
                  <div className="text-muted-foreground">Reward ₹{formatCurrency(redemption.rewardInPaise)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-0">
        <h4 className="font-medium text-sm">Payout history</h4>
        {!payoutsConfirmed ? (
          <p className="mt-2 text-muted-foreground text-sm">
            Recent payouts could not be loaded.
          </p>
        ) : coupon.recentPayouts.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">
            No payouts have been recorded yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 rounded-lg border bg-background">
            {coupon.recentPayouts.map((payout) => (
              <li className="px-3 py-2 text-sm" key={payout.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium tabular-nums">₹{formatCurrency(payout.amountInPaise)}</span>
                  <span className="text-muted-foreground text-xs">{formatDateLabel(payout.createdAt)}</span>
                </div>
                {payout.note ? (
                  <p className="mt-1 text-muted-foreground text-xs">{payout.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form
          action={recordCouponPayoutAction}
          className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <p className="font-medium text-sm sm:col-span-2">Record payment</p>
          <input
            name="couponId"
            type="hidden"
            value={coupon.id}
          />
          <div>
            <Label className="font-medium text-xs" htmlFor={`coupon-payout-amount-${coupon.id}`}>
              Amount (₹)
            </Label>
            <Input
              className="mt-1 bg-background"
              id={`coupon-payout-amount-${coupon.id}`}
              min={1}
              name="amount"
              required
              step="0.01"
              type="number"
            />
          </div>
          <div>
            <Label className="font-medium text-xs" htmlFor={`coupon-payout-note-${coupon.id}`}>
              Note
            </Label>
            <Textarea
              className="mt-1 bg-background"
              id={`coupon-payout-note-${coupon.id}`}
              name="note"
              placeholder="Optional memo"
              rows={1}
            />
          </div>
          <FormSubmitButton
            className="justify-self-start sm:col-span-2"
            disabled={
              !payoutsConfirmed ||
              !redemptionsConfirmed
            }
            size="sm"
            variant="secondary"
          >
            Add payment
          </FormSubmitButton>
        </form>
      </section>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {queryNotices.map((message) => (
        <AdminNotice key={message}>
          {message} Refresh this admin section to retry.
        </AdminNotice>
      ))}

      <section aria-label={translate("referrals.coupon_summary", REFERRAL_COPY.coupon_summary)} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <AdminStatCard
          hint={couponsConfirmed ? `${coupons.length.toLocaleString("en-IN")} total` : undefined}
          icon={TicketPercent}
          label="Active coupons"
          value={couponsConfirmed ? activeCouponCount.toLocaleString("en-IN") : null}
        />
        <AdminStatCard
          icon={Repeat}
          label="Total redemptions"
          value={couponsConfirmed && redemptionsConfirmed ? summary.totalUsage.toLocaleString("en-IN") : null}
        />
        <AdminStatCard
          hint={couponsConfirmed && redemptionsConfirmed ? `₹${formatCurrency(summary.totalDiscount)} discounted` : undefined}
          icon={IndianRupee}
          label="Recharge volume"
          value={couponsConfirmed && redemptionsConfirmed ? `₹${formatCurrency(summary.totalRevenue)}` : null}
        />
        <AdminStatCard
          hint={couponsConfirmed && payoutsConfirmed ? `₹${formatCurrency(totalPaidInPaise)} paid out` : undefined}
          icon={HandCoins}
          label="Creator rewards"
          value={couponsConfirmed && payoutsConfirmed ? `₹${formatCurrency(summary.totalReward)}` : null}
        />
      </section>

      <AdminPromotionSection title={<T name="coupon_inventory" />} description={<T name="coupon_inventory_description" />} actions={<Button className="cursor-pointer" disabled={!hasCreators} onClick={() => editCoupon(null)}><Plus className="size-4" /><T name="add_coupon" /></Button>}>
        {!couponsConfirmed || coupons.length === 0 ? (
          <AdminEmptyState
            icon={TicketPercent}
            title={!couponsConfirmed ? "Unable to load coupons." : "No coupons created yet."}
          />
        ) : (
          <>
            <ul className="divide-y divide-border/60 md:hidden">
              {coupons.map((coupon) => (
                <li className="space-y-3 px-5 py-4" key={coupon.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {codeButton(coupon)}
                      <p className="truncate text-muted-foreground text-xs">{coupon.creatorName ?? coupon.creatorEmail ?? "—"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {statusPill(coupon)}
                      {couponActions(coupon)}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">Offer</dt>
                      <dd>{coupon.discountPercentage}% off · {coupon.creatorRewardPercentage}% reward</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Usage</dt>
                      <dd className="tabular-nums">{coupon.usageCount.toLocaleString("en-IN")} · ₹{formatCurrency(coupon.totalRevenueInPaise)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Rewards</dt>
                      <dd className="tabular-nums">Paid ₹{formatCurrency(coupon.totalPaidInPaise)} · Pending ₹{formatCurrency(coupon.remainingRewardInPaise)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Validity</dt>
                      <dd>{formatDateLabel(coupon.validFrom)} – {coupon.validTo ? formatDateLabel(coupon.validTo) : "No end date"}</dd>
                    </div>
                  </dl>
                  {coupon.usageCount > 0 ? rewardStatusForm(coupon) : null}
                  {usageToggle(coupon, "w-full justify-center border")}
                  {expandedCoupons[coupon.id] ? <div className="rounded-lg bg-muted/20 p-3">{usageDetails(coupon)}</div> : null}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Code</th>
                    <th className="px-4 py-2.5 text-left font-medium">Offer</th>
                    <th className="px-4 py-2.5 text-left font-medium">Validity</th>
                    <th className="px-4 py-2.5 text-right font-medium">Usage</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rewards</th>
                    <th className="px-4 py-2.5 text-left font-medium">Payout status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {coupons.map((coupon) => (
                    <Fragment key={coupon.id}>
                      <tr className="transition hover:bg-muted/30">
                        <td className="px-4 py-3">
                          {codeButton(coupon)}
                          <span className="block text-muted-foreground text-xs">{coupon.creatorName ?? coupon.creatorEmail ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{coupon.discountPercentage}% off</span>
                          <span className="block text-muted-foreground text-xs">{coupon.creatorRewardPercentage}% creator reward</span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>{formatDateLabel(coupon.validFrom)}</div>
                          <div className="text-muted-foreground">
                            {coupon.validTo ? `until ${formatDateLabel(coupon.validTo)}` : "No end date"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="font-medium">{coupon.usageCount.toLocaleString("en-IN")}</span>
                          <span className="block text-muted-foreground text-xs">₹{formatCurrency(coupon.totalRevenueInPaise)} revenue</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="font-medium">₹{formatCurrency(coupon.estimatedRewardInPaise)}</span>
                          <span className="block text-muted-foreground text-xs">Paid ₹{formatCurrency(coupon.totalPaidInPaise)} · Pending ₹{formatCurrency(coupon.remainingRewardInPaise)}</span>
                        </td>
                        <td className="px-4 py-3">{rewardStatusForm(coupon)}</td>
                        <td className="px-4 py-3">{statusPill(coupon)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {usageToggle(coupon)}
                            {couponActions(coupon)}
                          </div>
                        </td>
                      </tr>
                      {expandedCoupons[coupon.id] ? (
                        <tr>
                          <td className="bg-muted/20 px-4 py-4" colSpan={8}>
                            {usageDetails(coupon)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminPromotionSection>

      <Dialog open={editorOpen} onOpenChange={value => { if (!saving) setEditorOpen(value); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle><T name={selectedCoupon ? "edit_coupon" : "add_coupon"} /></DialogTitle><DialogDescription><T name="coupon_inventory_description" /></DialogDescription></DialogHeader>
        {hasCreators ? null : (
          <AdminNotice>
            {creatorsConfirmed
              ? "Add at least one creator user before issuing coupons."
              : "Creator options could not be loaded. Coupon saves are disabled until this section is refreshed."}
          </AdminNotice>
        )}
        <form key={selectedId ?? "new"} action={async form => { setSaving(true); try { await upsertCouponAction(form); setEditorOpen(false); router.refresh(); } catch { toast.error(translate("referrals.unavailable", REFERRAL_COPY.unavailable)); } finally { setSaving(false); } }} className="mt-4 space-y-4">
          <input
            name="couponId"
            type="hidden"
            value={selectedCoupon?.id ?? ""}
          />
          <div>
            <Label htmlFor="coupon-code" className="font-medium text-sm"><T name="coupon_code_label" /></Label>
            <Input
              className="mt-1 font-mono uppercase"
              defaultValue={selectedCoupon?.code ?? ""}
              maxLength={32}
              id="coupon-code" name="code"
              placeholder="CREATOR10"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="coupon-discountPercentage" className="font-medium text-sm"><T name="discount" /></Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.discountPercentage ?? 10}
                max={95}
                min={1}
                id="coupon-discountPercentage" name="discountPercentage"
                required
                type="number"
              />
            </div>
            <div>
              <Label htmlFor="coupon-creatorId" className="font-medium text-sm"><T name="creator" />{creatorPlaceholder.editButton}</Label>
              <select
                className="mt-1 h-10 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
                defaultValue={
                  selectedCoupon?.creatorId ?? ""
                }
                id="coupon-creatorId" name="creatorId"
                required
              >
                <option value="" disabled>{creatorPlaceholder.text}</option>
                {creators.map((creator) => (
                  <option key={creator.id} value={creator.id}>
                    {creator.name || creator.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="coupon-validFrom" className="font-medium text-sm"><T name="valid_from" /></Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.validFrom?.slice(0, 10)}
                id="coupon-validFrom" name="validFrom"
                required
                type="date"
              />
            </div>
            <div>
              <Label htmlFor="coupon-validTo" className="font-medium text-sm"><T name="valid_until" /></Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.validTo?.slice(0, 10) ?? ""}
                id="coupon-validTo" name="validTo"
                type="date"
              />
            </div>
            <div>
              <Label htmlFor="coupon-creatorRewardPercentage" className="font-medium text-sm"><T name="creator_reward" /></Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.creatorRewardPercentage ?? 0}
                max={95}
                min={0}
                id="coupon-creatorRewardPercentage" name="creatorRewardPercentage"
                required
                type="number"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="coupon-description" className="font-medium text-sm"><T name="coupon_description" />{descriptionPlaceholder.editButton}</Label>
            <Textarea
              className="mt-1"
              defaultValue={selectedCoupon?.description ?? ""}
              id="coupon-description" name="description"
              placeholder={descriptionPlaceholder.text}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="coupon-isActive" className="font-medium text-sm"><T name="status" /></Label>
            <select
              className="mt-1 h-10 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm"
              defaultValue={selectedCoupon?.isActive ? "true" : "false"}
              id="coupon-isActive" name="isActive"
            >
              <option value="true">{translate("referrals.active", REFERRAL_COPY.active)}</option>
              <option value="false">{translate("referrals.inactive", REFERRAL_COPY.inactive)}</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              className="cursor-pointer"
              disabled={saving}
              onClick={() => setEditorOpen(false)}
              type="button"
              variant="ghost"
            >
              <T name="cancel" />
            </Button>
            <FormSubmitButton
              disabled={!hasCreators}
              pendingLabel={translate(selectedCoupon ? "referrals.saving" : "referrals.creating", selectedCoupon ? REFERRAL_COPY.saving : REFERRAL_COPY.creating)}
            >
              <T name={selectedCoupon ? "save_changes" : "create_coupon"} />
            </FormSubmitButton>
          </div>
        </form>
      </DialogContent></Dialog>
      <PromotionDeleteDialog open={Boolean(deleteId)} onOpenChange={value => { if (!value) setDeleteId(null); }} onDelete={deleteCoupon} />

      <AdminPromotionSection title={<T name="creator_performance" />} description={<T name="creator_performance_description" />}>
        <ul className="divide-y divide-border/60 sm:hidden">{creatorSummary.map(creator => <li className="px-5 py-3 text-sm" key={creator.id}><p className="font-medium">{creator.name}</p><p className="mt-0.5 text-muted-foreground tabular-nums">{creator.usage.toLocaleString("en-IN")} <T name="redemptions" /> · ₹{formatCurrency(creator.revenue)} · <T name="reward" /> ₹{formatCurrency(creator.reward)}</p></li>)}{!creatorSummary.length ? <li><AdminEmptyState title={<T name="no_creator_activity" />} /></li> : null}</ul>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm"><thead className="border-b bg-muted/40 text-muted-foreground text-xs"><tr>{(["creator", "redemptions", "coupon_revenue", "reward"] as const).map((name, index) => <th className={cn("px-4 py-2.5 font-medium", index === 0 ? "text-left" : "text-right")} key={name}><T name={name} /></th>)}</tr></thead><tbody className="divide-y divide-border/60">{creatorSummary.map(creator => <tr className="transition hover:bg-muted/30" key={creator.id}><td className="px-4 py-3 font-medium">{creator.name}</td><td className="px-4 py-3 text-right tabular-nums">{creator.usage.toLocaleString("en-IN")}</td><td className="px-4 py-3 text-right tabular-nums">₹{formatCurrency(creator.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">₹{formatCurrency(creator.reward)}</td></tr>)}{!creatorSummary.length ? <tr><td colSpan={4}><AdminEmptyState title={<T name="no_creator_activity" />} /></td></tr> : null}</tbody></table></div>
      </AdminPromotionSection>
    </div>
  );
}
