"use client";

import { useCallback, useMemo, useState } from "react";

import {
  setCouponStatusAction,
  setCouponRewardStatusAction,
  upsertCouponAction,
} from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
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
  const formatCurrency = useCallback((valueInPaise: number) => {
    const hasFraction = valueInPaise % 100 !== 0;
    return (valueInPaise / 100).toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    });
  }, []);

  const selectedCoupon = useMemo(() => {
    return coupons.find((coupon) => coupon.id === selectedId) ?? null;
  }, [coupons, selectedId]);

  const summary = useMemo(() => {
    return coupons.reduce(
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
    );
  }, [coupons]);

  const creatorSummary = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; usage: number; revenue: number; reward: number }
    >();
    coupons.forEach((coupon) => {
      const key = coupon.creatorId;
      const current = map.get(key) ?? {
        id: key,
        name: coupon.creatorName ?? coupon.creatorEmail ?? "Unknown creator",
        usage: 0,
        revenue: 0,
        reward: 0,
      };
      current.usage += coupon.usageCount;
      current.revenue += coupon.totalRevenueInPaise;
      current.reward += coupon.estimatedRewardInPaise;
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [coupons]);

  const hasCreators = creators.length > 0;

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

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card/60 p-4 shadow-sm lg:col-span-2">
          <header className="flex items-center justify-between gap-2 border-b pb-3">
            <div>
              <h2 className="text-lg font-semibold">Coupon inventory</h2>
              <p className="text-muted-foreground text-sm">
                Track usage and toggle availability for each code.
              </p>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left font-medium">Code</th>
                  <th className="px-3 py-3 text-left font-medium">Creator</th>
                  <th className="px-3 py-3 text-left font-medium">Discount</th>
                  <th className="px-3 py-3 text-left font-medium">Reward</th>
                  <th className="px-3 py-3 text-left font-medium">Payout status</th>
                  <th className="px-3 py-3 text-left font-medium">Usage</th>
                  <th className="px-3 py-3 text-left font-medium">Revenue</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-3 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {coupons.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-muted-foreground"
                      colSpan={7}
                    >
                      No coupons created yet.
                    </td>
                  </tr>
                ) : (
                  coupons.map((coupon) => (
                    <tr className="bg-card/60" key={coupon.id}>
                      <td className="px-3 py-3 font-semibold uppercase tracking-wide">
                        {coupon.code}
                      </td>
                      <td className="px-3 py-3">
                        {coupon.creatorName ?? coupon.creatorEmail ?? "—"}
                      </td>
                      <td className="px-3 py-3">{coupon.discountPercentage}%</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span>{coupon.creatorRewardPercentage}%</span>
                          <span className="text-muted-foreground text-xs">
                            ₹{formatCurrency(coupon.estimatedRewardInPaise)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {coupon.usageCount > 0 ? (
                          <form
                            action={setCouponRewardStatusAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input name="couponId" type="hidden" value={coupon.id} />
                            <input
                              name="usageCount"
                              type="hidden"
                              value={coupon.usageCount.toString()}
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
                              pendingLabel="Saving…"
                              size="sm"
                              variant="outline"
                            >
                              Save
                            </FormSubmitButton>
                          </form>
                        ) : (
                          <span className="text-muted-foreground text-xs">No redemptions</span>
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
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
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
                          <form action={setCouponStatusAction} className="inline-flex">
                            <input name="couponId" type="hidden" value={coupon.id} />
                            <input
                              name="isActive"
                              type="hidden"
                              value={(!coupon.isActive).toString()}
                            />
                            <Button
                              className="cursor-pointer"
                              size="sm"
                              type="submit"
                              variant={coupon.isActive ? "outline" : "default"}
                            >
                              {coupon.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-card/60 p-4 shadow-sm">
          <header className="mb-4">
            <h2 className="text-lg font-semibold">
              {selectedCoupon ? "Edit coupon" : "Create coupon"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {selectedCoupon
                ? "Update details or validity for the selected code."
                : "Issue a new code and assign it to a creator."}
            </p>
          </header>
          {!hasCreators ? (
            <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Add at least one creator user before issuing coupons.
            </div>
          ) : null}
          <form
            action={upsertCouponAction}
            className="mt-4 space-y-4"
          >
            <input name="couponId" type="hidden" value={selectedCoupon?.id ?? ""} />
            <div>
              <Label className="text-sm font-medium">Coupon code</Label>
              <Input
                className="mt-1 font-mono uppercase"
                maxLength={32}
                name="code"
                placeholder="CREATOR10"
                required
                defaultValue={selectedCoupon?.code ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Discount %</Label>
                <Input
                  className="mt-1"
                  min={1}
                  max={95}
                  name="discountPercentage"
                  required
                  type="number"
                  defaultValue={selectedCoupon?.discountPercentage ?? 10}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Creator</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  name="creatorId"
                  required
                  defaultValue={selectedCoupon?.creatorId ?? creators[0]?.id ?? ""}
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
                <Label className="text-sm font-medium">Valid from</Label>
                <Input
                  className="mt-1"
                  name="validFrom"
                  required
                  type="date"
                  defaultValue={selectedCoupon?.validFrom?.slice(0, 10)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Valid until</Label>
                <Input
                  className="mt-1"
                  name="validTo"
                  type="date"
                  defaultValue={selectedCoupon?.validTo?.slice(0, 10) ?? ""}
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Creator reward %</Label>
                <Input
                  className="mt-1"
                  min={0}
                  max={95}
                  name="creatorRewardPercentage"
                  required
                  type="number"
                  defaultValue={selectedCoupon?.creatorRewardPercentage ?? 0}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Description</Label>
              <Textarea
                className="mt-1"
                name="description"
                placeholder="Optional details shown in dashboards"
                rows={3}
                defaultValue={selectedCoupon?.description ?? ""}
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                name="isActive"
                defaultValue={selectedCoupon?.isActive ? "true" : "false"}
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
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">Creator performance</h2>
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
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
