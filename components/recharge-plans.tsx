"use client";

import { CalendarClock, Check, Coins, ShieldCheck, Sparkles, Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useMemo, useState } from "react";

import { AccountNotice } from "@/components/account/account-ui";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { selectBaseCreditPlan } from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { cn } from "@/lib/utils";

const DESCRIPTION_SPLIT_REGEX = /\r?\n/;
const BULLET_PREFIX_REGEX = /^[\s*-\u2022]+/;
const FEATURE_SPLIT_REGEX = /\n/;
const IMAGE_GENERATION_FEATURE_REGEX = /\bimage\s*(generation|gen)\b/i;

type PlanForClient = {
  id: string;
  name: string;
  description: string | null;
  priceInPaise: number;
  tokenAllowance: number;
  billingCycleDays: number;
  isActive: boolean;
};

type RechargePlansProps = {
  couponsEnabled?: boolean;
  plans: PlanForClient[];
  activePlanId: string | null;
  imageGenerationEnabledForAll: boolean;
  recommendedPlanId: string | null;
  user: {
    name?: string | null;
    email?: string | null;
    contact?: string | null;
  };
};

type StatusMessage = {
  type: "success" | "error" | "info";
  message: string;
} | null;

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutLoader: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Razorpay is only available in the browser.")
    );
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (!checkoutLoader) {
    checkoutLoader = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RAZORPAY_CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        checkoutLoader = null;
        reject(new Error("Failed to load Razorpay checkout."));
      };
      document.body.appendChild(script);
    });
  }
  return checkoutLoader;
}

type RazorpayOrderResponse = {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: {
    id: string;
    name: string;
    description: string | null;
  };
  originalAmount?: number;
  discountAmount: number;
  appliedCoupon: {
    code: string;
    discountPercentage: number;
  } | null;
};

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export function RechargePlans({
  couponsEnabled = false,
  plans,
  activePlanId,
  imageGenerationEnabledForAll,
  recommendedPlanId,
  user,
}: RechargePlansProps) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusMessage>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanForClient | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponValidation, setCouponValidation] = useState<{
    code: string;
    discountAmount: number;
    discountPercentage: number;
    finalAmount: number;
  } | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const { translate } = useTranslation();

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      if (a.priceInPaise === b.priceInPaise) {
        return a.tokenAllowance - b.tokenAllowance;
      }
      return a.priceInPaise - b.priceInPaise;
    });
  }, [plans]);

  const resetDialogState = useCallback(() => {
    setCouponInput("");
    setCouponValidation(null);
    setCouponFeedback(null);
  }, []);

  const openPlanDialog = useCallback(
    (plan: PlanForClient) => {
      setSelectedPlan(plan);
      resetDialogState();
      setIsDialogOpen(true);
    },
    [resetDialogState]
  );

  const closePlanDialog = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedPlan(null);
    resetDialogState();
  }, [resetDialogState]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (isProcessingPayment) {
          return;
        }
        closePlanDialog();
      }
    },
    [closePlanDialog, isProcessingPayment]
  );

  const normalizedCouponInput = couponInput.trim().toUpperCase();
  const isCouponDirty =
    normalizedCouponInput.length > 0 &&
    couponValidation?.code !== normalizedCouponInput;
  const appliedDiscount =
    couponValidation && couponValidation.code === normalizedCouponInput
      ? couponValidation.discountAmount
      : 0;
  const selectedPlanPrice = selectedPlan?.priceInPaise ?? 0;
  const finalAmountInPaise = Math.max(selectedPlanPrice - appliedDiscount, 0);

  const formatPaise = useCallback((value: number) => {
    const hasFraction = value % 100 !== 0;
    return `₹${(value / 100).toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    })}`;
  }, []);

  const processCheckout = useCallback(
    async (plan: PlanForClient, couponCode?: string | null) => {
      if (plan.priceInPaise === 0) {
        return true;
      }

      let success = false;
      try {
        setIsProcessingPayment(true);
        setStatus(null);

        await loadRazorpayCheckout();

        const orderResponse = await fetch("/api/billing/razorpay/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: plan.id,
            couponCode: couponCode ?? undefined,
          }),
        });

        if (!orderResponse.ok) {
          const errorBody = await orderResponse.json().catch(() => null);
          throw new Error(
            errorBody?.message ??
              translate(
                "recharge.status.initialize_failed",
                "Failed to initialize payment."
              )
          );
        }

        const responseBody =
          (await orderResponse.json()) as RazorpayOrderResponse;
        const {
          key,
          orderId,
          amount,
          currency,
          plan: orderPlan,
        } = responseBody;

        if (responseBody.appliedCoupon && responseBody.discountAmount > 0) {
          const savings = `₹${(
            responseBody.discountAmount / 100
          ).toLocaleString("en-IN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`;
          setStatus({
            type: "info",
            message: translate(
              "recharge.status.coupon_applied",
              "Coupon {code} applied. You save {amount} on this recharge."
            )
              .replace("{code}", responseBody.appliedCoupon.code)
              .replace("{amount}", savings),
          });
        }

        const Razorpay = window.Razorpay;
        if (!Razorpay) {
          throw new Error(
            translate(
              "recharge.status.razorpay_unavailable",
              "Razorpay is not available."
            )
          );
        }

        await new Promise<void>((resolve, reject) => {
          const checkout = new Razorpay({
            key,
            amount,
            currency,
            name: orderPlan?.name ?? plan.name,
            description:
              orderPlan?.description ??
              translate(
                "recharge.plan.checkout_description",
                "Recharge credits"
              ),
            order_id: orderId,
            handler: async (response: RazorpaySuccessResponse) => {
              try {
                const verifyResponse = await fetch(
                  "/api/billing/razorpay/verify",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      orderId: response.razorpay_order_id,
                      paymentId: response.razorpay_payment_id,
                      signature: response.razorpay_signature,
                    }),
                  }
                );

                if (!verifyResponse.ok) {
                  const errorBody = await verifyResponse
                    .json()
                    .catch(() => null);
                  throw new Error(
                    errorBody?.message ??
                      translate(
                        "recharge.status.verify_failed",
                        "Failed to confirm payment."
                      )
                  );
                }

                setStatus({
                  type: "success",
                  message: translate(
                    "recharge.status.success",
                    "Payment successful. Your credits have been updated."
                  ),
                });
                router.refresh();
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            modal: {
              ondismiss: () => {
                setStatus({
                  type: "info",
                  message: translate(
                    "recharge.status.cancelled",
                    "Payment cancelled."
                  ),
                });
                resolve();
              },
            },
            prefill: {
              name: user.name ?? undefined,
              email: user.email ?? undefined,
              contact: user.contact ?? undefined,
            },
            notes: {
              planId: plan.id,
            },
          });

          checkout.on("payment.failed", (response: any) => {
            setStatus({
              type: "error",
              message:
                response?.error?.description ??
                translate(
                  "recharge.status.failure_generic",
                  "Payment failed. Please try again or contact support."
                ),
            });
            resolve();
          });

          checkout.open();
        });
        success = true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : translate(
                "recharge.status.error_generic",
                "Something went wrong while processing the payment."
              );
        setStatus({ type: "error", message });
        success = false;
      } finally {
        setIsProcessingPayment(false);
      }
      return success;
    },
    [router, translate, user.contact, user.email, user.name]
  );

  const handleCouponInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "");
      setCouponInput(value);
      if (couponValidation && couponValidation.code !== value) {
        setCouponValidation(null);
      }
      setCouponFeedback(null);
    },
    [couponValidation]
  );

  const handleValidateCoupon = useCallback(async () => {
    if (!selectedPlan) {
      return;
    }
    if (!normalizedCouponInput) {
      setCouponFeedback({
        type: "error",
        message: translate(
          "recharge.dialog.coupon_required",
          "Enter a coupon code to validate."
        ),
      });
      setCouponValidation(null);
      return;
    }

    setIsValidatingCoupon(true);
    setCouponFeedback(null);
    try {
      const response = await fetch("/api/billing/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan.id,
          couponCode: normalizedCouponInput,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.message ??
            translate("recharge.dialog.coupon_invalid", "Coupon is invalid.")
        );
      }

      const data = (await response.json()) as {
        discountAmount: number;
        finalAmount: number;
        coupon: { code: string; discountPercentage: number };
      };

      setCouponValidation({
        code: data.coupon.code,
        discountAmount: data.discountAmount,
        discountPercentage: data.coupon.discountPercentage,
        finalAmount: data.finalAmount,
      });
      setCouponFeedback({
        type: "success",
        message: translate(
          "recharge.dialog.coupon_applied",
          "Coupon applied successfully."
        ),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translate("recharge.dialog.coupon_invalid", "Coupon is invalid.");
      setCouponValidation(null);
      setCouponFeedback({ type: "error", message });
    } finally {
      setIsValidatingCoupon(false);
    }
  }, [normalizedCouponInput, selectedPlan, translate]);

  const handleProceedToPayment = useCallback(async () => {
    if (!selectedPlan) {
      return;
    }
    const couponToApply =
      couponValidation && couponValidation.code === normalizedCouponInput
        ? couponValidation.code
        : undefined;

    const success = await processCheckout(selectedPlan, couponToApply);
    if (success) {
      closePlanDialog();
    }
  }, [
    closePlanDialog,
    normalizedCouponInput,
    couponValidation,
    processCheckout,
    selectedPlan,
  ]);

  const canProceedToPayment =
    Boolean(selectedPlan) &&
    !isProcessingPayment &&
    (!normalizedCouponInput || !isCouponDirty);

  const basePlan = useMemo(
    () =>
      selectBaseCreditPlan(
        sortedPlans.filter(
          (plan) => plan.priceInPaise > 0 && plan.tokenAllowance > 0
        )
      ),
    [sortedPlans]
  );
  // Credits are charged at the base (most expensive per credit) pack's rate,
  // so a larger pack's extra credits per rupee are a real bonus.
  const bonusPercentFor = (plan: PlanForClient) => {
    if (!basePlan || plan.priceInPaise <= 0 || plan.tokenAllowance <= 0) {
      return 0;
    }
    const ratio =
      plan.tokenAllowance /
      plan.priceInPaise /
      (basePlan.tokenAllowance / basePlan.priceInPaise);
    return Math.round((ratio - 1) * 100);
  };
  const gridColumns =
    sortedPlans.length >= 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : sortedPlans.length === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : sortedPlans.length === 2
          ? "sm:grid-cols-2"
          : "sm:max-w-md";
  const selectedCredits = selectedPlan
    ? Math.floor(selectedPlan.tokenAllowance / TOKENS_PER_CREDIT)
    : 0;

  return (
    <div className="space-y-4">
      {status ? (
        <AccountNotice
          tone={
            status.type === "success"
              ? "success"
              : status.type === "error"
                ? "danger"
                : "info"
          }
        >
          {status.message}
        </AccountNotice>
      ) : null}

      <section
        aria-label={translate("recharge.title", "Choose your plan")}
        className={cn("grid gap-4", gridColumns)}
      >
        {sortedPlans.map((plan) => {
          const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
          const isActive = activePlanId === plan.id;
          const isRecommended = recommendedPlanId === plan.id;
          const isFreePlan = plan.priceInPaise === 0;
          const isCurrentFreePlan = isFreePlan && (isActive || !activePlanId);
          const effectiveIsActive = isActive || isCurrentFreePlan;
          const bonusPercent = bonusPercentFor(plan);
          const pricePerCredit =
            !isFreePlan && credits > 0 ? plan.priceInPaise / 100 / credits : null;

          const priceLabel =
            plan.priceInPaise === 0
              ? translate("recharge.plan.price.free", "Free")
              : `₹${(plan.priceInPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}`;

          const descriptionFeatures = (plan.description ?? "")
            .split(DESCRIPTION_SPLIT_REGEX)
            .map((line) => line.replace(BULLET_PREFIX_REGEX, "").trim())
            .filter((line) => line.length > 0);

          const features =
            descriptionFeatures.length > 0
              ? descriptionFeatures
              : plan.description
                ? [plan.description]
                : [];
          const visibleFeatures = imageGenerationEnabledForAll
            ? features
            : features.filter(
                (feature) => !IMAGE_GENERATION_FEATURE_REGEX.test(feature)
              );

          return (
            <article
              className={cn(
                "relative flex h-full min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-xs transition hover:shadow-md sm:p-6",
                isRecommended && "border-primary ring-1 ring-primary",
                effectiveIsActive &&
                  !isRecommended &&
                  "border-emerald-500/50 ring-1 ring-emerald-500/30"
              )}
              key={plan.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 break-words font-semibold text-lg">
                  {plan.name}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {isRecommended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground text-xs">
                      <Sparkles aria-hidden="true" className="size-3" />
                      <EditableTranslation
                        defaultText="Recommended"
                        translationKey="recharge.plan.badge.recommended"
                      />
                    </span>
                  ) : null}
                  {effectiveIsActive ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-700 text-xs ring-1 ring-emerald-500/20 ring-inset dark:text-emerald-400">
                      <EditableTranslation
                        defaultText="Your current plan"
                        translationKey="recharge.plan.pill.active"
                      />
                    </span>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 font-semibold text-3xl tabular-nums tracking-tight">
                {priceLabel}
              </p>

              {plan.tokenAllowance > 0 || plan.billingCycleDays > 0 ? (
                <div className="mt-4 space-y-2 text-sm">
                  {plan.tokenAllowance > 0 ? (
                    <div className="flex items-start gap-2">
                      <Coins
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0">
                        <span className="font-medium tabular-nums">
                          <EditableTranslation
                            defaultText="{credits} credits"
                            translationKey="recharge.plan.credits"
                            values={{ credits: credits.toLocaleString() }}
                          />
                        </span>
                        {pricePerCredit !== null ? (
                          <span className="block text-muted-foreground text-xs tabular-nums">
                            <EditableTranslation
                              defaultText="{price} per credit"
                              description="Price of one credit in a recharge plan."
                              translationKey="recharge.plan.price_per_credit"
                              values={{
                                price: `₹${pricePerCredit.toLocaleString("en-IN", {
                                  maximumFractionDigits: 2,
                                  minimumFractionDigits: 2,
                                })}`,
                              }}
                            />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {plan.billingCycleDays > 0 ? (
                    <div className="flex items-center gap-2">
                      <CalendarClock
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <div>
                        <EditableTranslation
                          defaultText="Validity: {days} days"
                          translationKey="recharge.plan.validity"
                          values={{ days: plan.billingCycleDays }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {bonusPercent >= 1 ? (
                <p className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-400">
                  <EditableTranslation
                    defaultText="{percent}% more credits per rupee"
                    description="Bonus shown on larger recharge packs compared with the smallest pack."
                    translationKey="recharge.plan.bonus"
                    values={{ percent: bonusPercent }}
                  />
                </p>
              ) : null}

              {visibleFeatures.length > 0 ? (
                <ul className="mt-5 space-y-2 border-t pt-4 text-sm">
                  {visibleFeatures.map((feature) => {
                    const lines = feature.split(FEATURE_SPLIT_REGEX);
                    return lines.map((line) => (
                      <li
                        className="flex items-start gap-2"
                        key={`${feature}-${line}`}
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="min-w-0 break-words">{line}</span>
                      </li>
                    ));
                  })}
                </ul>
              ) : null}

              <div className="mt-auto pt-6">
                {isFreePlan ? (
                  <Button
                    className="h-11 w-full rounded-xl"
                    disabled
                    type="button"
                    variant="outline"
                  >
                    {effectiveIsActive ? (
                      <EditableTranslation
                        defaultText="Your current plan"
                        translationKey="recharge.plan.pill.active"
                      />
                    ) : (
                      <EditableTranslation
                        defaultText="Free Plan"
                        translationKey="recharge.plan.button.free"
                      />
                    )}
                  </Button>
                ) : (
                  <Button
                    className="h-11 w-full cursor-pointer rounded-xl"
                    disabled={isProcessingPayment}
                    onClick={() => openPlanDialog(plan)}
                    type="button"
                    variant={isRecommended ? "default" : "outline"}
                  >
                    {effectiveIsActive ? (
                      <EditableTranslation
                        defaultText="Recharge again"
                        translationKey="recharge.plan.button.recharge_again"
                      />
                    ) : (
                      <EditableTranslation
                        defaultText="Get {plan}"
                        translationKey="recharge.plan.button.get"
                        values={{ plan: plan.name }}
                      />
                    )}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {couponsEnabled ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Ticket aria-hidden="true" className="size-4 shrink-0" />
          <EditableTranslation
            defaultText="Have a coupon? You can apply it after choosing a plan."
            description="Recharge page hint that coupons are entered in the checkout review step."
            translationKey="recharge.coupon.page_hint"
          />
        </p>
      ) : null}

      <AlertDialog onOpenChange={handleDialogOpenChange} open={isDialogOpen}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("recharge.dialog.title", "Review your recharge")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "recharge.dialog.description",
                "Confirm the plan details before continuing to payment."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-5">
            <div className="rounded-xl border bg-muted/30">
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {selectedPlan?.name ??
                      translate(
                        "recharge.dialog.plan_placeholder",
                        "Selected plan"
                      )}
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {selectedCredits > 0
                      ? translate("recharge.plan.credits", "{credits} credits").replace(
                          "{credits}",
                          selectedCredits.toLocaleString()
                        )
                      : null}
                    {selectedCredits > 0 && selectedPlan?.billingCycleDays
                      ? " · "
                      : null}
                    {selectedPlan?.billingCycleDays
                      ? translate(
                          "recharge.plan.validity",
                          "Validity: {days} days"
                        ).replace("{days}", String(selectedPlan.billingCycleDays))
                      : null}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatPaise(selectedPlanPrice)}
                </span>
              </div>
              {appliedDiscount > 0 ? (
                <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-emerald-700 text-sm dark:text-emerald-400">
                  <span>
                    {translate(
                      "recharge.dialog.summary.discount",
                      "Coupon discount"
                    )}
                    {couponValidation?.discountPercentage
                      ? ` (${couponValidation.discountPercentage}%)`
                      : ""}
                  </span>
                  <span className="tabular-nums">-{formatPaise(appliedDiscount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4 border-t px-4 py-3 font-semibold text-base">
                <span>
                  {translate("recharge.dialog.summary.total", "Total due")}
                </span>
                <span className="tabular-nums">{formatPaise(finalAmountInPaise)}</span>
              </div>
            </div>

            {couponsEnabled ? (
              <div className="space-y-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="coupon-code-input"
                >
                  {translate("recharge.dialog.coupon_label", "Coupon code")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    aria-label={translate(
                      "recharge.dialog.coupon_label",
                      "Coupon code"
                    )}
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    id="coupon-code-input"
                    maxLength={32}
                    onChange={handleCouponInputChange}
                    placeholder={translate(
                      "recharge.coupon.placeholder",
                      "CREATOR10"
                    )}
                    spellCheck={false}
                    value={couponInput}
                  />
                  <Button
                    className="h-11 w-full cursor-pointer rounded-xl sm:w-auto"
                    disabled={
                      !selectedPlan ||
                      !normalizedCouponInput ||
                      isValidatingCoupon
                    }
                    onClick={handleValidateCoupon}
                    type="button"
                    variant="outline"
                  >
                    {isValidatingCoupon ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin">
                          <LoaderIcon size={14} />
                        </span>
                        <span>
                          {translate(
                            "recharge.dialog.validating",
                            "Validating..."
                          )}
                        </span>
                      </span>
                    ) : (
                      translate("recharge.dialog.validate", "Validate coupon")
                    )}
                  </Button>
                </div>
                {couponFeedback ? (
                  <p
                    className={cn(
                      "text-sm",
                      couponFeedback.type === "error"
                        ? "text-destructive"
                        : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {couponFeedback.message}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {translate(
                      "recharge.dialog.coupon_helper",
                      "Coupons are optional. Leave blank if you don't have one."
                    )}
                  </p>
                )}
              </div>
            ) : null}

            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
              {translate(
                "recharge.info.secure.body",
                "Payments are completed in Razorpay's secure checkout."
              )}
            </p>
          </div>
          <AlertDialogFooter className="gap-2">
            <Button
              className="h-11 cursor-pointer rounded-xl sm:h-10"
              disabled={isProcessingPayment}
              onClick={closePlanDialog}
              type="button"
              variant="ghost"
            >
              {translate("common.cancel", "Cancel")}
            </Button>
            <Button
              className="h-11 min-w-[150px] cursor-pointer rounded-xl sm:h-10"
              disabled={!canProceedToPayment}
              onClick={handleProceedToPayment}
              type="button"
            >
              {isProcessingPayment ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin">
                    <LoaderIcon size={16} />
                  </span>
                  <span>
                    {translate(
                      "recharge.plan.button.processing",
                      "Processing..."
                    )}
                  </span>
                </span>
              ) : (
                translate("recharge.dialog.proceed", "Proceed to payment")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
