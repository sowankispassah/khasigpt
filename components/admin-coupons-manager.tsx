"use client";

import { Fragment, useCallback, useMemo, useState } from "react";

import {
  recordCouponPayoutAction,
  setCouponRewardStatusAction,
  setCouponStatusAction,
  upsertCouponAction,
} from "@/app/(admin)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  creators,
}: {
  coupons: AdminCoupon[];
  creators: CreatorOption[];
}) {
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

  const hasCreators = creators.length > 0;

  const toggleCouponDetails = useCallback((couponId: string) => {
    setExpandedCoupons((previous) => ({
      ...previous,
      [couponId]: !previous[couponId],
    }));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Active coupons" value={coupons.length.toString()} />
        <SummaryCard
          label="Total redemptions"
          value={summary.totalUsage.toLocaleString("en-IN")}
        />
        <SummaryCard
          label="Recharge volume"
          value={`₹${formatCurrency(summary.totalRevenue)}`}
        />
        <SummaryCard
          label="Creator rewards"
          value={`₹${formatCurrency(summary.totalReward)}`}
        />
      </section>

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <header className="mb-4 flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-lg">Coupon inventory</h2>
            <p className="text-muted-foreground text-sm">
              Track usage, toggle availability, and inspect recent redeemers.
            </p>
          </div>
          <p className="text-muted-foreground text-xs">
            Click a code to edit or expand usage.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Code</th>
                <th className="px-3 py-3 text-left font-medium">Creator</th>
                <th className="px-3 py-3 text-left font-medium">Validity</th>
                <th className="px-3 py-3 text-left font-medium">Discount</th>
                <th className="px-3 py-3 text-left font-medium">Reward</th>
                <th className="px-3 py-3 text-left font-medium">Payouts</th>
                <th className="px-3 py-3 text-left font-medium">
                  Payout status
                </th>
                <th className="px-3 py-3 text-left font-medium">Usage</th>
                <th className="px-3 py-3 text-left font-medium">Revenue</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Actions</th>
                <th className="px-3 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {coupons.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-muted-foreground"
                    colSpan={11}
                  >
                    No coupons created yet.
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => {
                  const isExpanded = Boolean(expandedCoupons[coupon.id]);
                  return (
                    <Fragment key={coupon.id}>
                      <tr className="bg-card/60">
                        <td className="px-3 py-3 font-semibold uppercase tracking-wide">
                          <button
                            className="underline-offset-2 hover:underline"
                            onClick={() => setSelectedId(coupon.id)}
                            type="button"
                          >
                            {coupon.code}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {coupon.creatorName ?? coupon.creatorEmail ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          <div>{formatDateLabel(coupon.validFrom)}</div>
                          <div>
                            {coupon.validTo
                              ? formatDateLabel(coupon.validTo)
                              : "No end date"}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {coupon.discountPercentage}%
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span>{coupon.creatorRewardPercentage}%</span>
                            <span className="text-muted-foreground text-xs">
                              ₹{formatCurrency(coupon.estimatedRewardInPaise)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col text-xs">
                            <span className="font-semibold">
                              Paid ₹{formatCurrency(coupon.totalPaidInPaise)}
                            </span>
                            <span className="text-muted-foreground">
                              Pending ₹
                              {formatCurrency(coupon.remainingRewardInPaise)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {coupon.usageCount > 0 ? (
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
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs uppercase tracking-wide"
                                defaultValue={coupon.creatorRewardStatus}
                                name="rewardStatus"
                              >
                                <option value="pending">Payment pending</option>
                                <option value="paid">Paid</option>
                              </select>
                              <FormSubmitButton
                                className="h-8 min-w-[84px]"
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
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {coupon.usageCount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-3">
                          ₹{formatCurrency(coupon.totalRevenueInPaise)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-1 font-semibold text-xs",
                              coupon.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {coupon.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              className="cursor-pointer"
                              onClick={() => setSelectedId(coupon.id)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Edit
                            </Button>
                            <form
                              action={setCouponStatusAction}
                              className="inline-flex"
                            >
                              <input
                                name="couponId"
                                type="hidden"
                                value={coupon.id}
                              />
                              <input
                                name="isActive"
                                type="hidden"
                                value={(!coupon.isActive).toString()}
                              />
                              <Button
                                className="cursor-pointer"
                                size="sm"
                                type="submit"
                                variant={
                                  coupon.isActive ? "outline" : "default"
                                }
                              >
                                {coupon.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </form>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            className="cursor-pointer"
                            onClick={() => toggleCouponDetails(coupon.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isExpanded ? "Hide usage" : "View usage"}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td className="bg-muted/30 px-3 py-4" colSpan={11}>
                            <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                              <div className="grid gap-6 md:grid-cols-2">
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                    Recent redemptions
                                  </p>
                                  {coupon.recentRedemptions.length === 0 ? (
                                    <p className="mt-2 text-muted-foreground text-sm">
                                      No users have redeemed this code yet.
                                    </p>
                                  ) : (
                                    <ul className="mt-3 space-y-3">
                                      {coupon.recentRedemptions.map(
                                        (redemption) => (
                                          <li
                                            className="flex items-center justify-between rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm"
                                            key={redemption.id}
                                          >
                                            <div>
                                              <p className="font-semibold">
                                                {redemption.userLabel}
                                              </p>
                                              <p className="text-muted-foreground text-xs">
                                                {redemption.couponCode} ·{" "}
                                                {formatDateLabel(
                                                  redemption.redeemedAt
                                                )}
                                              </p>
                                            </div>
                                            <div className="text-right text-xs sm:text-sm">
                                              <div className="font-semibold">
                                                ₹
                                                {formatCurrency(
                                                  redemption.paymentAmountInPaise
                                                )}
                                              </div>
                                              <div className="text-muted-foreground">
                                                Reward ₹
                                                {formatCurrency(
                                                  redemption.rewardInPaise
                                                )}
                                              </div>
                                            </div>
                                          </li>
                                        )
                                      )}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                    Payout history
                                  </p>
                                  {coupon.recentPayouts.length === 0 ? (
                                    <p className="mt-2 text-muted-foreground text-sm">
                                      No payouts have been recorded yet.
                                    </p>
                                  ) : (
                                    <ul className="mt-3 space-y-3">
                                      {coupon.recentPayouts.map((payout) => (
                                        <li
                                          className="rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm"
                                          key={payout.id}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold">
                                              ₹
                                              {formatCurrency(
                                                payout.amountInPaise
                                              )}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                              {formatDateLabel(
                                                payout.createdAt
                                              )}
                                            </span>
                                          </div>
                                          {payout.note ? (
                                            <p className="mt-1 text-muted-foreground text-xs">
                                              {payout.note}
                                            </p>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className="mt-4 rounded-lg border border-border/70 border-dashed bg-background/80 p-3">
                                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                      Record payment
                                    </p>
                                    <form
                                      action={recordCouponPayoutAction}
                                      className="mt-3 space-y-3"
                                    >
                                      <input
                                        name="couponId"
                                        type="hidden"
                                        value={coupon.id}
                                      />
                                      <div>
                                        <Label className="font-medium text-xs">
                                          Amount (₹)
                                        </Label>
                                        <Input
                                          className="mt-1"
                                          min={1}
                                          name="amount"
                                          required
                                          step="0.01"
                                          type="number"
                                        />
                                      </div>
                                      <div>
                                        <Label className="font-medium text-xs">
                                          Note
                                        </Label>
                                        <Textarea
                                          className="mt-1"
                                          name="note"
                                          placeholder="Optional memo"
                                          rows={2}
                                        />
                                      </div>
                                      <FormSubmitButton
                                        size="sm"
                                        variant="secondary"
                                      >
                                        Add payment
                                      </FormSubmitButton>
                                    </form>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <header className="mb-4">
          <h2 className="font-semibold text-lg">
            {selectedCoupon ? "Edit coupon" : "Create coupon"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {selectedCoupon
              ? "Update details or validity for the selected code."
              : "Issue a new code and assign it to a creator."}
          </p>
        </header>
        {hasCreators ? null : (
          <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
            Add at least one creator user before issuing coupons.
          </div>
        )}
        <form action={upsertCouponAction} className="mt-4 space-y-4">
          <input
            name="couponId"
            type="hidden"
            value={selectedCoupon?.id ?? ""}
          />
          <div>
            <Label className="font-medium text-sm">Coupon code</Label>
            <Input
              className="mt-1 font-mono uppercase"
              defaultValue={selectedCoupon?.code ?? ""}
              maxLength={32}
              name="code"
              placeholder="CREATOR10"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="font-medium text-sm">Discount %</Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.discountPercentage ?? 10}
                max={95}
                min={1}
                name="discountPercentage"
                required
                type="number"
              />
            </div>
            <div>
              <Label className="font-medium text-sm">Creator</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                defaultValue={
                  selectedCoupon?.creatorId ?? creators[0]?.id ?? ""
                }
                name="creatorId"
                required
              >
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
              <Label className="font-medium text-sm">Valid from</Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.validFrom?.slice(0, 10)}
                name="validFrom"
                required
                type="date"
              />
            </div>
            <div>
              <Label className="font-medium text-sm">Valid until</Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.validTo?.slice(0, 10) ?? ""}
                name="validTo"
                type="date"
              />
            </div>
            <div>
              <Label className="font-medium text-sm">Creator reward %</Label>
              <Input
                className="mt-1"
                defaultValue={selectedCoupon?.creatorRewardPercentage ?? 0}
                max={95}
                min={0}
                name="creatorRewardPercentage"
                required
                type="number"
              />
            </div>
          </div>
          <div>
            <Label className="font-medium text-sm">Description</Label>
            <Textarea
              className="mt-1"
              defaultValue={selectedCoupon?.description ?? ""}
              name="description"
              placeholder="Optional details shown in dashboards"
              rows={3}
            />
          </div>
          <div>
            <Label className="font-medium text-sm">Status</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              defaultValue={selectedCoupon?.isActive ? "true" : "false"}
              name="isActive"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              className="cursor-pointer"
              onClick={() => setSelectedId(null)}
              type="button"
              variant="ghost"
            >
              Reset
            </Button>
            <FormSubmitButton
              disabled={!hasCreators}
              pendingLabel={selectedCoupon ? "Saving…" : "Creating…"}
            >
              {selectedCoupon ? "Save changes" : "Create coupon"}
            </FormSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <header className="mb-3">
          <h2 className="font-semibold text-lg">Creator performance</h2>
          <p className="text-muted-foreground text-sm">
            Compare redemptions and revenue driven by each creator.
          </p>
        </header>
        {creatorSummary.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No creator activity recorded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {creatorSummary.map((creator) => (
              <li
                className="flex items-center justify-between rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm"
                key={creator.id}
              >
                <div>
                  <p className="font-semibold">{creator.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {creator.usage.toLocaleString("en-IN")} redemptions
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">
                    ₹{formatCurrency(creator.revenue)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Reward ₹{formatCurrency(creator.reward)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 font-semibold text-2xl">{value}</p>
    </div>
  );
}
