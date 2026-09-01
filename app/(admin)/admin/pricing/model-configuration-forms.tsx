import {
  createImageModelConfigAction,
  createLiveVoiceModelConfigAction,
  createModelConfigAction,
  updateImageModelConfigAction,
  updateLiveVoiceModelConfigAction,
  updateModelConfigAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { DEFAULT_FREE_MESSAGES_PER_DAY } from "@/lib/constants";
import type { AdminModelPricingSnapshotRow } from "@/lib/db/queries";
import {
  GOOGLE_LIVE_VOICE_OPTIONS,
  LIVE_VOICE_MEDIA_RESOLUTION_OPTIONS,
} from "@/lib/voice/live";
import {
  type PricingPreviewContext,
  TokenCostPlusFields,
  UnitCostPlusFields,
} from "./cost-plus-pricing-fields";

const PROVIDER_OPTIONS = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google Gemini", value: "google" },
  { label: "Custom", value: "custom" },
] as const;

const inputClassName = "rounded-md border bg-background px-3 py-2 text-sm";
const textareaClassName = `${inputClassName} min-h-[88px]`;

function FieldLabel({
  children,
  description,
  translationKey,
}: {
  children: string;
  description: string;
  translationKey: string;
}) {
  return (
    <span className="font-medium text-sm">
      <EditableTranslation
        defaultText={children}
        description={description}
        translationKey={translationKey}
      />
    </span>
  );
}

function TextField({
  defaultValue,
  id,
  label,
  name,
  required = false,
  translationKey,
}: {
  defaultValue?: string;
  id: string;
  label: string;
  name: string;
  required?: boolean;
  translationKey: string;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <FieldLabel
        description={`Label for ${label.toLowerCase()} in the Admin Pricing model editor.`}
        translationKey={translationKey}
      >
        {label}
      </FieldLabel>
      <input
        className={inputClassName}
        defaultValue={defaultValue}
        id={id}
        name={name}
        required={required}
      />
    </label>
  );
}

function NumberField({
  defaultValue,
  id,
  label,
  max,
  min = 0,
  name,
  step = 0.000001,
  translationKey,
}: {
  defaultValue: number;
  id: string;
  label: string;
  max?: number;
  min?: number;
  name: string;
  step?: number;
  translationKey: string;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <FieldLabel
        description={`Label for ${label.toLowerCase()} in the Admin Pricing model editor.`}
        translationKey={translationKey}
      >
        {label}
      </FieldLabel>
      <input
        className={inputClassName}
        defaultValue={defaultValue}
        id={id}
        max={max}
        min={min}
        name={name}
        required
        step={step}
        type="number"
      />
    </label>
  );
}

function TextareaField({
  defaultValue,
  id,
  label,
  name,
  translationKey,
}: {
  defaultValue?: string;
  id: string;
  label: string;
  name: string;
  translationKey: string;
}) {
  return (
    <label className="flex flex-col gap-2 md:col-span-2" htmlFor={id}>
      <FieldLabel
        description={`Label for ${label.toLowerCase()} in the Admin Pricing model editor.`}
        translationKey={translationKey}
      >
        {label}
      </FieldLabel>
      <textarea
        className={textareaClassName}
        defaultValue={defaultValue}
        id={id}
        name={name}
      />
    </label>
  );
}

function CheckboxField({
  defaultChecked = false,
  id,
  label,
  name,
  translationKey,
}: {
  defaultChecked?: boolean;
  id: string;
  label: string;
  name: string;
  translationKey: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3" htmlFor={id}>
      <input
        className="h-4 w-4"
        defaultChecked={defaultChecked}
        id={id}
        name={name}
        type="checkbox"
        value="true"
      />
      <input name={name} type="hidden" value="false" />
      <FieldLabel
        description={`Checkbox for ${label.toLowerCase()} in the Admin Pricing model editor.`}
        translationKey={translationKey}
      >
        {label}
      </FieldLabel>
    </label>
  );
}

function ProviderField({ defaultValue, id }: { defaultValue: string; id: string }) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <FieldLabel
        description="Provider selector label in the Admin Pricing model editor."
        translationKey="admin.pricing.model_form.provider"
      >
        Provider
      </FieldLabel>
      <select
        className={inputClassName}
        defaultValue={defaultValue}
        id={id}
        name="provider"
        required
      >
        {PROVIDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommonFields({
  model,
  prefix,
  provider = "openai",
}: {
  model?: AdminModelPricingSnapshotRow;
  prefix: string;
  provider?: string;
}) {
  return (
    <>
      {model ? <input name="id" type="hidden" value={model.id} /> : (
        <TextField
          id={`${prefix}-key`}
          label="Model key"
          name="key"
          required
          translationKey="admin.pricing.model_form.key"
        />
      )}
      <ProviderField defaultValue={model?.provider ?? provider} id={`${prefix}-provider`} />
      <TextField
        defaultValue={model?.providerModelId}
        id={`${prefix}-provider-model-id`}
        label="Provider model ID"
        name="providerModelId"
        required
        translationKey="admin.pricing.model_form.provider_model_id"
      />
      <TextField
        defaultValue={model?.displayName}
        id={`${prefix}-display-name`}
        label="Display name"
        name="displayName"
        required
        translationKey="admin.pricing.model_form.display_name"
      />
      <TextareaField
        defaultValue={model?.description}
        id={`${prefix}-description`}
        label="Description"
        name="description"
        translationKey="admin.pricing.model_form.description"
      />
      <TextareaField
        defaultValue={model?.config ? JSON.stringify(model.config, null, 2) : ""}
        id={`${prefix}-config`}
        label="Provider config (JSON, optional)"
        name="configJson"
        translationKey="admin.pricing.model_form.config"
      />
    </>
  );
}

function SubmitRow({ create }: { create: boolean }) {
  return (
    <div className="flex justify-end md:col-span-2">
      <ActionSubmitButton
        pendingLabel={create ? "Creating..." : "Saving..."}
        type="submit"
      >
        {create ? "Create model" : "Save changes"}
      </ActionSubmitButton>
    </div>
  );
}

export function ChatModelConfigurationForm({
  context,
  model,
}: {
  context: PricingPreviewContext;
  model?: AdminModelPricingSnapshotRow;
}) {
  const create = !model;
  const prefix = model ? `chat-model-${model.id}` : "chat-model-create";
  return (
    <form
      action={create ? createModelConfigAction : updateModelConfigAction}
      className="grid gap-4 md:grid-cols-2"
    >
      <CommonFields model={model} prefix={prefix} />
      <NumberField
        defaultValue={model?.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY}
        id={`${prefix}-free-messages`}
        label="Daily free messages"
        name="freeMessagesPerDay"
        step={1}
        translationKey="admin.pricing.model_form.free_messages"
      />
      <TokenCostPlusFields
        context={context}
        initialInputCost={Number(model?.inputProviderCostPerMillion ?? 0)}
        initialMarkup={Number(model?.markupMultiplier ?? 4)}
        initialOutputCost={Number(model?.outputProviderCostPerMillion ?? 0)}
        prefix={prefix}
      />
      <TextareaField
        defaultValue={model?.systemPrompt ?? ""}
        id={`${prefix}-system-prompt`}
        label="Model-specific prompt (optional)"
        name="systemPrompt"
        translationKey="admin.models.model_prompt.title"
      />
      <TextareaField
        defaultValue={model?.codeTemplate ?? ""}
        id={`${prefix}-code-template`}
        label="Provider code snippet (optional)"
        name="codeTemplate"
        translationKey="admin.pricing.model_form.code_template"
      />
      <TextField
        defaultValue={model?.reasoningTag ?? ""}
        id={`${prefix}-reasoning-tag`}
        label="Reasoning tag"
        name="reasoningTag"
        translationKey="admin.pricing.model_form.reasoning_tag"
      />
      <CheckboxField
        defaultChecked={model?.isEnabled ?? true}
        id={`${prefix}-enabled`}
        label="Enabled"
        name="isEnabled"
        translationKey="admin.pricing.model_form.enabled"
      />
      <CheckboxField
        defaultChecked={model?.supportsReasoning ?? false}
        id={`${prefix}-reasoning`}
        label="Supports reasoning traces"
        name="supportsReasoning"
        translationKey="admin.pricing.model_form.supports_reasoning"
      />
      {create ? (
        <CheckboxField id={`${prefix}-default`} label="Set as default model" name="isDefault" translationKey="admin.pricing.model_form.default_chat" />
      ) : null}
      <SubmitRow create={create} />
    </form>
  );
}

export function ImageModelConfigurationForm({
  context,
  model,
}: {
  context: PricingPreviewContext;
  model?: AdminModelPricingSnapshotRow;
}) {
  const create = !model;
  const prefix = model ? `image-model-${model.id}` : "image-model-create";
  return (
    <form
      action={create ? createImageModelConfigAction : updateImageModelConfigAction}
      className="grid gap-4 md:grid-cols-2"
    >
      <CommonFields model={model} prefix={prefix} provider="google" />
      <UnitCostPlusFields
        context={context}
        initialMarkup={Number(model?.markupMultiplier ?? 2)}
        initialProviderCost={Number(model?.providerCostPerOutputUsd ?? 0)}
        prefix={prefix}
      />
      <CheckboxField
        defaultChecked={model?.isEnabled ?? true}
        id={`${prefix}-enabled`}
        label="Enabled"
        name="isEnabled"
        translationKey="admin.pricing.model_form.enabled"
      />
      {create ? (
        <CheckboxField id={`${prefix}-active`} label="Set as active image model" name="isActive" translationKey="admin.pricing.model_form.active_image" />
      ) : null}
      <SubmitRow create={create} />
    </form>
  );
}

export function LiveVoiceModelConfigurationForm({
  model,
}: {
  model?: AdminModelPricingSnapshotRow;
}) {
  const create = !model;
  const prefix = model ? `voice-model-${model.id}` : "voice-model-create";
  return (
    <form
      action={create ? createLiveVoiceModelConfigAction : updateLiveVoiceModelConfigAction}
      className="grid gap-4 md:grid-cols-2"
    >
      <CommonFields model={model} prefix={prefix} provider="google" />
      <TextareaField
        defaultValue={model?.systemInstruction ?? ""}
        id={`${prefix}-system-instruction`}
        label="Live voice system instruction"
        name="systemInstruction"
        translationKey="admin.pricing.model_form.voice_instruction"
      />
      <label className="flex flex-col gap-2" htmlFor={`${prefix}-voice`}>
        <FieldLabel description="Voice selector label in the Admin Pricing model editor." translationKey="admin.pricing.model_form.voice_name">Voice</FieldLabel>
        <select className={inputClassName} defaultValue={model?.voiceName ?? "Zephyr"} id={`${prefix}-voice`} name="voiceName">
          {GOOGLE_LIVE_VOICE_OPTIONS.map((voice) => <option key={voice.value} value={voice.value}>{voice.label} · {voice.description}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-2" htmlFor={`${prefix}-resolution`}>
        <FieldLabel description="Media-resolution selector label in the Admin Pricing model editor." translationKey="admin.pricing.model_form.media_resolution">Media resolution</FieldLabel>
        <select className={inputClassName} defaultValue={model?.mediaResolution ?? "MEDIA_RESOLUTION_MEDIUM"} id={`${prefix}-resolution`} name="mediaResolution">
          {LIVE_VOICE_MEDIA_RESOLUTION_OPTIONS.map((resolution) => <option key={resolution.value} value={resolution.value}>{resolution.label}</option>)}
        </select>
      </label>
      <NumberField
        defaultValue={Number(model?.inputProviderCostPerMillion ?? 0)}
        id={`${prefix}-input-cost`}
        label="Provider input cost (USD / 1M tokens)"
        name="inputProviderCostPerMillion"
        translationKey="admin.pricing.provider_input_cost"
      />
      <NumberField
        defaultValue={Number(model?.outputProviderCostPerMillion ?? 0)}
        id={`${prefix}-output-cost`}
        label="Provider output cost (USD / 1M tokens)"
        name="outputProviderCostPerMillion"
        translationKey="admin.pricing.provider_output_cost"
      />
      <NumberField
        defaultValue={Number(model?.markupMultiplier ?? 3)}
        id={`${prefix}-markup`}
        label="Customer markup"
        max={20}
        min={1}
        name="markupMultiplier"
        step={0.01}
        translationKey="admin.pricing.markup"
      />
      <NumberField
        defaultValue={Number(model?.creditMultiplier ?? model?.markupMultiplier ?? 3)}
        id={`${prefix}-credit-multiplier`}
        label="Legacy credit multiplier"
        max={20}
        min={1}
        name="creditMultiplier"
        step={0.01}
        translationKey="admin.pricing.model_form.voice_credit_multiplier"
      />
      <CheckboxField defaultChecked={model?.isEnabled ?? true} id={`${prefix}-enabled`} label="Enabled" name="isEnabled" translationKey="admin.pricing.model_form.enabled" />
      <CheckboxField defaultChecked={model?.enabledOnWeb ?? true} id={`${prefix}-web`} label="Enabled on web" name="enabledOnWeb" translationKey="admin.pricing.model_form.enabled_web" />
      <CheckboxField defaultChecked={model?.enabledOnNative ?? true} id={`${prefix}-native`} label="Enabled on native" name="enabledOnNative" translationKey="admin.pricing.model_form.enabled_native" />
      {create ? <CheckboxField id={`${prefix}-default`} label="Set as default live voice model" name="isDefault" translationKey="admin.pricing.model_form.default_voice" /> : null}
      <SubmitRow create={create} />
    </form>
  );
}
