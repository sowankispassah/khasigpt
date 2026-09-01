"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";

const NOTICE_MESSAGES: Record<
  string,
  { defaultText: string; key: string; type: "success" | "error" }
> = {
  "image-translation-model-invalid": {
    defaultText: "Selected translation model is unavailable or disabled. Choose an enabled model.",
    key: "admin.pricing.notice.image_translation_model_invalid",
    type: "error",
  },
  "image-translation-model-updated": {
    defaultText: "Image prompt translation model updated.",
    key: "admin.pricing.notice.image_translation_model_updated",
    type: "success",
  },
  "image-model-activate-error": {
    defaultText: "The active image model could not be updated. Please refresh and try again.",
    key: "admin.pricing.notice.image_model_activate_error",
    type: "error",
  },
  "image-model-activated": {
    defaultText: "Active image model updated.",
    key: "admin.pricing.notice.image_model_activated",
    type: "success",
  },
  "image-model-create-error": {
    defaultText: "Failed to create the image model configuration. Check your inputs and try again.",
    key: "admin.pricing.notice.image_model_create_error",
    type: "error",
  },
  "image-model-created": {
    defaultText: "Image model configuration created.",
    key: "admin.pricing.notice.image_model_created",
    type: "success",
  },
  "image-model-deleted": {
    defaultText: "Image model configuration deleted.",
    key: "admin.pricing.notice.image_model_deleted",
    type: "success",
  },
  "image-model-hard-deleted": {
    defaultText: "Image model configuration permanently deleted.",
    key: "admin.pricing.notice.image_model_hard_deleted",
    type: "success",
  },
  "image-model-key-conflict": {
    defaultText: "Image model key already exists. Choose a different key or edit the existing configuration.",
    key: "admin.pricing.notice.image_model_key_conflict",
    type: "error",
  },
  "image-model-key-soft-deleted": {
    defaultText: "A deleted image model uses this key. Permanently delete it before creating a new one.",
    key: "admin.pricing.notice.image_model_key_deleted",
    type: "error",
  },
  "image-model-updated": {
    defaultText: "Image model configuration updated.",
    key: "admin.pricing.notice.image_model_updated",
    type: "success",
  },
  "image-model-update-missing": {
    defaultText: "That image model no longer exists.",
    key: "admin.pricing.notice.image_model_missing",
    type: "error",
  },
  "live-voice-model-create-error": {
    defaultText: "Failed to create the live voice model configuration. Check your inputs and try again.",
    key: "admin.pricing.notice.voice_model_create_error",
    type: "error",
  },
  "live-voice-model-created": {
    defaultText: "Live voice model configuration created.",
    key: "admin.pricing.notice.voice_model_created",
    type: "success",
  },
  "live-voice-model-defaulted": {
    defaultText: "Default live voice model updated.",
    key: "admin.pricing.notice.voice_model_defaulted",
    type: "success",
  },
  "live-voice-model-deleted": {
    defaultText: "Live voice model configuration deleted.",
    key: "admin.pricing.notice.voice_model_deleted",
    type: "success",
  },
  "live-voice-model-hard-deleted": {
    defaultText: "Live voice model configuration permanently deleted.",
    key: "admin.pricing.notice.voice_model_hard_deleted",
    type: "success",
  },
  "live-voice-model-key-conflict": {
    defaultText: "Live voice model key already exists. Choose a different key or edit the existing configuration.",
    key: "admin.pricing.notice.voice_model_key_conflict",
    type: "error",
  },
  "live-voice-model-key-soft-deleted": {
    defaultText: "A deleted live voice model uses this key. Permanently delete it before creating a new one.",
    key: "admin.pricing.notice.voice_model_key_deleted",
    type: "error",
  },
  "live-voice-model-update-error": {
    defaultText: "Failed to update the live voice model configuration. Check the model values and try again.",
    key: "admin.pricing.notice.voice_model_update_error",
    type: "error",
  },
  "live-voice-model-update-missing": {
    defaultText: "That live voice model no longer exists.",
    key: "admin.pricing.notice.voice_model_missing",
    type: "error",
  },
  "live-voice-model-updated": {
    defaultText: "Live voice model configuration updated.",
    key: "admin.pricing.notice.voice_model_updated",
    type: "success",
  },
  "model-create-error": {
    defaultText: "Failed to create the model configuration. Check your inputs and try again.",
    key: "admin.pricing.notice.model_create_error",
    type: "error",
  },
  "model-created": {
    defaultText: "Model configuration created.",
    key: "admin.pricing.notice.model_created",
    type: "success",
  },
  "model-defaulted": {
    defaultText: "Default model updated.",
    key: "admin.pricing.notice.model_defaulted",
    type: "success",
  },
  "model-deleted": {
    defaultText: "Model configuration deleted.",
    key: "admin.pricing.notice.model_deleted",
    type: "success",
  },
  "model-hard-deleted": {
    defaultText: "Model configuration permanently deleted.",
    key: "admin.pricing.notice.model_hard_deleted",
    type: "success",
  },
  "model-key-conflict": {
    defaultText: "Model key already exists. Choose a different key or edit the existing configuration.",
    key: "admin.pricing.notice.model_key_conflict",
    type: "error",
  },
  "model-key-soft-deleted": {
    defaultText: "A deleted model uses this key. Permanently delete it before creating a new one.",
    key: "admin.pricing.notice.model_key_deleted",
    type: "error",
  },
  "model-margin-baseline": {
    defaultText: "Margin baseline model updated.",
    key: "admin.pricing.notice.model_margin_baseline",
    type: "success",
  },
  "model-updated": {
    defaultText: "Model configuration updated.",
    key: "admin.pricing.notice.model_updated",
    type: "success",
  },
  "model-update-missing": {
    defaultText: "That model no longer exists.",
    key: "admin.pricing.notice.model_missing",
    type: "error",
  },
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
  "plan-updated": {
    defaultText: "Pricing plan updated.",
    key: "admin.pricing.notice.plan_updated",
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
