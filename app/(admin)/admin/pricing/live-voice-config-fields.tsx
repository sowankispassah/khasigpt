"use client";
import { useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { AdminModelPricingSnapshotRow } from "@/lib/db/queries";
import { GEMINI_VOICE_CHAT_MODEL_ID, GOOGLE_LIVE_VOICE_OPTIONS, LIVE_VOICE_MEDIA_RESOLUTION_OPTIONS } from "@/lib/voice/live";
import { DEFAULT_DURATION_VOICE_PRICING, GPT_LIVE_MODEL_ID, OPENAI_LIVE_VOICES, readDurationVoicePricing } from "@/lib/voice/pricing";
import { CostPlusPreviewCard, type PricingPreviewContext, TokenCostPlusFields } from "./cost-plus-pricing-fields";

const cls = "rounded-md border bg-background px-3 py-2 text-sm";
function Label({ name, children }: { name: string; children: string }) {
  return <EditableTranslation translationKey={`admin.pricing.live.${name}`} defaultText={children} description={`${children} in live voice model settings.`} />;
}
export function LiveVoiceConfigFields({ model, prefix, context }: { model?: AdminModelPricingSnapshotRow; prefix: string; context: PricingPreviewContext }) {
  const [provider, setProvider] = useState(model?.provider ?? "google");
  const duration = provider === "openai";
  const initial = readDurationVoicePricing(model?.config) ?? DEFAULT_DURATION_VOICE_PRICING;
  const [cost, setCost] = useState(String(initial.providerCostPerMinuteUsd));
  const [charge, setCharge] = useState(String(initial.customerChargePerMinuteUsd));
  const [voice, setVoice] = useState(model?.voiceName ?? "Zephyr");
  const markup = Number(charge) / Number(cost);
  const number = (name: string, text: string, value: number, onChange?: (v: string) => void) => <label htmlFor={`${prefix}-${name}`} className="flex flex-col gap-2"><Label name={name}>{text}</Label><input id={`${prefix}-${name}`} className={cls} name={name} type="number" min={0.000001} max={10000} step={0.000001} required defaultValue={onChange ? undefined : value} value={onChange ? (name === "providerCostPerMinuteUsd" ? cost : charge) : undefined} onChange={onChange ? e => onChange(e.target.value) : undefined} /></label>;
  return <>
    {!model ? <label htmlFor={`${prefix}-key`} className="flex flex-col gap-2"><Label name="key">Model key</Label><input id={`${prefix}-key`} className={cls} key={provider} name="key" required defaultValue={duration ? "gpt-live-1" : "gemini-live"} /></label> : <input name="id" type="hidden" value={model.id} />}
    <label htmlFor={`${prefix}-model`} className="flex flex-col gap-2"><Label name="model">Live voice model</Label><select id={`${prefix}-model`} className={`${cls} cursor-pointer`} value={provider} onChange={e => { setProvider(e.target.value); setVoice(e.target.value === "openai" ? "marin" : "Zephyr"); }}><option value="google">Google Gemini Live</option><option value="openai">OpenAI GPT-Live 1</option></select></label>
    <input name="provider" type="hidden" value={provider} />
    <label htmlFor={`${prefix}-providerModelId`} className="flex flex-col gap-2"><Label name="model_id">Provider model ID</Label><input className={cls} key={provider} id={`${prefix}-providerModelId`} name="providerModelId" defaultValue={duration ? GPT_LIVE_MODEL_ID : model?.provider === "google" ? model.providerModelId : GEMINI_VOICE_CHAT_MODEL_ID} readOnly={duration} required /></label>
    <label htmlFor={`${prefix}-displayName`} className="flex flex-col gap-2"><Label name="display_name">Display name</Label><input className={cls} key={provider} id={`${prefix}-displayName`} name="displayName" defaultValue={model?.provider === provider ? model.displayName : duration ? "GPT-Live 1" : "Gemini Live"} required /></label>
    <label htmlFor={`${prefix}-description`} className="flex flex-col gap-2 md:col-span-2"><Label name="description">Description</Label><textarea id={`${prefix}-description`} className={cls} name="description" defaultValue={model?.description ?? ""} /></label>
    <label htmlFor={`${prefix}-voiceName`} className="flex flex-col gap-2"><Label name="voice">Voice</Label><select className={`${cls} cursor-pointer`} id={`${prefix}-voiceName`} name="voiceName" value={voice} onChange={e => setVoice(e.target.value)}>{(duration ? OPENAI_LIVE_VOICES : GOOGLE_LIVE_VOICE_OPTIONS.map(v => v.value)).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    {!duration ? <label htmlFor={`${prefix}-mediaResolution`} className="flex flex-col gap-2"><Label name="resolution">Media resolution</Label><select className={cls} id={`${prefix}-mediaResolution`} name="mediaResolution" defaultValue={model?.mediaResolution ?? "MEDIA_RESOLUTION_MEDIUM"}>{LIVE_VOICE_MEDIA_RESOLUTION_OPTIONS.map(value => <option key={value.value} value={value.value}>{value.label}</option>)}</select></label> : null}
    {duration ? <>
      {number("providerCostPerMinuteUsd", "Provider cost (USD per minute)", initial.providerCostPerMinuteUsd, setCost)}
      {number("customerChargePerMinuteUsd", "Customer charge (USD per minute)", initial.customerChargePerMinuteUsd, setCharge)}
      <input name="markupMultiplier" type="hidden" value={Number.isFinite(markup) ? markup : 0} />
      <label htmlFor={`${prefix}-backendModel`} className="flex flex-col gap-2"><Label name="backendModel">Backend model</Label><input id={`${prefix}-backendModel`} className={cls} name="backendModel" defaultValue={initial.backendModel} required /></label>
      {number("inputProviderCostPerMillion", "Backend input cost (USD per 1M tokens)", initial.backendInputCostPerMillionUsd)}
      {number("backendCachedInputCostPerMillionUsd", "Backend cached input cost (USD per 1M tokens)", initial.backendCachedInputCostPerMillionUsd)}
      {number("outputProviderCostPerMillion", "Backend output cost (USD per 1M tokens)", initial.backendOutputCostPerMillionUsd)}
      <p className="text-muted-foreground text-sm md:col-span-2"><Label name="duration_help">Billed per second, including silence and muted time. WebRTC starts with 15 seconds credited toward the session total. Backend usage is charged separately at the same markup. Each session lasts up to 4 minutes; start a new session to continue.</Label></p>
      <div className="md:col-span-2"><CostPlusPreviewCard context={context} providerCostUsd={Number(cost)} markupMultiplier={markup} title={<Label name="minute_preview">Per minute of live voice</Label>} /></div>
    </> : <TokenCostPlusFields context={context} initialInputCost={Number(model?.inputProviderCostPerMillion ?? 3)} initialOutputCost={Number(model?.outputProviderCostPerMillion ?? 12)} initialMarkup={model?.markupMultiplier ?? 3} prefix={prefix} />}
    <label htmlFor={`${prefix}-configJson`} className="flex flex-col gap-2 md:col-span-2"><Label name="config">Additional configuration (JSON, optional)</Label><textarea className={cls} id={`${prefix}-configJson`} name="configJson" defaultValue={model?.config ? JSON.stringify(model.config, null, 2) : ""} /></label>
  </>;
}
