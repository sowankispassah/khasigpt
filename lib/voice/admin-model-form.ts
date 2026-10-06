import { z } from "zod";
import { GOOGLE_LIVE_VOICE_OPTIONS } from "@/lib/voice/live";
import { GPT_LIVE_MODEL_ID, OPENAI_LIVE_VOICES, readDurationVoicePricing } from "@/lib/voice/pricing";

const cost = z.coerce.number().finite().positive().max(10_000);
export function parseLiveVoiceForm(form: FormData) {
  const provider = z.enum(["google", "openai"]).parse(form.get("provider"));
  const providerModelId = z.string().trim().min(1).max(128).regex(/^[\w./-]+$/).parse(form.get("providerModelId"));
  if (provider === "openai" && providerModelId !== GPT_LIVE_MODEL_ID) throw new Error("Unsupported live voice model");
  const inputProviderCostPerMillion = cost.parse(form.get("inputProviderCostPerMillion"));
  const outputProviderCostPerMillion = cost.parse(form.get("outputProviderCostPerMillion"));
  let markupMultiplier = z.coerce.number().finite().min(1).max(20).parse(form.get("markupMultiplier"));
  const raw = form.get("configJson")?.toString().trim();
  const config = raw ? z.record(z.unknown()).parse(JSON.parse(raw)) : {};
  const voiceName = form.get("voiceName")?.toString() ?? "";
  if (!(provider === "openai" ? OPENAI_LIVE_VOICES : GOOGLE_LIVE_VOICE_OPTIONS.map(v => v.value)).includes(voiceName as never)) throw new Error("Invalid voice");
  if (provider === "openai") {
    const pricing = {
      providerCostPerMinuteUsd: cost.parse(form.get("providerCostPerMinuteUsd")),
      customerChargePerMinuteUsd: cost.parse(form.get("customerChargePerMinuteUsd")),
      backendModel: form.get("backendModel")?.toString().trim(),
      backendInputCostPerMillionUsd: inputProviderCostPerMillion,
      backendCachedInputCostPerMillionUsd: cost.parse(form.get("backendCachedInputCostPerMillionUsd")),
      backendOutputCostPerMillionUsd: outputProviderCostPerMillion,
    };
    config.durationPricing = pricing;
    if (!readDurationVoicePricing(config)) throw new Error("Invalid duration pricing");
    markupMultiplier = pricing.customerChargePerMinuteUsd / pricing.providerCostPerMinuteUsd;
  } else { delete config.durationPricing; }
  return { provider, providerModelId, inputProviderCostPerMillion, outputProviderCostPerMillion, markupMultiplier, config, voiceName };
}
