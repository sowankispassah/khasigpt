"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

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

type StatusMessage =
  | { type: "success" | "error" | "info"; message: string }
  | null;

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutLoader: Promise<void> | null = null;

function loadRazorpayCheckout() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay is only available in the browser."));
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

  const hasMultiplePlans = plans.length > 1;

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
          throw new Error(errorBody?.message ?? "Failed to initialize payment.");
        }

        const { key, orderId, amount, currency, plan: orderPlan } =
          (await orderResponse.json()) as RazorpayOrderResponse;

        const Razorpay = window.Razorpay;
        if (!Razorpay) {
          throw new Error("Razorpay is not available.");
        }

        await new Promise<void>((resolve, reject) => {
          const checkout = new Razorpay({
            key,
            amount,
            currency,
            name: orderPlan?.name ?? plan.name,
            description: orderPlan?.description ?? "Recharge credits",
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
                  throw new Error(errorBody?.message ?? "Failed to confirm payment.");
                }

                setStatus({
                  type: "success",
                  message: "Payment successful. Your credits have been updated.",
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
                  message: "Payment cancelled.",
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
                "Payment failed. Please try again or contact support.",
            });
            resolve();
          });

          checkout.open();
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Something went wrong while processing the payment.";
        setStatus({ type: "error", message });
      } finally {
        setLoadingPlanId(null);
      }
    },
    [router, user.name, user.email, user.contact],
  );

  return (
    <div className="space-y-4">
      {status ? (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            status.type === "success" && "border-green-500/60 bg-green-500/10 text-green-600",
            status.type === "error" && "border-red-500/60 bg-red-500/10 text-red-600",
            status.type === "info" && "border-muted bg-muted/20 text-muted-foreground",
          )}
        >
          {status.message}
        </div>
      ) : null}

      <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {sortedPlans.map((plan) => {
          const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
          const isActive = activePlanId === plan.id;
          const isRecommended =
            hasMultiplePlans &&
            plan.priceInPaise > 0 &&
            recommendedPlanId === plan.id &&
            !isActive;
          const isFreePlan = plan.priceInPaise === 0;
          const isCurrentFreePlan = isFreePlan && (isActive || !activePlanId);
          const effectiveIsActive = isActive || isCurrentFreePlan;

          const priceLabel =
            plan.priceInPaise === 0
              ? "Free"
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
              ? "Current Plan"
              : "Recharge again"
            : isFreePlan
              ? "Free Plan"
              : `Get ${plan.name}`;

          const buttonVariant =
            isFreePlan && effectiveIsActive
              ? "outline"
              : isRecommended || effectiveIsActive
                ? "default"
                : "outline";

          const isLoading = loadingPlanId === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-card/80 p-6 shadow-sm transition hover:border-primary hover:shadow-lg",
                effectiveIsActive && "border-primary ring-1 ring-primary/40",
                isRecommended && "border-amber-400/60",
              )}
            >
              {isRecommended ? (
                <span className="absolute right-5 top-5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
                  Recommended
                </span>
              ) : null}
              {effectiveIsActive ? (
                <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Current plan
                </span>
              ) : null}

              <div className="flex flex-1 flex-col space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        "text-3xl font-bold",
                        plan.priceInPaise === 0 && "text-foreground/80",
                      )}
                    >
                      {priceLabel}
                    </span>
                  </div>
                </div>

                {plan.tokenAllowance > 0 || plan.billingCycleDays > 0 ? (
                  <div className="text-muted-foreground text-sm leading-6">
                    {plan.tokenAllowance > 0 ? (
                      <p>{credits.toLocaleString()} credits</p>
                    ) : null}
                    {plan.billingCycleDays > 0 ? (
                      <p>Validity: {plan.billingCycleDays} days</p>
                    ) : null}
                  </div>
                ) : null}

                {features.length > 0 ? (
                  <div className="space-y-2">
                    <ul className="space-y-2 text-sm">
                      {features.map((feature, featureIndex) => {
                        const lines = feature.split(/\n/);
                        return lines.map((line, lineIndex) => (
                          <li className="flex items-start gap-2" key={`${featureIndex}-${lineIndex}`}>
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                            <span>{line}</span>
                          </li>
                        ));
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="mt-auto pt-6">
                {isFreePlan ? (
                  <Button className="w-full rounded-full" disabled variant={buttonVariant}>
                    {buttonLabel}
                  </Button>
                ) : (
                  <Button
                    className="w-full rounded-full"
                    disabled={isLoading}
                    variant={buttonVariant}
                    onClick={() => handleCheckout(plan)}
                  >
                    {isLoading ? "Processing..." : buttonLabel}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
