import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import type { BalanceSummary, PricingPlan } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { compactDate, formatCredits, formatPaise } from "@/utils/format";

export function BillingScreen() {
  const { palette } = useAppTheme();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.billingPlans().then((payload) => {
      setPlans(payload.plans);
      setBalance(payload.balance);
      setRecommendedPlanId(payload.recommendedPlanId);
    });
  }, []);

  return (
    <Screen>
      <Text style={[styles.title, { color: palette.foreground }]}>
        Recharge
      </Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
        Pricing, coupon validation, order creation, and verification remain in
        the existing Razorpay backend.
      </Text>

      <Card>
        <Text style={[styles.cardTitle, { color: palette.foreground }]}>
          Current balance
        </Text>
        <View style={styles.balanceRow}>
          <Text style={[styles.big, { color: palette.foreground }]}>
            {formatCredits(balance?.creditsRemaining)}
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            / {formatCredits(balance?.creditsTotal)} credits
          </Text>
        </View>
        <Text style={[styles.meta, { color: palette.mutedForeground }]}>
          Valid until {compactDate(balance?.expiresAt)}
        </Text>
      </Card>

      <TextField
        autoCapitalize="characters"
        label="Coupon"
        onChangeText={setCoupon}
        placeholder="Enter coupon code"
        value={coupon}
      />
      <Button
        disabled={!coupon.trim()}
        onPress={() =>
          setStatus(
            "Coupon validation is available through /api/billing/coupon/validate before creating a Razorpay order."
          )
        }
        variant="outline"
      >
        Validate coupon
      </Button>

      {plans
        .slice()
        .sort((a, b) => a.priceInPaise - b.priceInPaise)
        .map((plan) => (
          <Card key={plan.id}>
            <View style={styles.planHeader}>
              <Text style={[styles.cardTitle, { color: palette.foreground }]}>
                {plan.name}
              </Text>
              {plan.id === recommendedPlanId ? (
                <Text style={[styles.badge, { color: palette.success }]}>
                  Recommended
                </Text>
              ) : null}
            </View>
            <Text style={[styles.big, { color: palette.foreground }]}>
              {formatPaise(plan.priceInPaise)}
            </Text>
            <Text style={[styles.meta, { color: palette.mutedForeground }]}>
              {formatCredits(plan.tokenAllowance)} credits /{" "}
              {plan.billingCycleDays} days
            </Text>
            {plan.description ? (
              <Text style={[styles.meta, { color: palette.mutedForeground }]}>
                {plan.description}
              </Text>
            ) : null}
            <Button
              onPress={() =>
                setStatus(
                  "Android checkout can use Razorpay native SDK or secure web checkout. This button should call /api/billing/razorpay/order, then /api/billing/razorpay/verify."
                )
              }
            >
              Choose plan
            </Button>
          </Card>
        ))}

      {status ? (
        <Text style={[styles.meta, { color: palette.mutedForeground }]}>
          {status}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.title,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing[2],
  },
  cardTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  big: {
    fontSize: 32,
    fontWeight: "800",
  },
  meta: {
    fontSize: typography.small,
    lineHeight: 19,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  badge: {
    fontSize: typography.small,
    fontWeight: "700",
  },
});
