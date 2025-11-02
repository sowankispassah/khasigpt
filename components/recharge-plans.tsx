"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const { translate } = useTranslation();

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      if (a.priceInPaise === b.priceInPaise) {
        return a.tokenAllowance - b.tokenAllowance;
      }
      return a.priceInPaise - b.priceInPaise;
    });
  }, [plans]);

  const handleCheckout = useCallback(
    async (plan: PlanForClient) => {
      if (plan.priceInPaise === 0) {
        return;
      }

      try {
        setLoadingPlanId(plan.id);
        setStatus(null);

        await loadRazorpayCheckout();

        const orderResponse = await fetch("/api/billing/razorpay/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id }),
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

        const {
          key,
          orderId,
          amount,
          currency,
          plan: orderPlan,
        } = (await orderResponse.json()) as RazorpayOrderResponse;

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
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : translate(
                "recharge.status.error_generic",
                "Something went wrong while processing the payment."
              );
        setStatus({ type: "error", message });
      } finally {
        setLoadingPlanId(null);
      }
    },
    [router, user.name, user.email, user.contact]
  );

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

          const isLoading = loadingPlanId === plan.id;

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
                      disabled={isLoading}
                      onClick={() => handleCheckout(plan)}
                      type="button"
                      variant={buttonVariant}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
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
                        buttonLabel
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
