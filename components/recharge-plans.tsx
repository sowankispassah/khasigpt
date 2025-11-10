"use client";

import type React from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/language-provider";

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
  plans: PlanForClient[];
  activePlanId: string | null;
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
  plans,
  activePlanId,
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
  const [couponFeedback, setCouponFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
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

        const responseBody = (await orderResponse.json()) as RazorpayOrderResponse;
        const { key, orderId, amount, currency, plan: orderPlan } = responseBody;

        if (responseBody.appliedCoupon && responseBody.discountAmount > 0) {
          const savings = `₹${(responseBody.discountAmount / 100).toLocaleString("en-IN", {
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
              translate("recharge.plan.checkout_description", "Recharge credits"),
            order_id: orderId,
            handler: async (response: RazorpaySuccessResponse) => {
              try {
                const verifyResponse = await fetch("/api/billing/razorpay/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    orderId: response.razorpay_order_id,
                    paymentId: response.razorpay_payment_id,
                    signature: response.razorpay_signature,
                  }),
                });

                if (!verifyResponse.ok) {
                  const errorBody = await verifyResponse.json().catch(() => null);
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
                  message: translate("recharge.status.cancelled", "Payment cancelled."),
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
  }, [
    normalizedCouponInput,
    selectedPlan,
    translate,
  ]);

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

  return (
    <div className="space-y-4">
      {status ? (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            status.type === "success" &&
              "border-green-500/60 bg-green-500/10 text-green-600",
            status.type === "error" &&
              "border-red-500/60 bg-red-500/10 text-red-600",
            status.type === "info" &&
              "border-muted bg-muted/20 text-muted-foreground"
          )}
        >
          {status.message}
        </div>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {sortedPlans.map((plan) => {
          const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
          const isActive = activePlanId === plan.id;
          const isRecommended = recommendedPlanId === plan.id;
          const isFreePlan = plan.priceInPaise === 0;
          const isCurrentFreePlan = isFreePlan && (isActive || !activePlanId);
          const effectiveIsActive = isActive || isCurrentFreePlan;

          const priceLabel =
            plan.priceInPaise === 0
              ? translate("recharge.plan.price.free", "Free")
              : `₹${(plan.priceInPaise / 100).toLocaleString("en-IN", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}`;

          const descriptionFeatures = (plan.description ?? "")
            .split(/\r?\n/)
            .map((line) => line.replace(/^[\s*-\u2022]+/, "").trim())
            .filter((line) => line.length > 0);

          const features =
            descriptionFeatures.length > 0
              ? descriptionFeatures
              : plan.description
                ? [plan.description]
                : [];

          const buttonLabel = effectiveIsActive
            ? isFreePlan
              ? translate("recharge.plan.pill.active", "Previously recharged")
              : translate("recharge.plan.button.recharge_again", "Recharge again")
            : isFreePlan
              ? translate("recharge.plan.button.free", "Free Plan")
              : translate("recharge.plan.button.get", "Get {plan}").replace("{plan}", plan.name);

          const buttonVariant = isFreePlan ? "outline" : "default";

          return (
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-card/80 p-6 pb-6 shadow-sm transition hover:border-primary hover:shadow-lg",
                effectiveIsActive && "border-primary ring-1 ring-primary/40",
                isRecommended && "border-amber-400/60"
              )}
              key={plan.id}
            >
              {isRecommended ? (
                <div className="-translate-x-1/2 absolute top-2.5 left-1/2 flex">
                  <span className="rounded-full bg-amber-500/15 px-2 py-[2px] font-semibold text-[11px] text-amber-600">
                    {translate("recharge.plan.badge.recommended", "Recommended")}
                  </span>
                </div>
              ) : null}

              <div className="flex flex-1 flex-col space-y-4 pt-2">
                <div className="flex flex-1 flex-col space-y-4">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-xl">{plan.name}</h3>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "font-bold text-3xl",
                          plan.priceInPaise === 0 && "text-foreground/80"
                        )}
                      >
                        {priceLabel}
                      </span>
                    </div>
                  </div>

                  {plan.tokenAllowance > 0 || plan.billingCycleDays > 0 ? (
                    <div className="text-muted-foreground text-sm leading-6">
                      {plan.tokenAllowance > 0 ? (
                        <p>
                          {translate(
                            "recharge.plan.credits",
                            "{credits} credits"
                          ).replace(
                            "{credits}",
                            credits.toLocaleString()
                          )}
                        </p>
                      ) : null}
                      {plan.billingCycleDays > 0 ? (
                        <p>
                          {translate(
                            "recharge.plan.validity",
                            "Validity: {days} days"
                          ).replace("{days}", String(plan.billingCycleDays))}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {features.length > 0 ? (
                    <div className="space-y-2">
                      <ul className="space-y-2 text-sm">
                        {features.map((feature, featureIndex) => {
                          const lines = feature.split(/\n/);
                          return lines.map((line, lineIndex) => (
                            <li
                              className="flex items-start gap-2"
                              key={`${featureIndex}-${lineIndex}`}
                            >
                              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                              <span>{line}</span>
                            </li>
                          ));
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="mt-auto space-y-3 pt-6">
                  {effectiveIsActive ? (
                    <div className="rounded-md bg-primary/5 px-3 py-2 text-center font-medium text-primary text-xs">
                      {translate(
                        "recharge.plan.pill.active",
                        "Previously recharged"
                      )}
                    </div>
                  ) : null}
                  {isFreePlan ? (
                    <Button
                      className="w-full rounded-full"
                      disabled
                      type="button"
                      variant={buttonVariant}
                    >
                      {buttonLabel}
                    </Button>
                  ) : (
                    <Button
                      className="w-full rounded-full"
                      disabled={isProcessingPayment}
                      onClick={() => openPlanDialog(plan)}
                      type="button"
                      variant={buttonVariant}
                    >
                      {buttonLabel}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <AlertDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("recharge.dialog.title", "Review your recharge")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "recharge.dialog.description",
                "Confirm the plan details and apply a coupon before continuing to payment."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {selectedPlan?.name ?? translate("recharge.dialog.plan_placeholder", "Selected plan")}
                </span>
                <span>{formatPaise(selectedPlanPrice)}</span>
              </div>
              {selectedPlan?.billingCycleDays ? (
                <p className="text-muted-foreground text-xs">
                  {translate("recharge.plan.validity", "Validity: {days} days").replace(
                    "{days}",
                    String(selectedPlan.billingCycleDays)
                  )}
                </p>
              ) : null}
              {appliedDiscount > 0 ? (
                <div className="mt-3 flex items-center justify-between text-emerald-600 text-sm">
                  <span>
                    {translate("recharge.dialog.summary.discount", "Coupon discount")}
                    {couponValidation?.discountPercentage
                      ? ` (${couponValidation.discountPercentage}%)`
                      : ""}
                  </span>
                  <span>-{formatPaise(appliedDiscount)}</span>
                </div>
              ) : null}
              <div className="mt-4 flex items-center justify-between text-base font-semibold">
                <span>{translate("recharge.dialog.summary.total", "Total due")}</span>
                <span>{formatPaise(finalAmountInPaise)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {translate("recharge.dialog.coupon_label", "Coupon code")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  aria-label={translate("recharge.dialog.coupon_label", "Coupon code")}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm uppercase tracking-wide"
                  maxLength={32}
                  onChange={handleCouponInputChange}
                  placeholder={translate("recharge.coupon.placeholder", "CREATOR10")}
                  spellCheck={false}
                  value={couponInput}
                />
                <Button
                  className="w-full sm:w-auto"
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
                        {translate("recharge.dialog.validating", "Validating...")}
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
                      : "text-emerald-600"
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
          </div>
          <AlertDialogFooter>
            <Button
              disabled={isProcessingPayment}
              onClick={closePlanDialog}
              type="button"
              variant="ghost"
            >
              {translate("common.cancel", "Cancel")}
            </Button>
            <Button
              className="min-w-[150px]"
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
                    {translate("recharge.plan.button.processing", "Processing...")}
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
