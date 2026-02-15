"use client";

import { Trigger } from "@radix-ui/react-select";
import { memo, useEffect, useMemo, useState } from "react";
import { useModelConfig } from "@/components/model-config-provider";
import { SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PromptInputModelSelect,
  PromptInputModelSelectContent,
} from "./elements/prompt-input";
import { ChevronDownIcon } from "./icons";

type ModelSelectorCompactProps = {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  className?: string;
};

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
  className,
}: ModelSelectorCompactProps) {
  const { models } = useModelConfig();
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === optimisticModelId),
    [models, optimisticModelId]
  );

  return (
    <PromptInputModelSelect
      onValueChange={(modelId) => {
        const model = models.find((item) => item.id === modelId);
        if (model) {
          setOptimisticModelId(model.id);
          onModelChange?.(model.id);
        }
      }}
      value={optimisticModelId}
    >
      <Trigger
        className={cn(
          "flex h-8 cursor-pointer items-center gap-2 rounded-lg border-0 bg-background px-2 text-foreground shadow-none transition-colors hover:bg-accent focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
          className
        )}
        type="button"
      >
        <span className="font-medium text-xs">
          {selectedModel?.name ?? "Model"}
        </span>
        <ChevronDownIcon size={16} />
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[260px] p-0">
        <div className="flex flex-col gap-px">
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="truncate font-medium text-xs">{model.name}</div>
              <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
                {model.description}
              </div>
            </SelectItem>
          ))}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

export const ModelSelectorCompact = memo(PureModelSelectorCompact);
