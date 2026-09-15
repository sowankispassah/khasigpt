"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { calculateCostPlusPreview } from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

export type PricingPreviewContext = {
  basePlanName: string | null;
  usdToInr: number;
  walletUnitsPerInr: number;
};

const inputClassName = "rounded-md border bg-background px-3 py-2 text-sm";

function formatNumber(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function FieldLabel({
  children,
  translationKey,
}: {
  children: string;
  translationKey: string;
}) {
  return (
    <span className="font-medium text-sm">
      <EditableTranslation
        defaultText={children}
        description={`${children} field label in Admin Pricing.`}
        translationKey={translationKey}
      />
    </span>
  );
}

export function CostPlusPreviewCard({
  context,
  providerCostUsd,
  markupMultiplier,
  title,
}: {
  context: PricingPreviewContext | null;
  providerCostUsd: number;
  markupMultiplier: number;
  title: string;
}) {
  const { translate } = useTranslation();
  const preview = useMemo(
    () =>
      context
        ? calculateCostPlusPreview({
            markupMultiplier,
            providerCostUsd,
            usdToInr: context.usdToInr,
            walletUnitsPerCredit: TOKENS_PER_CREDIT,
            walletUnitsPerInr: context.walletUnitsPerInr,
          })
        : null,
    [context, markupMultiplier, providerCostUsd]
  );

  return (
    <section className="rounded-lg border bg-muted/25 p-4">
      <h4 className="font-semibold text-sm">{title}</h4>
      {!context ? (
        <p className="mt-2 text-muted-foreground text-xs">
          {translate(
            "admin.pricing.preview.unavailable",
            "Add an active recharge plan to calculate customer charges and credits."
          )}
        </p>
      ) : !preview ? (
        <p className="mt-2 text-muted-foreground text-xs">
          {translate(
            "admin.pricing.preview.enter_cost",
            "Enter a provider cost greater than zero to see the calculation."
          )}
        </p>
      ) : (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-muted-foreground text-xs">
              {translate("admin.pricing.preview.provider_cost", "Provider cost")}
            </dt>
            <dd className="font-medium text-sm">₹{formatNumber(preview.providerCostInr, 4)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {translate("admin.pricing.preview.customer_charge", "Customer charge")}
            </dt>
            <dd className="font-medium text-sm">₹{formatNumber(preview.customerChargeInr, 4)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {translate("admin.pricing.preview.profit", "Profit")}
            </dt>
            <dd className="font-medium text-sm">₹{formatNumber(preview.profitInr, 4)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {translate("admin.pricing.preview.margin", "Profit margin")}
            </dt>
            <dd className="font-medium text-sm">{formatNumber(preview.marginPercent, 2)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {translate("admin.pricing.preview.credits", "Credits deducted")}
            </dt>
            <dd className="font-medium text-sm">{formatNumber(preview.credits, 2)}</dd>
          </div>
        </dl>
      )}
      {context?.basePlanName ? (
        <p className="mt-3 text-muted-foreground text-xs">
          {translate("admin.pricing.preview.base_plan", "Credit conversion: {plan}").replace(
            "{plan}",
            context.basePlanName
          )}
        </p>
      ) : null}
    </section>
  );
}

function PricingNumberField({
  id,
  label,
  max,
  min,
  name,
  onChange,
  required = true,
  step,
  translationKey,
  value,
}: {
  id: string;
  label: string;
  max?: number;
  min: number;
  name: string;
  onChange: (value: string) => void;
  required?: boolean;
  step: number;
  translationKey: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      <FieldLabel translationKey={translationKey}>{label}</FieldLabel>
      <input
        className={inputClassName}
        id={id}
        max={max}
        min={min}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

export function TokenCostPlusFields({
  context,
  initialInputCost,
  initialMarkup,
  initialOutputCost,
  prefix,
}: {
  context: PricingPreviewContext;
  initialInputCost: number;
  initialMarkup: number;
  initialOutputCost: number;
  prefix: string;
}) {
  const { translate } = useTranslation();
  const [inputCost, setInputCost] = useState(String(initialInputCost));
  const [outputCost, setOutputCost] = useState(String(initialOutputCost));
  const [markup, setMarkup] = useState(String(initialMarkup));
  const numericMarkup = Number(markup);

  return (
    <>
      <PricingNumberField
        id={`${prefix}-input-cost`}
        label="Provider input cost (USD / 1M tokens)"
        min={0.000001}
        name="inputProviderCostPerMillion"
        onChange={setInputCost}
        step={0.000001}
        translationKey="admin.pricing.provider_input_cost"
        value={inputCost}
      />
      <PricingNumberField
        id={`${prefix}-output-cost`}
        label="Provider output cost (USD / 1M tokens)"
        min={0.000001}
        name="outputProviderCostPerMillion"
        onChange={setOutputCost}
        step={0.000001}
        translationKey="admin.pricing.provider_output_cost"
        value={outputCost}
      />
      <PricingNumberField
        id={`${prefix}-markup`}
        label="Customer markup"
        max={20}
        min={1}
        name="markupMultiplier"
        onChange={setMarkup}
        step={0.01}
        translationKey="admin.pricing.markup"
        value={markup}
      />
      <div className="md:col-span-2">
        <div className="space-y-3">
          <CostPlusPreviewCard
            context={context}
            markupMultiplier={numericMarkup}
            providerCostUsd={Number(inputCost)}
            title={translate(
              "admin.pricing.preview.chat_input",
              "Input pricing per 1M tokens"
            )}
          />
          <CostPlusPreviewCard
            context={context}
            markupMultiplier={numericMarkup}
            providerCostUsd={Number(outputCost)}
            title={translate(
              "admin.pricing.preview.chat_output",
              "Output pricing per 1M tokens"
            )}
          />
        </div>
      </div>
    </>
  );
}

export function ImageCostPlusFields({
  context,
  initialCachedImageInputCost,
  initialCachedTextInputCost,
  initialCostType,
  initialImageInputCost,
  initialImageOutputCost,
  initialMarkup,
  initialProviderCost,
  initialTextInputCost,
  prefix,
}: {
  context: PricingPreviewContext;
  initialCachedImageInputCost: number;
  initialCachedTextInputCost: number;
  initialCostType: "per_generation" | "per_token";
  initialImageInputCost: number;
  initialImageOutputCost: number;
  initialMarkup: number;
  initialProviderCost: number;
  initialTextInputCost: number;
  prefix: string;
}) {
  const { translate } = useTranslation();
  const [costType, setCostType] = useState(initialCostType);
  const [textInputCost, setTextInputCost] = useState(
    String(initialTextInputCost)
  );
  const [imageOutputCost, setImageOutputCost] = useState(
    String(initialImageOutputCost)
  );
  const [imageInputCost, setImageInputCost] = useState(
    initialImageInputCost > 0 ? String(initialImageInputCost) : ""
  );
  const [cachedTextInputCost, setCachedTextInputCost] = useState(
    initialCachedTextInputCost > 0 ? String(initialCachedTextInputCost) : ""
  );
  const [cachedImageInputCost, setCachedImageInputCost] = useState(
    initialCachedImageInputCost > 0 ? String(initialCachedImageInputCost) : ""
  );
  const [providerCost, setProviderCost] = useState(String(initialProviderCost));
  const [markup, setMarkup] = useState(String(initialMarkup));

  return (
    <>
      <label className="flex flex-col gap-2" htmlFor={`${prefix}-cost-type`}>
        <FieldLabel translationKey="admin.pricing.image_cost_type">
          Provider Cost Type
        </FieldLabel>
        <select
          className={inputClassName}
          id={`${prefix}-cost-type`}
          name="providerCostType"
          onChange={(event) =>
            setCostType(event.target.value as "per_generation" | "per_token")
          }
          value={costType}
        >
          <option value="per_generation">
            {translate("admin.pricing.image_cost_type.generation", "Per Generation")}
          </option>
          <option value="per_token">
            {translate("admin.pricing.image_cost_type.token", "Per Token")}
          </option>
        </select>
      </label>
      {costType === "per_generation" ? (
        <PricingNumberField
          id={`${prefix}-provider-cost`}
          label="Provider cost (USD / completed image)"
          min={0.000001}
          name="providerCostPerOutputUsd"
          onChange={setProviderCost}
          step={0.000001}
          translationKey="admin.pricing.provider_image_cost"
          value={providerCost}
        />
      ) : (
        <>
          <PricingNumberField
            id={`${prefix}-text-input-cost`}
            label="Text Input cost per 1M tokens"
            min={0.000001}
            name="textInputProviderCostPerMillion"
            onChange={setTextInputCost}
            step={0.000001}
            translationKey="admin.pricing.image_text_input_cost"
            value={textInputCost}
          />
          <PricingNumberField
            id={`${prefix}-image-output-cost`}
            label="Image Output cost per 1M tokens"
            min={0.000001}
            name="imageOutputProviderCostPerMillion"
            onChange={setImageOutputCost}
            step={0.000001}
            translationKey="admin.pricing.image_image_output_cost"
            value={imageOutputCost}
          />
          <PricingNumberField
            id={`${prefix}-image-input-cost`}
            label="Image Input cost per 1M tokens (optional)"
            min={0}
            name="imageInputProviderCostPerMillion"
            onChange={setImageInputCost}
            required={false}
            step={0.000001}
            translationKey="admin.pricing.image_image_input_cost"
            value={imageInputCost}
          />
          <PricingNumberField
            id={`${prefix}-cached-text-input-cost`}
            label="Cached Text Input cost per 1M tokens (optional)"
            min={0}
            name="cachedTextInputProviderCostPerMillion"
            onChange={setCachedTextInputCost}
            required={false}
            step={0.000001}
            translationKey="admin.pricing.image_cached_text_input_cost"
            value={cachedTextInputCost}
          />
          <PricingNumberField
            id={`${prefix}-cached-image-input-cost`}
            label="Cached Image Input cost per 1M tokens (optional)"
            min={0}
            name="cachedImageInputProviderCostPerMillion"
            onChange={setCachedImageInputCost}
            required={false}
            step={0.000001}
            translationKey="admin.pricing.image_cached_image_input_cost"
            value={cachedImageInputCost}
          />
        </>
      )}
      <PricingNumberField
        id={`${prefix}-markup`}
        label="Customer markup"
        max={20}
        min={1}
        name="markupMultiplier"
        onChange={setMarkup}
        step={0.01}
        translationKey="admin.pricing.markup"
        value={markup}
      />
      <div className="md:col-span-2">
        {costType === "per_generation" ? (
          <CostPlusPreviewCard
            context={context}
            markupMultiplier={Number(markup)}
            providerCostUsd={Number(providerCost)}
            title={translate(
              "admin.pricing.preview.image_output",
              "Pricing per completed image"
            )}
          />
        ) : (
          <div className="space-y-3">
            <CostPlusPreviewCard
              context={context}
              markupMultiplier={Number(markup)}
              providerCostUsd={Number(textInputCost)}
              title={translate(
                "admin.pricing.preview.image_text_input_tokens",
                "Text input pricing per 1M tokens"
              )}
            />
            <CostPlusPreviewCard
              context={context}
              markupMultiplier={Number(markup)}
              providerCostUsd={Number(imageOutputCost)}
              title={translate(
                "admin.pricing.preview.image_image_output_tokens",
                "Image output pricing per 1M tokens"
              )}
            />
            {Number(imageInputCost) > 0 ? (
              <CostPlusPreviewCard
                context={context}
                markupMultiplier={Number(markup)}
                providerCostUsd={Number(imageInputCost)}
                title={translate(
                  "admin.pricing.preview.image_image_input_tokens",
                  "Image input pricing per 1M tokens"
                )}
              />
            ) : null}
            {Number(cachedTextInputCost) > 0 ? (
              <CostPlusPreviewCard
                context={context}
                markupMultiplier={Number(markup)}
                providerCostUsd={Number(cachedTextInputCost)}
                title={translate(
                  "admin.pricing.preview.image_cached_text_input_tokens",
                  "Cached text input pricing per 1M tokens"
                )}
              />
            ) : null}
            {Number(cachedImageInputCost) > 0 ? (
              <CostPlusPreviewCard
                context={context}
                markupMultiplier={Number(markup)}
                providerCostUsd={Number(cachedImageInputCost)}
                title={translate(
                  "admin.pricing.preview.image_cached_image_input_tokens",
                  "Cached image input pricing per 1M tokens"
                )}
              />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
