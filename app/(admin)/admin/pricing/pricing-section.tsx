import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { setImagePromptTranslationModelAction } from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { AdminModelPricingSnapshotRow } from "@/lib/db/queries";

/** Heading for one of the Pricing page's top-level sections. */
export function PricingSectionHeading({
  description,
  title,
}: {
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div>
      <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Collapsible card built on <details>, so it stays a Server Component and
 * renders closed without client JavaScript.
 */
export function PricingDisclosure({
  children,
  description,
  headingLevel = 3,
  summaryId,
  title,
}: {
  children?: ReactNode;
  description?: ReactNode;
  headingLevel?: 2 | 3;
  summaryId?: string;
  title: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <details className="group overflow-hidden rounded-xl border bg-card shadow-xs">
      <summary
        className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition hover:bg-muted/40 [&::-webkit-details-marker]:hidden"
        id={summaryId}
      >
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
        />
        <div className="min-w-0">
          <Heading className="font-semibold text-base">{title}</Heading>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
      </summary>
      {children ? <div className="space-y-5 border-t px-5 py-5">{children}</div> : null}
    </details>
  );
}

export function ImagePromptTranslationModelForm({
  models,
  selectedModelId,
}: {
  models: AdminModelPricingSnapshotRow[];
  selectedModelId: string | null;
}) {
  const enabledChatModels = models.filter(
    (model) =>
      model.type === "chat" &&
      model.isEnabled &&
      !model.deletedAt &&
      Number(model.inputProviderCostPerMillion ?? 0) > 0 &&
      Number(model.outputProviderCostPerMillion ?? 0) > 0
  );
  return (
    <section className="rounded-xl border bg-card px-5 py-4 shadow-xs">
      <h3 className="font-semibold text-base">
        <EditableTranslation
          defaultText="Image prompt translation model"
          description="Heading for the image prompt translation model selector in Admin Pricing."
          translationKey="admin.pricing.image_translation_model"
        />
      </h3>
      <p className="mt-0.5 text-muted-foreground text-sm">
        <EditableTranslation
          defaultText="Choose which enabled text model translates Khasi prompts to English during image generation."
          description="Description for the image prompt translation model selector in Admin Pricing."
          translationKey="admin.pricing.image_translation_model_description"
        />
      </p>
      <form action={setImagePromptTranslationModelAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm" htmlFor="pricing-image-translation-model">
          <span className="font-medium">Translation model</span>
          <select className="h-10 w-full cursor-pointer rounded-lg border bg-background px-3 text-sm" defaultValue={selectedModelId ?? ""} id="pricing-image-translation-model" name="modelId">
            <option value="">Use server default translation model</option>
            {enabledChatModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} ({model.provider})</option>)}
          </select>
        </label>
        <ActionSubmitButton pendingLabel="Saving..." type="submit">Save translation model</ActionSubmitButton>
      </form>
    </section>
  );
}
