"use client";

import { useRouter } from "next/navigation";
import { memo, useTransition } from "react";
import { useWindowSize } from "usehooks-ts";

import { startGlobalProgress } from "@/lib/ui/global-progress";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { ModelSelectorCompact } from "@/components/model-selector-compact";

import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const [isPending, startTransition] = useTransition();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 pr-[5rem] md:px-2 md:pr-[5rem]">
      <SidebarToggle />

      {!isReadonly && (
        <div className="flex items-center gap-2">
          <VisibilitySelector
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
          />
          <ModelSelectorCompact
            className="shrink-0"
            onModelChange={onModelChange}
            selectedModelId={selectedModelId}
          />
        </div>
      )}

      <div className="-mr-2 order-2 ml-auto flex items-center gap-3 md:order-3">
        {(!open || windowWidth < 768) && (
          <Button
            aria-busy={isPending}
            className="h-8 px-2 md:h-fit md:px-2"
            disabled={isPending}
            onClick={() => {
              if (isPending) {
                return;
              }
              startGlobalProgress();
              startTransition(() => {
                router.push("/");
              });
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        )}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.selectedModelId === nextProps.selectedModelId &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
