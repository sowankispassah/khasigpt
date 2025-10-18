"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/toast";

const NOTICE_MESSAGES: Record<string, { message: string; type: "success" | "error" }> = {
  "plan-created": { type: "success", message: "Pricing plan created." },
  "plan-updated": { type: "success", message: "Pricing plan updated." },
  "plan-deleted": { type: "success", message: "Pricing plan deleted." },
  "plan-hard-deleted": { type: "success", message: "Pricing plan permanently deleted." },
  "model-created": { type: "success", message: "Model configuration created." },
  "model-updated": { type: "success", message: "Model configuration updated." },
  "model-deleted": { type: "success", message: "Model configuration deleted." },
  "model-hard-deleted": { type: "success", message: "Model configuration permanently deleted." },
  "model-defaulted": { type: "success", message: "Default model updated." },
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
