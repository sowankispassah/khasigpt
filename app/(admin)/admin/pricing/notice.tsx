"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { toast } from "@/components/toast";

const NOTICE_MESSAGES: Record<string, { message: string; type: "success" | "error" }> = {
  "plan-created": { message: "Pricing plan created.", type: "success" },
  "plan-deleted": { message: "Pricing plan deleted.", type: "success" },
  "plan-hard-deleted": { message: "Pricing plan permanently deleted.", type: "success" },
  "plan-recommendation-updated": { message: "Recommended plan updated.", type: "success" },
  "plan-update-error": { message: "That pricing plan could not be updated.", type: "error" },
};

export function PricingNotice({ notice }: { notice?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!notice) return;
    const entry = NOTICE_MESSAGES[notice];
    if (entry) toast({ type: entry.type, description: entry.message });
    router.replace("/admin/pricing", { scroll: false });
  }, [notice, router]);

  return null;
}
