"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/toast";

const NOTICE_MESSAGES: Record<string, { message: string; type: "success" | "error" }> = {
  "plan-created": { type: "success", message: "Pricing plan created." },
  "plan-updated": { type: "success", message: "Pricing plan updated." },
  "plan-deleted": { type: "success", message: "Pricing plan deleted." },
  "plan-hard-deleted": { type: "success", message: "Pricing plan permanently deleted." },
  "plan-recommendation-updated": { type: "success", message: "Recommended plan updated." },
  "model-created": { type: "success", message: "Model configuration created." },
  "model-updated": { type: "success", message: "Model configuration updated." },
  "model-deleted": { type: "success", message: "Model configuration deleted." },
  "model-hard-deleted": { type: "success", message: "Model configuration permanently deleted." },
  "model-defaulted": { type: "success", message: "Default model updated." },
  "privacy-updated": { type: "success", message: "Privacy policy updated." },
  "terms-updated": { type: "success", message: "Terms of service updated." },
  "suggested-prompts-updated": { type: "success", message: "Suggested prompts updated." },
};

export function AdminSettingsNotice({ notice }: { notice?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!notice) {
      return;
    }

    const entry = NOTICE_MESSAGES[notice];
    if (!entry) {
      router.replace("/admin/settings", { scroll: false });
      return;
    }

    toast({ type: entry.type, description: entry.message });
    router.replace("/admin/settings", { scroll: false });
  }, [notice, router]);

  return null;
}
