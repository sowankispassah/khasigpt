"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";

const NOTICE_MESSAGES: Record<
  string,
  { defaultText: string; key: string; type: "success" | "error" }
> = {
  "model-pricing-updated": {
    defaultText: "Model pricing updated.",
    key: "admin.pricing.notice.model_pricing_updated",
    type: "success",
  },
  "model-pricing-update-error": {
    defaultText: "That model pricing could not be updated.",
    key: "admin.pricing.notice.model_pricing_error",
    type: "error",
  },
  "plan-created": {
    defaultText: "Pricing plan created.",
    key: "admin.pricing.notice.plan_created",
    type: "success",
  },
  "plan-deleted": {
    defaultText: "Pricing plan deleted.",
    key: "admin.pricing.notice.plan_deleted",
    type: "success",
  },
  "plan-hard-deleted": {
    defaultText: "Pricing plan permanently deleted.",
    key: "admin.pricing.notice.plan_hard_deleted",
    type: "success",
  },
  "plan-recommendation-updated": {
    defaultText: "Recommended plan updated.",
    key: "admin.pricing.notice.plan_recommendation_updated",
    type: "success",
  },
  "plan-update-error": {
    defaultText: "That pricing plan could not be updated.",
    key: "admin.pricing.notice.plan_update_error",
    type: "error",
  },
};

export function PricingNotice({ notice }: { notice?: string }) {
  const router = useRouter();
  const { translate } = useTranslation();

  useEffect(() => {
    if (!notice) return;
    const entry = NOTICE_MESSAGES[notice];
    if (entry) {
      toast({
        type: entry.type,
        description: translate(entry.key, entry.defaultText),
      });
    }
    router.replace("/admin/pricing", { scroll: false });
  }, [notice, router, translate]);

  return null;
}
